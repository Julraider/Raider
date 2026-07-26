import type { ChatMessage, ChatRequest, ChatResponse, ToolUse } from "@raider/shared";
import { MissingApiKeyError, ProviderError } from "./errors";
import { type Provider, readSseLines, type StreamChunk } from "./provider";

// Bequemer Re-Export, damit Aufrufer die Fehler aus einem Ort beziehen können.
export { MissingApiKeyError, ProviderError } from "./errors";

/**
 * Adapter für Anthropic (Claude). Ruft die Messages-API mit dem eingebauten
 * fetch auf und gibt IMMER das interne Nachrichtenformat zurück — das rohe
 * Anbieterformat verlässt dieses Modul nie.
 */

/** Konfiguration mit garantiertem Key (für den Low-Level-Aufruf). */
export interface AnthropicConfig {
  apiKey: string;
  /** Basis-URL, z. B. https://api.anthropic.com (per ANTHROPIC_BASE_URL setzbar). */
  baseUrl: string;
  defaultModel: string;
  defaultMaxTokens: number;
}

/** Konfiguration wie sie der Core hält — Key kann fehlen. */
export interface AnthropicProviderConfig {
  apiKey?: string | undefined;
  baseUrl: string;
  defaultModel: string;
  defaultMaxTokens: number;
}

/** Version der Anthropic-API (fester Wert laut Anbieter-Doku). */
const ANTHROPIC_VERSION = "2023-06-01";

/** Rohe Antwortstruktur der Anthropic Messages-API — nur modulintern. */
interface RawAnthropicResponse {
  model: string;
  stop_reason: string | null;
  content: Array<{
    type: string;
    text?: string;
    id?: string;
    name?: string;
    input?: Record<string, unknown>;
  }>;
  usage: { input_tokens: number; output_tokens: number };
}

/** Ein Inhaltsblock, wie ihn die Messages-API erwartet. */
type ContentBlock =
  | { type: "text"; text: string }
  | { type: "tool_use"; id: string; name: string; input: Record<string, unknown> }
  | { type: "tool_result"; tool_use_id: string; content: string; is_error?: boolean };

/**
 * Wandelt eine interne Nachricht in das Anbieterformat. Nachrichten mit
 * Werkzeug-Anteilen brauchen Inhaltsblöcke statt einfachem Text; alles andere
 * bleibt ein schlichter String, damit sich am bisherigen Verhalten nichts
 * ändert.
 */
function toRawMessage(message: ChatMessage): { role: string; content: string | ContentBlock[] } {
  if (message.toolUses && message.toolUses.length > 0) {
    const blocks: ContentBlock[] = [];
    if (message.content.trim() !== "") blocks.push({ type: "text", text: message.content });
    for (const use of message.toolUses) {
      blocks.push({ type: "tool_use", id: use.id, name: use.name, input: use.input });
    }
    return { role: message.role, content: blocks };
  }

  if (message.toolResults && message.toolResults.length > 0) {
    const blocks: ContentBlock[] = message.toolResults.map((result) => ({
      type: "tool_result" as const,
      tool_use_id: result.toolUseId,
      content: result.content,
      ...(result.isError ? { is_error: true } : {}),
    }));
    return { role: "user", content: blocks };
  }

  return { role: message.role, content: message.content };
}

/** Baut einen Anthropic-Provider; ohne Key wirft er beim Aufruf MissingApiKeyError. */
export function createAnthropicProvider(config: AnthropicProviderConfig): Provider {
  return {
    complete(request) {
      if (!config.apiKey) throw new MissingApiKeyError();
      return complete({ ...config, apiKey: config.apiKey }, request);
    },
    stream(request) {
      if (!config.apiKey) throw new MissingApiKeyError();
      return stream({ ...config, apiKey: config.apiKey }, request);
    },
  };
}

/** Baut den Anfrage-Körper für die Messages-API (geteilt von complete und stream). */
function buildBody(config: AnthropicConfig, request: ChatRequest): Record<string, unknown> {
  const system = request.system ?? extractSystem(request.messages);
  return {
    model: request.model ?? config.defaultModel,
    max_tokens: request.maxTokens ?? config.defaultMaxTokens,
    ...(system ? { system } : {}),
    ...(request.tools && request.tools.length > 0
      ? {
          tools: request.tools.map((tool) => ({
            name: tool.name,
            description: tool.description,
            input_schema: tool.inputSchema,
          })),
        }
      : {}),
    messages: request.messages.filter((message) => message.role !== "system").map(toRawMessage),
  };
}

/**
 * Streamt eine Antwort. Text kommt in kleinen Häppchen; Werkzeug-Anforderungen
 * sammelt der Adapter über mehrere `input_json_delta`-Stücke ein und liefert
 * sie erst am Ende vollständig mit — ein halb übertragenes JSON-Argument wäre
 * für die Werkzeugschleife wertlos.
 */
