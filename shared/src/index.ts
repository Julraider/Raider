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
