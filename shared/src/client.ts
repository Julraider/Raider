import type {
  Agent,
  AgentListResponse,
  BackupInfo,
  BackupListResponse,
  CallToolRequest,
  ChatRequest,
  ChatResponse,
  CreateAgentRequest,
  CreateMcpServerRequest,
  CreateMemoryRequest,
  CreatePendingWriteRequest,
  CreateScheduledTaskRequest,
  CreateSessionRequest,
  CreateSkillRequest,
  EmergencyStopState,
  HealthReport,
  ImportSkillRequest,
  McpServer,
  McpServerListResponse,
  McpTestResponse,
  MemoryEntry,
  MemoryStore,
  MemoryView,
  OllamaProbe,
  PendingWrite,
  PendingWriteListResponse,
  PendingWriteStatus,
  PostMessageRequest,
  ReviewRunListResponse,
  ReviewSummary,
  RunTaskResponse,
  ScheduledTask,
  ScheduledTaskListResponse,
  SearchResponse,
  Session,
  SessionListResponse,
  SessionMessagesResponse,
  SetupRequest,
  SetupStatus,
  Skill,
  SkillExportResponse,
  SkillListResponse,
  SkillWithContent,
  StatsReport,
  TelegramChatListResponse,
  TelegramPairingCode,
  TelegramStatusResponse,
  ToolCall,
  ToolCallListResponse,
  ToolPermissionListResponse,
  UpdateAgentRequest,
  UpdateMcpServerRequest,
  UpdateMemoryRequest,
  UpdateScheduledTaskRequest,
  UpdateSkillRequest,
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

async function request<T>(
  url: string,
  init: RequestInit | undefined,
  auth: Record<string, string>,
): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: { ...(init?.headers as Record<string, string> | undefined), ...auth },
  });
  const data = (await response.json()) as T & { error?: string };
  if (!response.ok) {
    throw new ApiError(response.status, data.error ?? "unbekannt");
  }
  return data;
}

function jsonInit(method: string, body: unknown): RequestInit {
  return { method, headers: { "content-type": "application/json" }, body: JSON.stringify(body) };
}

/**
 * Ein Ereignis auf dem Weg zur fertigen Antwort. `text` kommt oft und in
 * kleinen Stücken, `tool` meldet einen laufenden Werkzeugaufruf, `done` kommt
 * genau einmal am Schluss.
 */
export type StreamEvent =
  | { type: "text"; text: string }
  | { type: "tool"; name: string; phase: "start" | "done"; isError?: boolean }
  | { type: "done"; response: ChatResponse }
  | { type: "error"; message: string };

