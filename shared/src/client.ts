import type {
  Agent,
  AgentListResponse,
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
  ImportSkillRequest,
  McpServer,
  McpServerListResponse,
  McpTestResponse,
  MemoryEntry,
  MemoryStore,
  MemoryView,
  PendingWrite,
  PendingWriteListResponse,
  PendingWriteStatus,
  PostMessageRequest,
  RunTaskResponse,
  ScheduledTask,
  ScheduledTaskListResponse,
  SearchResponse,
  Session,
  SessionListResponse,
  SessionMessagesResponse,
  Skill,
  SkillExportResponse,
  SkillListResponse,
  SkillWithContent,
  TelegramChatListResponse,
  TelegramPairingCode,
  TelegramStatusResponse,
  ToolCall,
  ToolCallListResponse,
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
  createMcpServer(input: CreateMcpServerRequest): Promise<McpServer>;
  listMcpServers(): Promise<McpServerListResponse>;
  updateMcpServer(id: number, patch: UpdateMcpServerRequest): Promise<McpServer>;
  deleteMcpServer(id: number): Promise<{ deleted: boolean }>;
  testMcpServer(id: number): Promise<McpTestResponse>;
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
    createMcpServer: (input) =>
      requestJson<McpServer>(`${base}/mcp/servers`, jsonInit("POST", input)),
    listMcpServers: () => requestJson<McpServerListResponse>(`${base}/mcp/servers`),
    updateMcpServer: (id, patch) =>
      requestJson<McpServer>(`${base}/mcp/servers/${id}`, jsonInit("PATCH", patch)),
    deleteMcpServer: (id) =>
      requestJson<{ deleted: boolean }>(`${base}/mcp/servers/${id}`, jsonInit("DELETE", {})),
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
  };
}
