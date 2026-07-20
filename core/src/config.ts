import { homedir } from "node:os";
import { join } from "node:path";

/** Einstellungen für den Anthropic-Anbieter. */
export interface AnthropicSettings {
  /** Basis-URL, per ANTHROPIC_BASE_URL überschreibbar. */
  baseUrl: string;
  defaultModel: string;
  defaultMaxTokens: number;
}

/** Laufzeit-Konfiguration des Cores, aus Umgebungsvariablen abgeleitet. */
export interface CoreConfig {
  /** Sichtbarer Datenordner, Standard ~/Raider (siehe Spec). */
  dataDir: string;
  /** Pfad zur SQLite-Datei. */
  databasePath: string;
  /** Port der lokalen API. */
  port: number;
  anthropic: AnthropicSettings;
}

const DEFAULT_PORT = 4179;
const DEFAULT_ANTHROPIC_BASE_URL = "https://api.anthropic.com";
const DEFAULT_MODEL = "claude-opus-4-8";
const DEFAULT_MAX_TOKENS = 2048;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): CoreConfig {
  const dataDir = env.RAIDER_DATA_DIR ?? join(homedir(), "Raider");
  const databasePath = env.RAIDER_DB_PATH ?? join(dataDir, "raider.db");
  const port = env.RAIDER_PORT ? Number(env.RAIDER_PORT) : DEFAULT_PORT;

  return {
    dataDir,
    databasePath,
    port,
    anthropic: {
      baseUrl: env.ANTHROPIC_BASE_URL ?? DEFAULT_ANTHROPIC_BASE_URL,
      defaultModel: env.RAIDER_MODEL ?? DEFAULT_MODEL,
      defaultMaxTokens: env.RAIDER_MAX_TOKENS ? Number(env.RAIDER_MAX_TOKENS) : DEFAULT_MAX_TOKENS,
    },
  };
}

/**
 * Liest den API-Key aus der Umgebung. Bewusst getrennt von loadConfig, damit
 * der Key nie versehentlich in einem geloggten Config-Objekt landet. Dieser
 * Wert darf niemals in Logs oder API-Antworten ausgegeben werden.
 */
export function getAnthropicApiKey(env: NodeJS.ProcessEnv = process.env): string | undefined {
  return env.ANTHROPIC_API_KEY;
}
