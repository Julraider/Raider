/**
 * Gemeinsame Typen für alle Clients (Electron, CLI, Gateway) und den Core.
 * Diese Typen nie in einzelnen Clients duplizieren — sie leben nur hier.
 */

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
  createdAt: string;
  updatedAt: string;
  /** Anzahl Nachrichten (nur in Listen gesetzt). */
  messageCount?: number;
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
