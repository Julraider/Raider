import type { ChatMessage, ChatRequest, ChatResponse, ToolUse } from "@raider/shared";
import {
  isRetryableStatus,
  MAX_RETRIES,
  MissingApiKeyError,
  ProviderError,
  retryDelayMs,
} from "./errors";
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
  /** Zeitlimit für eine nicht-streamende Antwort in ms (Vorgabe 120000). */
  requestTimeoutMs?: number;
  /** Zeitlimit bis zum ersten Streaming-Stück in ms (Vorgabe 60000). */
  streamConnectTimeoutMs?: number;
  /** Höchste erlaubte Pause zwischen zwei Streaming-Stücken in ms (Vorgabe 60000). */
  streamIdleTimeoutMs?: number;
}

/** Konfiguration wie sie der Core hält — Key kann fehlen. */
export interface AnthropicProviderConfig {
  apiKey?: string | undefined;
  baseUrl: string;
  defaultModel: string;
  defaultMaxTokens: number;
  requestTimeoutMs?: number;
  streamConnectTimeoutMs?: number;
  streamIdleTimeoutMs?: number;
}

/** Version der Anthropic-API (fester Wert laut Anbieter-Doku). */
const ANTHROPIC_VERSION = "2023-06-01";

/** Vorgabewerte für die Zeitlimits — überschreibbar über die Config. */
const DEFAULT_REQUEST_TIMEOUT_MS = 120_000;
const DEFAULT_STREAM_CONNECT_TIMEOUT_MS = 60_000;
const DEFAULT_STREAM_IDLE_TIMEOUT_MS = 60_000;

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

