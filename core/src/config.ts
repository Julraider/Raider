import { homedir } from "node:os";
import { join } from "node:path";

/** Verfügbare Anbieter. */
export type ProviderName = "anthropic" | "ollama";

/** Einstellungen für den Anthropic-Anbieter. */
export interface AnthropicSettings {
  /** Basis-URL, per ANTHROPIC_BASE_URL überschreibbar. */
  baseUrl: string;
  defaultModel: string;
  defaultMaxTokens: number;
}

/** Einstellungen für lokale Modelle über Ollama. */
export interface OllamaSettings {
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
  /** Aktiver Anbieter. */
  provider: ProviderName;
  anthropic: AnthropicSettings;
  ollama: OllamaSettings;
}

const DEFAULT_PORT = 4179;
const DEFAULT_ANTHROPIC_BASE_URL = "https://api.anthropic.com";
const DEFAULT_ANTHROPIC_MODEL = "claude-opus-4-8";
const DEFAULT_OLLAMA_BASE_URL = "http://localhost:11434";
const DEFAULT_OLLAMA_MODEL = "llama3.2";
const DEFAULT_MAX_TOKENS = 2048;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): CoreConfig {
  const dataDir = env.RAIDER_DATA_DIR ?? join(homedir(), "Raider");
  const databasePath = env.RAIDER_DB_PATH ?? join(dataDir, "raider.db");
  const port = env.RAIDER_PORT ? Number(env.RAIDER_PORT) : DEFAULT_PORT;
  const maxTokens = env.RAIDER_MAX_TOKENS ? Number(env.RAIDER_MAX_TOKENS) : DEFAULT_MAX_TOKENS;

  return {
    dataDir,
    databasePath,
    port,
    provider: resolveProvider(env),
    anthropic: {
      baseUrl: env.ANTHROPIC_BASE_URL ?? DEFAULT_ANTHROPIC_BASE_URL,
      defaultModel: env.RAIDER_MODEL ?? DEFAULT_ANTHROPIC_MODEL,
      defaultMaxTokens: maxTokens,
    },
    ollama: {
      baseUrl: env.RAIDER_OLLAMA_URL ?? DEFAULT_OLLAMA_BASE_URL,
      defaultModel: env.RAIDER_OLLAMA_MODEL ?? DEFAULT_OLLAMA_MODEL,
      defaultMaxTokens: maxTokens,
    },
  };
}

/**
 * Wählt den Anbieter: explizit über RAIDER_PROVIDER, sonst automatisch
 * Anthropic, wenn ein Key da ist, andernfalls Ollama (lokal, kostenlos).
 * Prüft nur die Existenz des Keys, nie seinen Wert.
 */
function resolveProvider(env: NodeJS.ProcessEnv): ProviderName {
  const raw = env.RAIDER_PROVIDER;
  if (raw === "anthropic" || raw === "ollama") return raw;
  return env.ANTHROPIC_API_KEY ? "anthropic" : "ollama";
}

/**
 * Liest den API-Key aus der Umgebung. Bewusst getrennt von loadConfig, damit
 * der Key nie versehentlich in einem geloggten Config-Objekt landet. Dieser
 * Wert darf niemals in Logs oder API-Antworten ausgegeben werden.
 */
export function getAnthropicApiKey(env: NodeJS.ProcessEnv = process.env): string | undefined {
  return env.ANTHROPIC_API_KEY;
}
