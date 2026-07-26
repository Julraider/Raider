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

/**
 * Ein Werkzeug, das das Modell selbst aufrufen möchte. Die `id` stammt vom
 * Anbieter und muss beim Ergebnis unverändert zurückgegeben werden, damit der
 * Anbieter Aufruf und Ergebnis zuordnen kann.
 */
export interface ToolUse {
  id: string;
  /** Eindeutiger Name in der Form `server__werkzeug`. */
  name: string;
  input: Record<string, unknown>;
}

/** Das Ergebnis eines Werkzeugaufrufs, das zurück an das Modell geht. */
export interface ToolResult {
  toolUseId: string;
  content: string;
  isError: boolean;
}

/** Beschreibung eines Werkzeugs, wie sie das Modell zur Auswahl bekommt. */
export interface ToolDefinition {
  /** Eindeutiger Name in der Form `server__werkzeug`. */
  name: string;
  description: string;
  /** JSON-Schema der erwarteten Argumente. */
  inputSchema: unknown;
}

/** Eine einzelne Nachricht im internen Format. */
export interface ChatMessage {
  role: ChatRole;
  content: string;
  /** Nur bei `assistant`: Werkzeuge, die das Modell aufrufen möchte. */
  toolUses?: ToolUse[];
  /** Nur bei `user`: Ergebnisse zuvor angeforderter Werkzeuge. */
  toolResults?: ToolResult[];
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
  /**
   * Werkzeuge, die das Modell benutzen darf. Enthält AUSSCHLIESSLICH Werkzeuge,
   * für die der Nutzer ausdrücklich eine Dauerfreigabe erteilt hat — was hier
   * nicht drinsteht, sieht das Modell gar nicht erst.
   */
  tools?: ToolDefinition[];
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
  /**
   * Werkzeuge, die das Modell aufrufen möchte, bevor es weiterantwortet.
   * Gesetzt, wenn `stopReason === "tool_use"`.
   */
  toolUses?: ToolUse[];
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

/** Inhalt eines Vorschlags: Memory- oder Skill-Vorschlag. */
export type PendingProposal = MemoryProposal | SkillProposal;

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

/**
 * Skills: Markdown-Dateien (agentskills.io-kompatibel). Anlegen, importieren,
 * exportieren, Agenten zuweisen, einzeln an- und ausschalten.
 */

export type SkillSource = "manual" | "auto";

/** Metadaten eines Skills (Inhalt liegt in der Datei). */
export interface Skill {
  id: number;
  name: string;
  description: string;
  category: string | null;
  filePath: string;
  active: boolean;
  source: SkillSource;
  createdAt: string;
  updatedAt: string;
}

/** Skill inkl. Markdown-Inhalt. */
export interface SkillWithContent extends Skill {
  content: string;
}

/** Vorschlag für einen Skill (für den Freigabe-Posteingang). */
export interface SkillProposal {
  name: string;
  description?: string;
  category?: string | null;
  content: string;
}

export interface CreateSkillRequest {
  name: string;
  description?: string;
  category?: string | null;
  content: string;
}

export interface UpdateSkillRequest {
  name?: string;
  description?: string;
  category?: string | null;
  content?: string;
  active?: boolean;
}

export interface ImportSkillRequest {
  markdown: string;
}

export interface SkillExportResponse {
  markdown: string;
}

export interface SkillListResponse {
  skills: Skill[];
}

/**
 * Telegram-Gateway (Schritt 11): Raider vom Handy aus erreichen. Fremde Chats
 * müssen sich erst per Einmal-Code koppeln, bevor Nachrichten ans Modell gehen.
 */

/** Ein gekoppelter Telegram-Chat, verknüpft mit einer Sitzung. */
export interface TelegramChat {
  chatId: number;
  sessionId: number;
  label: string | null;
  pairedAt: string;
}

/** Ein Einmal-Code zum Koppeln eines Chats (der Code selbst ist ein Geheimnis). */
export interface TelegramPairingCode {
  code: string;
  createdAt: string;
  expiresAt: string;
  usedAt: string | null;
}

/** Zustand des Gateways — ob ein Bot-Token gesetzt ist (ohne den Token selbst). */
export interface TelegramStatusResponse {
  enabled: boolean;
  chatCount: number;
}

export interface TelegramChatListResponse {
  chats: TelegramChat[];
}

/**
 * Scheduler (Schritt 12): Aufgaben nach Zeitplan. Drei einfache Arten statt
 * Cron — interval (alle N Sekunden), daily (täglich HH:MM), once (einmalig ISO).
 */

export type ScheduleKind = "interval" | "daily" | "once";

/** Eine geplante Aufgabe: Prompt, der zum Zeitpunkt an einen Agenten geht. */
export interface ScheduledTask {
  id: number;
  name: string;
  scheduleKind: ScheduleKind;
  /** interval: Sekunden; daily: "HH:MM"; once: ISO-Zeitstempel. */
  scheduleValue: string;
  agentId: number | null;
  prompt: string;
  enabled: boolean;
  lastRunAt: string | null;
  nextRunAt: string;
  createdAt: string;
}

export interface CreateScheduledTaskRequest {
  name: string;
  scheduleKind: ScheduleKind;
  scheduleValue: string;
  prompt: string;
  agentId?: number | null;
}

export interface UpdateScheduledTaskRequest {
  name?: string;
  scheduleKind?: ScheduleKind;
  scheduleValue?: string;
  prompt?: string;
  agentId?: number | null;
  enabled?: boolean;
}

export interface ScheduledTaskListResponse {
  tasks: ScheduledTask[];
}

export interface RunTaskResponse {
  sessionId: number;
  ran: boolean;
}

/**
 * Not-Stopp (Schritt 12): der große rote Schalter. Aktiv = keine automatische
 * Aktivität (Scheduler, Telegram-Antworten, Werkzeugaufrufe).
 */
export interface EmergencyStopState {
  engaged: boolean;
  engagedAt: string | null;
  reason: string | null;
}

/**
 * Hintergrund-Review (Schritt 13): Raider sieht sich die letzte Aktivität an und
 * SCHLÄGT Verbesserungen vor (Merk-Einträge, Skills). Alles geht in den
 * Freigabe-Posteingang — nichts wird automatisch angewendet.
 */

/** Ein protokollierter Review-Lauf. */
export interface ReviewRun {
  id: number;
  ranAt: string;
  /** Zahl der neu erzeugten Vorschläge. */
  created: number;
  /** Zahl der übersprungenen (Duplikate o. Ä.). */
  skipped: number;
  note: string | null;
}

/** Ergebnis eines Review-Laufs. */
export interface ReviewSummary {
  created: number;
  skipped: number;
  note: string | null;
  /** Kurzbeschreibungen der neu erzeugten Vorschläge (für die Anzeige). */
  proposals: string[];
}

export interface ReviewRunListResponse {
  runs: ReviewRun[];
}

/**
 * Betrieb (Schritt 14): Gesundheitscheck, Statistik und Backups, damit Raider
 * unbeaufsichtigt rund um die Uhr laufen kann.
 */

/** Herzschlag des Cores — für Menschen und Überwachungsdienste. */
export interface HealthReport {
  status: "ok" | "degraded";
  version: string;
  uptimeSeconds: number;
  database: { connected: boolean; path: string };
  provider: { name: string; model: string; hasApiKey: boolean };
  workers: { scheduler: boolean; review: boolean; telegram: boolean };
  emergencyStop: boolean;
}

/** Zählerstände über das ganze System. */
export interface StatsReport {
  sessions: number;
  messages: number;
  memory: { user: number; agent: number };
  skills: number;
  mcpServers: number;
  toolCalls: number;
  pendingProposals: number;
  scheduledTasks: number;
  reviewRuns: number;
}

/** Eine Sicherungskopie der Datenbank. */
export interface BackupInfo {
  file: string;
  path: string;
  bytes: number;
  createdAt: string;
}

export interface BackupListResponse {
  backups: BackupInfo[];
}