async function* stream(config: AnthropicConfig, request: ChatRequest): AsyncGenerator<StreamChunk> {
  const response = await fetch(`${config.baseUrl}/v1/messages`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": config.apiKey,
      "anthropic-version": ANTHROPIC_VERSION,
    },
    body: JSON.stringify({ ...buildBody(config, request), stream: true }),
  });

  if (!response.ok) throw new ProviderError(response.status, await readErrorMessage(response));
  if (!response.body) throw new ProviderError(502, "Antwort ohne Datenstrom erhalten.");

  let text = "";
  let model = request.model ?? config.defaultModel;
  let stopReason: string | null = null;
  let inputTokens = 0;
  let outputTokens = 0;
  // Werkzeug-Blöcke werden über mehrere Ereignisse hinweg zusammengesetzt.
  const partials = new Map<number, { id: string; name: string; json: string }>();
  const toolUses: ToolUse[] = [];

  for await (const payload of readSseLines(response.body)) {
    if (payload === "[DONE]") break;
    let event: RawStreamEvent;
    try {
      event = JSON.parse(payload) as RawStreamEvent;
    } catch {
      continue; // Unvollständige Zeile — überspringen statt abzubrechen.
    }

    switch (event.type) {
      case "message_start":
        model = event.message?.model ?? model;
        inputTokens = event.message?.usage?.input_tokens ?? inputTokens;
        break;
      case "content_block_start":
        if (event.content_block?.type === "tool_use" && event.index !== undefined) {
          partials.set(event.index, {
            id: event.content_block.id ?? "",
            name: event.content_block.name ?? "",
            json: "",
          });
        }
        break;
      case "content_block_delta": {
        if (event.delta?.type === "text_delta" && event.delta.text) {
          text += event.delta.text;
          yield { type: "text", text: event.delta.text };
        } else if (event.delta?.type === "input_json_delta" && event.index !== undefined) {
          const partial = partials.get(event.index);
          if (partial) partial.json += event.delta.partial_json ?? "";
        }
        break;
      }
      case "content_block_stop": {
        if (event.index === undefined) break;
        const partial = partials.get(event.index);
        if (partial) {
          toolUses.push({ id: partial.id, name: partial.name, input: parseInput(partial.json) });
          partials.delete(event.index);
        }
        break;
      }
      case "message_delta":
        stopReason = event.delta?.stop_reason ?? stopReason;
        outputTokens = event.usage?.output_tokens ?? outputTokens;
        break;
      default:
        break;
    }
  }

  yield {
    type: "done",
    response: {
      role: "assistant",
      content: text,
      model,
      stopReason,
      usage: { inputTokens, outputTokens },
      ...(toolUses.length > 0 ? { toolUses } : {}),
    },
  };
}

/** Werkzeug-Argumente kommen als JSON-Text; leer bedeutet „keine Argumente". */
function parseInput(json: string): Record<string, unknown> {
  if (json.trim() === "") return {};
  try {
    const value = JSON.parse(json) as unknown;
    return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

/** Ereignisse des Anthropic-Streams — nur modulintern. */
interface RawStreamEvent {
  type: string;
  index?: number;
  message?: { model?: string; usage?: { input_tokens?: number } };
  content_block?: { type?: string; id?: string; name?: string };
  delta?: {
    type?: string;
    text?: string;
    partial_json?: string;
    stop_reason?: string | null;
  };
  usage?: { output_tokens?: number };
}

/** Ruft ein Modell auf und gibt die Antwort im internen Format zurück. */
export async function complete(
  config: AnthropicConfig,
  request: ChatRequest,
): Promise<ChatResponse> {
  const body = buildBody(config, request);

  const response = await fetch(`${config.baseUrl}/v1/messages`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": config.apiKey,
      "anthropic-version": ANTHROPIC_VERSION,
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    throw new ProviderError(response.status, await readErrorMessage(response));
  }

  const raw = (await response.json()) as RawAnthropicResponse;
  return toInternal(raw);
}

/** Wandelt die rohe Anbieterantwort ins interne Format. */
function toInternal(raw: RawAnthropicResponse): ChatResponse {
  const content = raw.content
    .filter((block) => block.type === "text" && typeof block.text === "string")
    .map((block) => block.text as string)
    .join("");

  // Werkzeug-Anforderungen wurden früher stillschweigend verworfen — dadurch
  // konnte das Modell nie ein Werkzeug benutzen.
  const toolUses = raw.content
    .filter((block) => block.type === "tool_use" && block.id && block.name)
    .map((block) => ({
      id: block.id as string,
      name: block.name as string,
      input: block.input ?? {},
    }));

  return {
    role: "assistant",
    content,
    model: raw.model,
    stopReason: raw.stop_reason,
    usage: {
      inputTokens: raw.usage.input_tokens,
      outputTokens: raw.usage.output_tokens,
    },
    ...(toolUses.length > 0 ? { toolUses } : {}),
  };
}

/** Fügt System-Nachrichten zu einem einzigen Systemprompt zusammen. */
function extractSystem(messages: ChatMessage[]): string | undefined {
  const parts = messages
    .filter((message) => message.role === "system")
    .map((message) => message.content);
  return parts.length > 0 ? parts.join("\n\n") : undefined;
}

/** Liest eine sprechende Fehlermeldung aus der Anbieterantwort. */
async function readErrorMessage(response: Response): Promise<string> {
  try {
    const data = (await response.json()) as { error?: { message?: string } };
    return data.error?.message ?? response.statusText;
  } catch {
    return response.statusText;
  }
}
