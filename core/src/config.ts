import { homedir } from "node:os";
import { join } from "node:path";

/** Laufzeit-Konfiguration des Cores, aus Umgebungsvariablen abgeleitet. */
export interface CoreConfig {
  /** Sichtbarer Datenordner, Standard ~/Raider (siehe Spec). */
  dataDir: string;
  /** Pfad zur SQLite-Datei. */
  databasePath: string;
  /** Port der lokalen API. */
  port: number;
}

const DEFAULT_PORT = 4179;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): CoreConfig {
  const dataDir = env.RAIDER_DATA_DIR ?? join(homedir(), "Raider");
  const databasePath = env.RAIDER_DB_PATH ?? join(dataDir, "raider.db");
  const port = env.RAIDER_PORT ? Number(env.RAIDER_PORT) : DEFAULT_PORT;

  return { dataDir, databasePath, port };
}
