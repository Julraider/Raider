import type {
  Agent,
  AgentListResponse,
  ChatRequest,
  ChatResponse,
  CreateAgentRequest,
  CreateSessionRequest,
  PostMessageRequest,
  SearchResponse,
  Session,
  SessionListResponse,
  SessionMessagesResponse,
  UpdateAgentRequest,
} from "./index";

/**
 * Gemeinsamer HTTP-Client für die lokale Core-API. Nutzt das eingebaute fetch
 * und läuft damit gleich in Node (CLI) und im Browser (Electron-Renderer).
 * So gibt es nur eine Stelle für die API-Aufrufe — nicht pro Client dupliziert.
 */

/** Fehler einer API-Anfrage, mit HTTP-Status. */
export class ApiError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
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

/** Ein an eine Basis-URL gebundener Client für die Core-API. */
export interface RaiderClient {
  status(): Promise<unknown>;
  chat(request: ChatRequest): Promise<ChatResponse>;
  createSession(input?: CreateSessionRequest): Promise<Session>;
  listSessions(): Promise<SessionListResponse>;
  getMessages(sessionId: number): Promise<SessionMessagesResponse>;
  sendMessage(sessionId: number, input: PostMessageRequest): Promise<ChatResponse>;
  search(query: string): Promise<SearchResponse>;
  createAgent(input: CreateAgentRequest): Promise<Agent>;
  listAgents(): Promise<AgentListResponse>;
  getAgent(id: number): Promise<Agent>;
  updateAgent(id: number, patch: UpdateAgentRequest): Promise<Agent>;
  deleteAgent(id: number): Promise<{ deleted: boolean }>;
  duplicateAgent(id: number): Promise<Agent>;
}

/** Baut einen Client gegen `baseUrl` (z. B. http://localhost:4179). */
export function createRaiderClient(baseUrl: string): RaiderClient {
  const base = baseUrl.replace(/\/$/, "");
  return {
    status: () => requestJson(`${base}/status`),
    chat: (request) => requestJson<ChatResponse>(`${base}/chat`, jsonInit("POST", request)),
    createSession: (input = {}) =>
      requestJson<Session>(`${base}/sessions`, jsonInit("POST", input)),
    listSessions: () => requestJson<SessionListResponse>(`${base}/sessions`),
    getMessages: (sessionId) =>
      requestJson<SessionMessagesResponse>(`${base}/sessions/${sessionId}/messages`),
    sendMessage: (sessionId, input) =>
      requestJson<ChatResponse>(`${base}/sessions/${sessionId}/messages`, jsonInit("POST", input)),
    search: (query) => requestJson<SearchResponse>(`${base}/search?q=${encodeURIComponent(query)}`),
    createAgent: (input) => requestJson<Agent>(`${base}/agents`, jsonInit("POST", input)),
    listAgents: () => requestJson<AgentListResponse>(`${base}/agents`),
    getAgent: (id) => requestJson<Agent>(`${base}/agents/${id}`),
    updateAgent: (id, patch) =>
      requestJson<Agent>(`${base}/agents/${id}`, jsonInit("PATCH", patch)),
    deleteAgent: (id) =>
      requestJson<{ deleted: boolean }>(`${base}/agents/${id}`, jsonInit("DELETE", {})),
    duplicateAgent: (id) =>
      requestJson<Agent>(`${base}/agents/${id}/duplicate`, jsonInit("POST", {})),
  };
}
