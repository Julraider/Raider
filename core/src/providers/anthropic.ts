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
  content: Array<{ type: string; text?: string }>;
  usage: { input_tokens: number; output_tokens: number };
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
    .map((message) => ({ role: message.role, content: message.content }));

  const body = {
    model: request.model ?? config.defaultModel,
    max_tokens: request.maxTokens ?? config.defaultMaxTokens,
    ...(system ? { system } : {}),
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

  return {
    role: "assistant",
    content,
    model: raw.model,
    stopReason: raw.stop_reason,
    usage: {
      inputTokens: raw.usage.input_tokens,
      outputTokens: raw.usage.output_tokens,
    },
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
