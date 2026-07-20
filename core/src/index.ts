import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { serve } from "@hono/node-server";
import { type ChatFn, createApp } from "./api/app";
import { getAnthropicApiKey, loadConfig } from "./config";
import { openDatabase } from "./db/index";
import { runMigrations } from "./db/migrate";
import { complete, MissingApiKeyError } from "./providers/anthropic";
import { version } from "./version";

const config = loadConfig();

// Datenordner sicherstellen, dann DB öffnen und migrieren.
mkdirSync(dirname(config.databasePath), { recursive: true });
const db = openDatabase(config.databasePath);

const migrationsDir = join(dirname(fileURLToPath(import.meta.url)), "db", "migrations");
const migrations = runMigrations(db, migrationsDir);

// Der Key wird pro Anfrage serverseitig gelesen — Clients senden ihn nie.
const chat: ChatFn = async (request) => {
  const apiKey = getAnthropicApiKey();
  if (!apiKey) throw new MissingApiKeyError();
  return complete(
    {
      apiKey,
      baseUrl: config.anthropic.baseUrl,
      defaultModel: config.anthropic.defaultModel,
      defaultMaxTokens: config.anthropic.defaultMaxTokens,
    },
    request,
  );
};

const app = createApp(db, chat);
const hasApiKey = getAnthropicApiKey() !== undefined;

serve({ fetch: app.fetch, port: config.port }, (info) => {
  console.log(`Raider Core v${version} läuft auf http://localhost:${info.port}`);
  console.log(`Datenbank: ${config.databasePath} (${migrations.applied} Migrationen angewendet)`);
  console.log(
    `Anbieter: Anthropic (${config.anthropic.defaultModel}) — API-Key ${
      hasApiKey ? "gesetzt" : "fehlt (ANTHROPIC_API_KEY)"
    }`,
  );
});