/** Ein an eine Basis-URL gebundener Client für die Core-API. */
export interface RaiderClient {
  status(): Promise<unknown>;
  chat(request: ChatRequest): Promise<ChatResponse>;
  createSession(input?: CreateSessionRequest): Promise<Session>;
  listSessions(): Promise<SessionListResponse>;
  /** Benennt eine Sitzung um; leerer Titel setzt auf den Ersatznamen zurück. */
  renameSession(sessionId: number, title: string): Promise<Session>;
  /** Löscht eine Sitzung samt aller Nachrichten. */
  deleteSession(sessionId: number): Promise<{ deleted: boolean }>;
  getMessages(sessionId: number): Promise<SessionMessagesResponse>;
  sendMessage(sessionId: number, input: PostMessageRequest): Promise<ChatResponse>;
  /**
   * Wie `sendMessage`, liefert die Antwort aber stückweise, während sie
   * entsteht. `signal` bricht die laufende Antwort ab.
   */
  streamMessage(
    sessionId: number,
    input: PostMessageRequest,
    signal?: AbortSignal,
  ): AsyncIterable<StreamEvent>;
  search(query: string): Promise<SearchResponse>;
  createAgent(input: CreateAgentRequest): Promise<Agent>;
  listAgents(): Promise<AgentListResponse>;
  getAgent(id: number): Promise<Agent>;
  updateAgent(id: number, patch: UpdateAgentRequest): Promise<Agent>;
  deleteAgent(id: number): Promise<{ deleted: boolean }>;
  duplicateAgent(id: number): Promise<Agent>;
  createMcpServer(input: CreateMcpServerRequest): Promise<McpServer>;
  listMcpServers(): Promise<McpServerListResponse>;
  updateMcpServer(id: number, patch: UpdateMcpServerRequest): Promise<McpServer>;
  deleteMcpServer(id: number): Promise<{ deleted: boolean }>;
  testMcpServer(id: number): Promise<McpTestResponse>;
  /** Welche Werkzeuge Raider dauerhaft selbst benutzen darf. */
  listToolPermissions(): Promise<ToolPermissionListResponse>;
  /** Erteilt eine Dauerfreigabe für genau ein Werkzeug. */
  grantToolPermission(
    serverId: number,
    toolName: string,
    grantedBy?: string,
  ): Promise<{ granted: boolean }>;
  /** Nimmt eine Dauerfreigabe zurück. */
  revokeToolPermission(serverId: number, toolName: string): Promise<{ revoked: boolean }>;
  callTool(serverId: number, tool: string, input: CallToolRequest): Promise<ToolCall>;
  listToolCalls(): Promise<ToolCallListResponse>;
  getMemory(store: MemoryStore): Promise<MemoryView>;
  addMemory(store: MemoryStore, input: CreateMemoryRequest): Promise<MemoryEntry>;
  updateMemory(id: number, input: UpdateMemoryRequest): Promise<MemoryEntry>;
  deleteMemory(id: number): Promise<{ deleted: boolean }>;
  createPendingWrite(input: CreatePendingWriteRequest): Promise<PendingWrite>;
  listInbox(status?: PendingWriteStatus): Promise<PendingWriteListResponse>;
  approvePendingWrite(id: number): Promise<{ pendingWrite: PendingWrite; applied?: unknown }>;
  rejectPendingWrite(id: number): Promise<PendingWrite>;
  createSkill(input: CreateSkillRequest): Promise<Skill>;
  listSkills(): Promise<SkillListResponse>;
  getSkill(id: number): Promise<SkillWithContent>;
  updateSkill(id: number, patch: UpdateSkillRequest): Promise<Skill>;
  deleteSkill(id: number): Promise<{ deleted: boolean }>;
  exportSkill(id: number): Promise<SkillExportResponse>;
  importSkill(input: ImportSkillRequest): Promise<Skill>;
  listAgentSkills(agentId: number): Promise<SkillListResponse>;
  assignSkill(agentId: number, skillId: number): Promise<{ assigned: boolean }>;
  unassignSkill(agentId: number, skillId: number): Promise<{ unassigned: boolean }>;
  telegramStatus(): Promise<TelegramStatusResponse>;
  createPairingCode(): Promise<TelegramPairingCode>;
  listTelegramChats(): Promise<TelegramChatListResponse>;
  unpairTelegramChat(chatId: number): Promise<{ unpaired: boolean }>;
  createScheduledTask(input: CreateScheduledTaskRequest): Promise<ScheduledTask>;
  listScheduledTasks(): Promise<ScheduledTaskListResponse>;
  getScheduledTask(id: number): Promise<ScheduledTask>;
  updateScheduledTask(id: number, patch: UpdateScheduledTaskRequest): Promise<ScheduledTask>;
  deleteScheduledTask(id: number): Promise<{ deleted: boolean }>;
  runScheduledTask(id: number): Promise<RunTaskResponse>;
  getEmergencyStop(): Promise<EmergencyStopState>;
  engageEmergencyStop(reason?: string): Promise<EmergencyStopState>;
  releaseEmergencyStop(): Promise<EmergencyStopState>;
  runReview(): Promise<ReviewSummary>;
  listReviewRuns(): Promise<ReviewRunListResponse>;
  /** Was ist eingerichtet? Enthält nie ein Geheimnis, nur „gesetzt"/„nicht gesetzt". */
  getSetup(): Promise<SetupStatus>;
  /** Übernimmt Einstellungen (Anbieter, Schlüssel, Modell). Leerer String löscht. */
  applySetup(patch: SetupRequest): Promise<SetupStatus>;
  /** Läuft auf diesem Rechner ein Ollama-Server, und welche Modelle hat er? */
  probeOllama(): Promise<OllamaProbe>;
  health(): Promise<HealthReport>;
  stats(): Promise<StatsReport>;
  createBackup(): Promise<BackupInfo>;
  listBackups(): Promise<BackupListResponse>;
}

