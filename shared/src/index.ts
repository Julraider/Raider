/**
 * Gemeinsame Typen für alle Clients (Electron, CLI, Gateway) und den Core.
 * Diese Typen nie in einzelnen Clients duplizieren — sie leben nur hier.
 */

// Gemeinsamer HTTP-Client (von CLI und Electron-Renderer genutzt).
export { ApiError, createRaiderClient, type RaiderClient } from "./client";

/** Zustand der Datenbank, wie ihn der Core nach außen meldet. */
export interface DatabaseStatus {
  /** Ist die Verbindung zur SQLite-Datei offen? */
  connected: boolean;
  /** Stand des Migrationsmechanismus. */
  migrations: {
    /** Anzahl bereits angewendeter Migrationen. */
    applied: number;
    /** Name der zuletzt angewendeten Migration, oder null wenn keine. */
    latest: string | null;
  };
}

/** Antwort auf `GET /status`. */
export interface StatusResponse {
  status: "ok";
  /** Version des Cores (aus dessen package.json). */
  version: string;
  database: DatabaseStatus;
}

/**
 * Internes Nachrichtenformat.
 *
 * Provider-Adapter geben IMMER dieses Format zurück, nie das rohe
 * Anbieterformat. Clients kennen nur diese Typen — so bleibt der Anbieter
 * hinter dem Adapter austauschbar.
 */

/** Rolle einer Nachricht im internen Format. */
export type ChatRole = "system" | "user" | "assistant";

/** Eine einzelne Nachricht im internen Format. */
export interface ChatMessage {
  role: ChatRole;
  content: string;
}

/** Anfrage an einen Provider (über den Core, nie direkt vom Client). */
export interface ChatRequest {
  messages: ChatMessage[];
  /** Modell-ID; fehlt sie, nimmt der Core sein Standardmodell. */
  model?: string;
  /** Obergrenze der Antwort-Tokens; fehlt sie, nimmt der Core seinen Standard. */
  maxTokens?: number;
  /** Optionaler Systemprompt (alternativ als system-Nachricht in messages). */
  system?: string;
}

/** Token-Verbrauch eines Modellaufrufs. */
export interface ChatUsage {
  inputTokens: number;
  outputTokens: number;
}

/** Antwort eines Providers im internen Format. */
export interface ChatResponse {
  role: "assistant";
  /** Reiner Text der Antwort (Textblöcke zusammengefügt). */
  content: string;
  /** Modell, das tatsächlich geantwortet hat. */
  model: string;
  /** Grund für das Ende der Generierung (z. B. "end_turn"), oder null. */
  stopReason: string | null;
  usage: ChatUsage;
}

/**
 * Sitzungen und Nachrichten (Ebene 2 — durchsuchbare Historie).
 * Der Core speichert Gespräche in SQLite; Clients halten keinen Verlauf mehr.
 */

/** Kanal, über den eine Sitzung läuft. */
export type SessionChannel = "desktop" | "telegram" | "cli" | "cron";

/** Eine gespeicherte Sitzung. */
export interface Session {
  id: number;
  title: string | null;
  channel: SessionChannel;
  status: string;
  /** Zugeordneter Agent, oder null (Standardstimme). */
  agentId: number | null;
  createdAt: string;
  updatedAt: string;
  /** Anzahl Nachrichten (nur in Listen gesetzt). */
  messageCount?: number;
}

/**
 * Ein Agent = Systemprompt + Modell (+ später Werkzeuge & Skills). Sitzungen
 * verweisen auf einen Agenten; der Core prägt damit jede Nachricht.
 */
export interface Agent {
  id: number;
  name: string;
  icon: string | null;
  systemPrompt: string;
  /** Modell-ID, oder null → Standardmodell des Cores. */
  model: string | null;
  /** Ausweichmodell, oder null. */
  fallbackModel: string | null;
  createdAt: string;
  updatedAt: string;
}

/** Body für `POST /agents`. */
export interface CreateAgentRequest {
  name: string;
  icon?: string | null;
  systemPrompt?: string;
  model?: string | null;
  fallbackModel?: string | null;
}

/** Body für `PATCH /agents/:id` (nur gesetzte Felder ändern). */
export interface UpdateAgentRequest {
  name?: string;
  icon?: string | null;
  systemPrompt?: string;
  model?: string | null;
  fallbackModel?: string | null;
}

/** Antwort auf `GET /agents`. */
export interface AgentListResponse {
  agents: Agent[];
}

/** Eine gespeicherte Nachricht. */
export interface StoredMessage {
  id: number;
  sessionId: number;
  role: ChatRole;
  content: string;
  tokensIn: number;
  tokensOut: number;
  createdAt: string;
}

/** Ein Treffer der Volltextsuche über Nachrichten. */
export interface SearchHit {
  messageId: number;
  sessionId: number;
  role: ChatRole;
  /** Textausschnitt mit markierten Fundstellen. */
  snippet: string;
  createdAt: string;
}

