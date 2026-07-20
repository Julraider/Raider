import type { ChatRequest, ChatResponse } from "@raider/shared";

/** Fehler einer Chat-Anfrage an den Core, mit HTTP-Status. */
export class ChatRequestError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "ChatRequestError";
    this.status = status;
  }
}

/** Basis-URL der lokalen API, aus RAIDER_PORT abgeleitet. */
export function resolveBaseUrl(env: NodeJS.ProcessEnv = process.env): string {
  const port = env.RAIDER_PORT ? Number(env.RAIDER_PORT) : 4179;
  return `http://localhost:${port}`;
}

/**
 * Schickt eine Chat-Anfrage an den Core und gibt die Antwort im internen
 * Format zurück. Wirft ChatRequestError bei HTTP-Fehlern; Netzwerkfehler
 * (Core nicht erreichbar) kommen als normaler fetch-Fehler durch.
 */
export async function postChat(baseUrl: string, request: ChatRequest): Promise<ChatResponse> {
  const response = await fetch(`${baseUrl}/chat`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(request),
  });

  const data = (await response.json()) as ChatResponse & { error?: string };

  if (!response.ok) {
    throw new ChatRequestError(response.status, data.error ?? "unbekannt");
  }

  return data;
}