/** Node/Browser markieren einen abgebrochenen fetch/read so — modulintern geprüft. */
function isAbortError(err: unknown): boolean {
  return err instanceof Error && err.name === "AbortError";
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Rennt ein Promise gegen ein Zeitlimit. Läuft die Zeit ab, wird der zugehörige
 * AbortController ausgelöst — nicht nur, um das Promise „aufzugeben", sondern
 * damit die zugrunde liegende Verbindung wirklich geschlossen wird und nicht
 * als hängender Socket weiterlebt. In beiden Fällen (unser eigener Abbruch
 * oder ein zufällig gleichzeitiger AbortError aus dem Promise selbst) kommt
 * am Ende dieselbe laienverständliche Zeitüberschreitungs-Meldung heraus statt
 * einer rohen `AbortError`-Ausnahme.
 */
async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  controller: AbortController,
): Promise<T> {
  const timeoutError = new ProviderError(
    504,
    `Keine Antwort innerhalb von ${timeoutMs} ms erhalten.`,
    "Der Anbieter hat zu lange nicht geantwortet.",
  );
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      reject(timeoutError);
    }, timeoutMs);
  });
  try {
    return await Promise.race([promise, timeout]);
  } catch (err) {
    if (err === timeoutError || isAbortError(err)) throw timeoutError;
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Reicht die Stücke eines Async-Iterables durch, bricht aber ab, wenn zwischen
 * zwei Stücken zu viel Zeit vergeht. WICHTIG: Das Zeitlimit gilt je Stück, nie
 * für die Gesamtdauer — eine lange, aber stetig fließende Antwort ist legitim,
 * nur eine Pause ohne jedes Lebenszeichen deutet auf einen toten Anbieter hin.
 * Das erste Stück bekommt sein eigenes (meist großzügigeres) Zeitlimit, weil
 * Verbindungsaufbau und erste Modellausgabe länger dauern können als die Pause
 * zwischen zwei bereits laufenden Stücken.
 */
async function* withChunkTimeout<T>(
  source: AsyncIterable<T>,
  firstTimeoutMs: number,
  idleTimeoutMs: number,
  controller: AbortController,
): AsyncGenerator<T> {
  const iterator = source[Symbol.asyncIterator]();
  try {
    let timeoutMs = firstTimeoutMs;
    while (true) {
      const step = await withTimeout(iterator.next(), timeoutMs, controller);
      if (step.done) return;
      timeoutMs = idleTimeoutMs;
      yield step.value;
    }
  } finally {
    // for-await-of ruft bei break/throw automatisch .return() auf uns auf —
    // das müssen wir an den inneren Iterator weiterreichen, sonst bleibt der
    // Reader von readSseLines gesperrt (siehe dessen eigenes finally).
    await iterator.return?.();
  }
}

/**
 * Streamt eine Antwort. Text kommt in kleinen Häppchen; Werkzeug-Anforderungen
 * sammelt der Adapter über mehrere `input_json_delta`-Stücke ein und liefert
 * sie erst am Ende vollständig mit — ein halb übertragenes JSON-Argument wäre
 * für die Werkzeugschleife wertlos.
 *
 * Kein Wiederholungsversuch bei Fehlern: Ist der Stream erst einmal
 * angelaufen, hat der Nutzer bereits Text gesehen. Ein Neustart würde diesen
 * Text verdoppeln statt den Fehler zu beheben.
 */
async function* stream(config: AnthropicConfig, request: ChatRequest): AsyncGenerator<StreamChunk> {
  const connectTimeoutMs = config.streamConnectTimeoutMs ?? DEFAULT_STREAM_CONNECT_TIMEOUT_MS;
  const idleTimeoutMs = config.streamIdleTimeoutMs ?? DEFAULT_STREAM_IDLE_TIMEOUT_MS;
  const controller = new AbortController();

  const response = await withTimeout(
    fetch(`${config.baseUrl}/v1/messages`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": config.apiKey,
        "anthropic-version": ANTHROPIC_VERSION,
      },
      body: JSON.stringify({ ...buildBody(config, request), stream: true }),
      signal: controller.signal,
    }),
    connectTimeoutMs,
    controller,
  );

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

  for await (const payload of withChunkTimeout(
    readSseLines(response.body),
    connectTimeoutMs,
    idleTimeoutMs,
    controller,
  )) {
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

/**
 * Ruft ein Modell auf und gibt die Antwort im internen Format zurück.
 *
 * Vorübergehende Fehler (Netzfehler, 429, 500–504) werden bis zu `MAX_RETRIES`
 * mal automatisch wiederholt, mit steigender Wartezeit. Eine Zeitüberschreitung
 * zählt bewusst NICHT dazu: Sie kommt aus unserem eigenen `withTimeout` als
 * fertiger `ProviderError` zurück und wird hier unverändert weitergereicht,
 * ohne die Retry-Prüfung nach Status zu durchlaufen — ein hängender Anbieter
 * beim ersten Versuch hängt beim zweiten wahrscheinlich genauso.
 */
export async function complete(
  config: AnthropicConfig,
  request: ChatRequest,
): Promise<ChatResponse> {
  const body = buildBody(config, request);
  const timeoutMs = config.requestTimeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    const controller = new AbortController();
    let response: Response;
    try {
      response = await withTimeout(
        fetch(`${config.baseUrl}/v1/messages`, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-api-key": config.apiKey,
            "anthropic-version": ANTHROPIC_VERSION,
          },
          body: JSON.stringify(body),
          signal: controller.signal,
        }),
        timeoutMs,
        controller,
      );
    } catch (err) {
      // ProviderError kommt bereits fertig aus withTimeout (Zeitüberschreitung)
      // und wird nicht wiederholt. Alles andere ist ein echter Netzfehler
      // (Server nicht erreichbar, DNS, TLS, …) — der ist vorübergehend.
      if (err instanceof ProviderError) throw err;
      if (attempt < MAX_RETRIES) {
        await sleep(retryDelayMs(attempt));
        continue;
      }
      throw new ProviderError(503, String(err));
    }

    if (!response.ok) {
      const message = await readErrorMessage(response);
      if (attempt < MAX_RETRIES && isRetryableStatus(response.status)) {
        await sleep(retryDelayMs(attempt, response.headers.get("retry-after")));
        continue;
      }
      throw new ProviderError(response.status, message);
    }

    const raw = (await response.json()) as RawAnthropicResponse;
    return toInternal(raw);
  }

  // Unerreichbar: Jede Runde der Schleife gibt zurück, wiederholt oder wirft.
  throw new ProviderError(500, "Unerwarteter Zustand in der Wiederholungsschleife.");
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