/** Body für `POST /sessions`. */
export interface CreateSessionRequest {
  title?: string;
  channel?: SessionChannel;
  agentId?: number | null;
}

/** Body für `POST /sessions/:id/messages`. */
export interface PostMessageRequest {
  content: string;
  model?: string;
  maxTokens?: number;
}

/** Antwort auf `GET /sessions`. */
export interface SessionListResponse {
  sessions: Session[];
}

/** Antwort auf `GET /sessions/:id/messages`. */
export interface SessionMessagesResponse {
  session: Session;
  messages: StoredMessage[];
}

/** Antwort auf `GET /search`. */
export interface SearchResponse {
  query: string;
  hits: SearchHit[];
}

/**
 * MCP: externe Werkzeugserver. Server per stdio (Befehl) oder HTTP (URL);
 * an-/abschaltbar; Werkzeugaufrufe brauchen eine Freigabe.
 */

export type McpServerType = "stdio" | "http";

/** Ein konfigurierter MCP-Server. Env-Werte sind in API-Antworten geschwärzt. */
export interface McpServer {
  id: number;
  name: string;
  type: McpServerType;
  command: string | null;
  args: string[];
  url: string | null;
  env: Record<string, string>;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CreateMcpServerRequest {
  name: string;
  type: McpServerType;
  command?: string;
  args?: string[];
  url?: string;
  env?: Record<string, string>;
  enabled?: boolean;
}

export interface UpdateMcpServerRequest {
  name?: string;
  type?: McpServerType;
  command?: string | null;
  args?: string[];
  url?: string | null;
  env?: Record<string, string>;
  enabled?: boolean;
}

export interface McpServerListResponse {
  servers: McpServer[];
}

/** Ein vom Server angebotenes Werkzeug. */
export interface McpTool {
  name: string;
  description: string | null;
  inputSchema?: unknown;
}

/** Antwort des Verbindungstests. */
export interface McpTestResponse {
  serverId: number;
  tools: McpTool[];
}

/** Ein protokollierter Werkzeugaufruf (jeder Aufruf ist einsehbar). */
export interface ToolCall {
  id: number;
  serverId: number | null;
  toolName: string;
  arguments: unknown;
  result: string;
  isError: boolean;
  /** Wer den Aufruf freigegeben hat. */
  approvedBy: string | null;
  createdAt: string;
}

/** Body für einen Werkzeugaufruf. Ohne `approvedBy` verlangt der Core eine Freigabe. */
export interface CallToolRequest {
  arguments?: Record<string, unknown>;
  approvedBy?: string;
}

export interface ToolCallListResponse {
  toolCalls: ToolCall[];
}

/**
 * Memory Ebene 1 — Kerngedächtnis (immer im Kontext). Zwei Speicher:
 * Nutzerprofil und Agenten-Notizen. Jeder Speicher hat ein Zeichenlimit.
 */

export type MemoryStore = "agent" | "user";

/** Ein einzelner Gedächtniseintrag, mit Herkunft. */
export interface MemoryEntry {
  id: number;
  store: MemoryStore;
  content: string;
  /** Aus welcher Sitzung der Eintrag stammt (null bei manueller Eingabe). */
  sourceSessionId: number | null;
  createdAt: string;
  updatedAt: string;
}

/** Sicht auf einen Speicher inkl. Auslastung. */
export interface MemoryView {
  store: MemoryStore;
  used: number;
  limit: number;
  entries: MemoryEntry[];
}

export interface CreateMemoryRequest {
  content: string;
  sourceSessionId?: number | null;
}

export interface UpdateMemoryRequest {
  content: string;
}

/**
 * Freigabe-Posteingang: automatisch oder im Chat vorgeschlagene Schreibzugriffe
 * landen hier und werden erst nach Freigabe angewendet (nie direkt).
 */

export type PendingWriteKind = "memory" | "skill";
export type PendingWriteOrigin = "auto" | "chat";
export type PendingWriteStatus = "pending" | "approved" | "rejected";

/** Vorschlag für einen Memory-Eintrag. */
export interface MemoryProposal {
  store: MemoryStore;
  content: string;
}

/** Inhalt eines Vorschlags (in Schritt 10 um SkillProposal erweitert). */
export type PendingProposal = MemoryProposal;

export interface PendingWrite {
  id: number;
  kind: PendingWriteKind;
  proposal: PendingProposal;
  origin: PendingWriteOrigin;
  status: PendingWriteStatus;
  sourceSessionId: number | null;
  createdAt: string;
  resolvedAt: string | null;
}

export interface CreatePendingWriteRequest {
  kind: PendingWriteKind;
  proposal: PendingProposal;
  origin?: PendingWriteOrigin;
  sourceSessionId?: number | null;
}

export interface PendingWriteListResponse {
  pendingWrites: PendingWrite[];
}