/** Baut einen Client gegen `baseUrl` (z. B. http://localhost:4179). */
export function createRaiderClient(baseUrl: string, accessToken?: string): RaiderClient {
  const base = baseUrl.replace(/\/$/, "");
  /*
   * Das Token geht als Kopfzeile mit — nie als Teil der Adresse, sonst stünde
   * es in Server-Logs und in der Verlaufsliste des Browsers. `requestJson`
   * überdeckt hier bewusst den Modul-Helfer, damit alle Aufrufe unten
   * unverändert bleiben und trotzdem angemeldet sind.
   */
  const auth: Record<string, string> = accessToken
    ? { authorization: `Bearer ${accessToken}` }
    : {};
  const requestJson = <T>(url: string, init?: RequestInit): Promise<T> =>
    request<T>(url, init, auth);
  return {
    status: () => requestJson(`${base}/status`),
    chat: (request) => requestJson<ChatResponse>(`${base}/chat`, jsonInit("POST", request)),
    createSession: (input = {}) =>
      requestJson<Session>(`${base}/sessions`, jsonInit("POST", input)),
    listSessions: () => requestJson<SessionListResponse>(`${base}/sessions`),
    renameSession: (sessionId, title) =>
      requestJson<Session>(`${base}/sessions/${sessionId}`, jsonInit("PATCH", { title })),
    deleteSession: (sessionId) =>
      requestJson<{ deleted: boolean }>(`${base}/sessions/${sessionId}`, { method: "DELETE" }),
    getMessages: (sessionId) =>
      requestJson<SessionMessagesResponse>(`${base}/sessions/${sessionId}/messages`),
    sendMessage: (sessionId, input) =>
      requestJson<ChatResponse>(`${base}/sessions/${sessionId}/messages`, jsonInit("POST", input)),
    streamMessage: (sessionId, input, signal) =>
      streamMessages(`${base}/sessions/${sessionId}/messages/stream`, input, auth, signal),
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
    createMcpServer: (input) =>
      requestJson<McpServer>(`${base}/mcp/servers`, jsonInit("POST", input)),
    listMcpServers: () => requestJson<McpServerListResponse>(`${base}/mcp/servers`),
    updateMcpServer: (id, patch) =>
      requestJson<McpServer>(`${base}/mcp/servers/${id}`, jsonInit("PATCH", patch)),
    deleteMcpServer: (id) =>
      requestJson<{ deleted: boolean }>(`${base}/mcp/servers/${id}`, jsonInit("DELETE", {})),
    listToolPermissions: () => requestJson<ToolPermissionListResponse>(`${base}/mcp/permissions`),
    grantToolPermission: (serverId, toolName, grantedBy) =>
      requestJson<{ granted: boolean }>(
        `${base}/mcp/servers/${serverId}/permissions`,
        jsonInit("POST", { toolName, ...(grantedBy ? { grantedBy } : {}) }),
      ),
    revokeToolPermission: (serverId, toolName) =>
      requestJson<{ revoked: boolean }>(
        `${base}/mcp/servers/${serverId}/permissions/${encodeURIComponent(toolName)}`,
        { method: "DELETE" },
      ),
    testMcpServer: (id) =>
      requestJson<McpTestResponse>(`${base}/mcp/servers/${id}/test`, jsonInit("POST", {})),
    callTool: (serverId, tool, input) =>
      requestJson<ToolCall>(
        `${base}/mcp/servers/${serverId}/tools/${encodeURIComponent(tool)}/call`,
        jsonInit("POST", input),
      ),
    listToolCalls: () => requestJson<ToolCallListResponse>(`${base}/tool-calls`),
    getMemory: (store) => requestJson<MemoryView>(`${base}/memory/${store}`),
    addMemory: (store, input) =>
      requestJson<MemoryEntry>(`${base}/memory/${store}`, jsonInit("POST", input)),
    updateMemory: (id, input) =>
      requestJson<MemoryEntry>(`${base}/memory/entries/${id}`, jsonInit("PATCH", input)),
    deleteMemory: (id) =>
      requestJson<{ deleted: boolean }>(`${base}/memory/entries/${id}`, jsonInit("DELETE", {})),
    createPendingWrite: (input) =>
      requestJson<PendingWrite>(`${base}/inbox`, jsonInit("POST", input)),
    listInbox: (status) =>
      requestJson<PendingWriteListResponse>(`${base}/inbox${status ? `?status=${status}` : ""}`),
    approvePendingWrite: (id) =>
      requestJson<{ pendingWrite: PendingWrite; applied?: unknown }>(
        `${base}/inbox/${id}/approve`,
        jsonInit("POST", {}),
      ),
    rejectPendingWrite: (id) =>
      requestJson<PendingWrite>(`${base}/inbox/${id}/reject`, jsonInit("POST", {})),
    createSkill: (input) => requestJson<Skill>(`${base}/skills`, jsonInit("POST", input)),
    listSkills: () => requestJson<SkillListResponse>(`${base}/skills`),
    getSkill: (id) => requestJson<SkillWithContent>(`${base}/skills/${id}`),
    updateSkill: (id, patch) =>
      requestJson<Skill>(`${base}/skills/${id}`, jsonInit("PATCH", patch)),
    deleteSkill: (id) =>
      requestJson<{ deleted: boolean }>(`${base}/skills/${id}`, jsonInit("DELETE", {})),
    exportSkill: (id) => requestJson<SkillExportResponse>(`${base}/skills/${id}/export`),
    importSkill: (input) => requestJson<Skill>(`${base}/skills/import`, jsonInit("POST", input)),
    listAgentSkills: (agentId) =>
      requestJson<SkillListResponse>(`${base}/agents/${agentId}/skills`),
    assignSkill: (agentId, skillId) =>
      requestJson<{ assigned: boolean }>(
        `${base}/agents/${agentId}/skills/${skillId}`,
        jsonInit("POST", {}),
      ),
    unassignSkill: (agentId, skillId) =>
      requestJson<{ unassigned: boolean }>(
        `${base}/agents/${agentId}/skills/${skillId}`,
        jsonInit("DELETE", {}),
      ),
    telegramStatus: () => requestJson<TelegramStatusResponse>(`${base}/telegram/status`),
    createPairingCode: () =>
      requestJson<TelegramPairingCode>(`${base}/telegram/pairing-codes`, jsonInit("POST", {})),
    listTelegramChats: () => requestJson<TelegramChatListResponse>(`${base}/telegram/chats`),
    unpairTelegramChat: (chatId) =>
      requestJson<{ unpaired: boolean }>(
        `${base}/telegram/chats/${chatId}`,
        jsonInit("DELETE", {}),
      ),
    createScheduledTask: (input) =>
      requestJson<ScheduledTask>(`${base}/scheduler/tasks`, jsonInit("POST", input)),
    listScheduledTasks: () => requestJson<ScheduledTaskListResponse>(`${base}/scheduler/tasks`),
    getScheduledTask: (id) => requestJson<ScheduledTask>(`${base}/scheduler/tasks/${id}`),
    updateScheduledTask: (id, patch) =>
      requestJson<ScheduledTask>(`${base}/scheduler/tasks/${id}`, jsonInit("PATCH", patch)),
    deleteScheduledTask: (id) =>
      requestJson<{ deleted: boolean }>(`${base}/scheduler/tasks/${id}`, jsonInit("DELETE", {})),
    runScheduledTask: (id) =>
      requestJson<RunTaskResponse>(`${base}/scheduler/tasks/${id}/run`, jsonInit("POST", {})),
    getEmergencyStop: () => requestJson<EmergencyStopState>(`${base}/emergency-stop`),
    engageEmergencyStop: (reason) =>
      requestJson<EmergencyStopState>(`${base}/emergency-stop`, jsonInit("POST", { reason })),
    releaseEmergencyStop: () =>
      requestJson<EmergencyStopState>(`${base}/emergency-stop`, jsonInit("DELETE", {})),
    runReview: () => requestJson<ReviewSummary>(`${base}/review/run`, jsonInit("POST", {})),
    listReviewRuns: () => requestJson<ReviewRunListResponse>(`${base}/review/runs`),
    getSetup: () => requestJson<SetupStatus>(`${base}/setup`),
    applySetup: (patch) => requestJson<SetupStatus>(`${base}/setup`, jsonInit("POST", patch)),
    probeOllama: () => requestJson<OllamaProbe>(`${base}/setup/ollama`),
    health: () => requestJson<HealthReport>(`${base}/health`),
    stats: () => requestJson<StatsReport>(`${base}/stats`),
    createBackup: () => requestJson<BackupInfo>(`${base}/backup`, jsonInit("POST", {})),
    listBackups: () => requestJson<BackupListResponse>(`${base}/backups`),
  };
}

