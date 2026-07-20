import type { ChatRequest, ChatResponse } from "@raider/shared";
import { ProviderError } from "./errors";
import type { Provider } from "./provider";

/**
 * Adapter für lokale Modelle über Ollama (https://ollama.com). Läuft ohne
 * API-Key auf dem eigenen Rechner. Gibt wie jeder Adapter das interne
 * Nachrichtenformat zurück, nie das rohe Anbieterformat.
 */

export interface OllamaConfig {
  /** Basis-URL des lokalen Ollama-Servers. */
  baseUrl: string;
  defaultModel: string;
  /** Obergrenze der Antwort-Tokens (Ollama: options.num_predict). */
  defaultMaxTokens: number;
}

/** Rohe Antwortstruktur von Ollamas /api/chat — nur modulintern. */
interface RawOllamaResponse {
  model?: string;
  message?: { role: string; content: string };
  done_reason?: string;
  prompt_eval_count?: number;
  eval_count?: number;
}

export function createOllamaProvider(config: OllamaConfig): Provider {
  return { complete: (request) => complete(config, request) };
}

async function complete(config: OllamaConfig, request: ChatRequest): Promise<ChatResponse> {
  // Ollama versteht die Rolle "system" direkt in der Nachrichtenliste.
  const messages = [
    ...(request.system ? [{ role: "system", content: request.system }] : []),
    ...request.messages.map((message) => ({ role: message.role, content: message.content })),
  ];

  const model = request.model ?? config.defaultModel;
  const body = {
    model,
    messages,
    stream: false,
    options: { num_predict: request.maxTokens ?? config.defaultMaxTokens },
  };

  let response: Response;
  try {
    response = await fetch(`${config.baseUrl}/api/chat`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch {
    throw new ProviderError(
      503,
      `Ollama nicht erreichbar unter ${config.baseUrl}. Läuft 'ollama serve'?`,
    );
  }

  if (!response.ok) {
    throw new ProviderError(response.status, await readErrorMessage(response));
  }

  const raw = (await response.json()) as RawOllamaResponse;
  return toInternal(raw, model);
}

function toInternal(raw: RawOllamaResponse, fallbackModel: string): ChatResponse {
  return {
    role: "assistant",
    content: raw.message?.content ?? "",
    model: raw.model ?? fallbackModel,
    stopReason: raw.done_reason ?? null,
    usage: {
      inputTokens: raw.prompt_eval_count ?? 0,
      outputTokens: raw.eval_count ?? 0,
    },
  };
}

async function readErrorMessage(response: Response): Promise<string> {
  try {
    const data = (await response.json()) as { error?: string };
    return data.error ?? response.statusText;
  } catch {
    return response.statusText;
  }
}
