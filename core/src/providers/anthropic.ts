import type { ChatMessage, ChatRequest, ChatResponse } from "@raider/shared";
import { MissingApiKeyError, ProviderError } from "./errors";
import type { Provider } from "./provider";

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
  };
}

/** Ruft ein Modell auf und gibt die Antwort im internen Format zurück. */
export async function complete(
  config: AnthropicConfig,
  request: ChatRequest,
): Promise<ChatResponse> {
  const system = request.system ?? extractSystem(request.messages);
  const messages = request.messages
    .filter((message) => message.role !== "system")
    .map(toRawMessage);

  const body = {
    model: request.model ?? config.defaultModel,
    max_tokens: request.maxTokens ?? config.defaultMaxTokens,
    ...(system ? { system } : {}),
    // Werkzeuge nur mitschicken, wenn welche freigegeben sind.
    ...(request.tools && request.tools.length > 0
      ? {
          tools: request.tools.map((tool) => ({
            name: tool.name,
            description: tool.description,
            input_schema: tool.inputSchema,
          })),
        }
      : {}),
    messages,
  };

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