/**
 * Liest den SSE-Strom des Cores und gibt jedes Ereignis einzeln zurück.
 *
 * Bewusst ohne EventSource: Der Endpunkt braucht POST mit Körper, das kann
 * EventSource nicht. Zeilen können über Paketgrenzen zerschnitten ankommen —
 * darum der Puffer.
 */
async function* streamMessages(
  url: string,
  input: PostMessageRequest,
  auth: Record<string, string>,
  signal?: AbortSignal,
): AsyncGenerator<StreamEvent> {
  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json", accept: "text/event-stream", ...auth },
    body: JSON.stringify(input),
    ...(signal ? { signal } : {}),
  });

  if (!response.ok) {
    let message = response.statusText;
    try {
      const data = (await response.json()) as { error?: string };
      message = data.error ?? message;
    } catch {
      // Keine JSON-Fehlermeldung — der Statustext muss reichen.
    }
    throw new ApiError(response.status, message);
  }
  if (!response.body) {
    throw new ApiError(502, "Antwort ohne Datenstrom erhalten.");
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let newline = buffer.indexOf("\n");
      while (newline !== -1) {
        const line = buffer.slice(0, newline).trim();
        buffer = buffer.slice(newline + 1);
        if (line.startsWith("data:")) {
          const payload = line.slice(5).trim();
          if (payload !== "") {
            try {
              yield JSON.parse(payload) as StreamEvent;
            } catch {
              // Unvollständige Nutzlast überspringen statt abzubrechen.
            }
          }
        }
        newline = buffer.indexOf("\n");
      }
    }
  } finally {
    reader.releaseLock();
  }
}
