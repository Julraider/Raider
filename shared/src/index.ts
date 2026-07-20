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
