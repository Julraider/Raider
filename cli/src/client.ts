import type {
  ChatRequest,
  ChatResponse,
  CreateSessionRequest,
  PostMessageRequest,
  SearchResponse,
  Session,
} from "@raider/shared";

/** Fehler einer API-Anfrage an den Core, mit HTTP-Status. */
export class ApiError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

/** Basis-URL der lokalen API, aus RAIDER_PORT abgeleitet. */
export function resolveBaseUrl(env: NodeJS.ProcessEnv = process.env): string {
  const port = env.RAIDER_PORT ? Number(env.RAIDER_PORT) : 4179;
  return `http://localhost:${port}`;
}

/**
 * Generischer JSON-Aufruf gegen den Core. Wirft ApiError bei HTTP-Fehlern;
 * Netzwerkfehler (Core nicht erreichbar) kommen als normaler fetch-Fehler durch.
 */
async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  const data = (await response.json()) as T & { error?: string };
  if (!response.ok) {
    throw new ApiError(response.status, data.error ?? "unbekannt");
  }
  return data;
}

function jsonInit(method: string, body: unknown): RequestInit {
  return { method, headers: { "content-type": "application/json" }, body: JSON.stringify(body) };
}

/** Zustandsloser Einmal-Aufruf (für `ask`). */
export function postChat(baseUrl: string, chatRequest: ChatRequest): Promise<ChatResponse> {
  return request<ChatResponse>(`${baseUrl}/chat`, jsonInit("POST", chatRequest));
}

/** Legt eine neue Sitzung an. */
export function createSession(baseUrl: string, input: CreateSessionRequest = {}): Promise<Session> {
  return request<Session>(`${baseUrl}/sessions`, jsonInit("POST", input));
}

/** Schickt einen Dialog-Zug an eine Sitzung; der Core speichert beide Nachrichten. */
export function postSessionMessage(
  baseUrl: string,
  sessionId: number,
  input: PostMessageRequest,
): Promise<ChatResponse> {
  return request<ChatResponse>(
    `${baseUrl}/sessions/${sessionId}/messages`,
    jsonInit("POST", input),
  );
}

/** Volltextsuche über alle Nachrichten. */
export function searchMessages(baseUrl: string, query: string): Promise<SearchResponse> {
  return request<SearchResponse>(`${baseUrl}/search?q=${encodeURIComponent(query)}`);
}
