import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { serve } from "@hono/node-server";
import { type ChatFn, createApp } from "./api/app";
import { getAnthropicApiKey, loadConfig } from "./config";
import { openDatabase } from "./db/index";
import { runMigrations } from "./db/migrate";
import { createMcpRunner } from "./mcp/client";
import { createProvider } from "./providers";
import { version } from "./version";

const config = loadConfig();

// Datenordner (und Skill-Ordner) sicherstellen, dann DB öffnen und migrieren.
mkdirSync(dirname(config.databasePath), { recursive: true });
mkdirSync(config.skillsDir, { recursive: true });
const db = openDatabase(config.databasePath);

const migrationsDir = join(dirname(fileURLToPath(import.meta.url)), "db", "migrations");
const migrations = runMigrations(db, migrationsDir);

// Anbieter anhand der Konfiguration wählen; der Key kommt separat rein.
const provider = createProvider(config, getAnthropicApiKey());
const chat: ChatFn = (request) => provider.complete(request);

const app = createApp(db, chat, createMcpRunner(), {
  memoryLimits: config.memory,
  skillsDir: config.skillsDir,
});

serve({ fetch: app.fetch, port: config.port }, (info) => {
  console.log(`Raider Core v${version} läuft auf http://localhost:${info.port}`);
  console.log(`Datenbank: ${config.databasePath} (${migrations.applied} Migrationen angewendet)`);
  console.log(`Anbieter: ${describeProvider()}`);
});

/** Kurze Beschreibung des aktiven Anbieters fürs Log (ohne Geheimnisse). */
function describeProvider(): string {
  if (config.provider === "ollama") {
    return `Ollama (${config.ollama.defaultModel}) auf ${config.ollama.baseUrl} — kein Key nötig`;
  }
  const hasKey = getAnthropicApiKey() !== undefined;
  return `Anthropic (${config.anthropic.defaultModel}) — API-Key ${
    hasKey ? "gesetzt" : "fehlt (ANTHROPIC_API_KEY)"
  }`;
}
