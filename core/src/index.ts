import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { serve } from "@hono/node-server";
import { createApp } from "./api/app";
import type { ChatFn } from "./chat/turn";
import { getAnthropicApiKey, getTelegramToken, loadConfig } from "./config";
import { openDatabase } from "./db/index";
import { runMigrations } from "./db/migrate";
import { createMcpRunner } from "./mcp/client";
import { createProvider } from "./providers";
import { createReviewRunner } from "./review/reviewer";
import { createScheduler } from "./scheduler/runner";
import { createTelegramApi } from "./telegram/api";
import { createTelegramGateway } from "./telegram/gateway";
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

// Telegram-Token separat lesen (Geheimnis) — nur seine Existenz fließt in die App.
const telegramToken = getTelegramToken();

const app = createApp(db, chat, createMcpRunner(), {
  memoryLimits: config.memory,
  skillsDir: config.skillsDir,
  telegram: {
    pairingTtlSeconds: config.telegram.pairingTtlSeconds,
    enabled: telegramToken !== undefined,
  },
});

serve({ fetch: app.fetch, port: config.port }, (info) => {
  console.log(`Raider Core v${version} läuft auf http://localhost:${info.port}`);
  console.log(`Datenbank: ${config.databasePath} (${migrations.applied} Migrationen angewendet)`);
  console.log(`Anbieter: ${describeProvider()}`);
  console.log(
    `Telegram: ${telegramToken ? "aktiv (koppeln: npm run telegram -- pair)" : "aus (RAIDER_TELEGRAM_TOKEN fehlt)"}`,
  );
  const review =
    config.reviewIntervalSeconds > 0
      ? `alle ${config.reviewIntervalSeconds}s`
      : "aus (RAIDER_REVIEW_INTERVAL=0) — manuell: npm run review";
  console.log(`Hintergrund-Review: ${review}`);
});

// Gateway nur starten, wenn ein Token da ist; der Token verlässt den Core nie.
if (telegramToken) {
  const gateway = createTelegramGateway({ db, api: createTelegramApi(telegramToken), chat });
  gateway.start();
}

// Scheduler läuft immer mit; er prüft vor jedem Lauf den Not-Stopp selbst.
createScheduler({ db, chat }).start();

// Hintergrund-Review nur bei gesetztem Intervall; prüft ebenfalls den Not-Stopp.
if (config.reviewIntervalSeconds > 0) {
  createReviewRunner(db, chat).start(config.reviewIntervalSeconds * 1000);
}

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
