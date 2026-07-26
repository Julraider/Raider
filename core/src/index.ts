import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { serve } from "@hono/node-server";
import { createApp } from "./api/app";
import type { ChatFn } from "./chat/turn";
import { getAnthropicApiKey, getTelegramToken, loadConfig } from "./config";
import { createBackup } from "./db/backup";
import { openDatabase } from "./db/index";
import { runMigrations } from "./db/migrate";
import { createMcpRunner } from "./mcp/client";
import { createProvider } from "./providers";
import { createReviewRunner } from "./review/reviewer";
import { createScheduler } from "./scheduler/runner";
import { ensureAccessToken, tokenPath } from "./security/token";
import { createTelegramApi } from "./telegram/api";
import { createTelegramGateway } from "./telegram/gateway";
import { version } from "./version";

const startedAt = Date.now();
/** Aufräum-Aktionen fürs saubere Herunterfahren (Runner stoppen etc.). */
const shutdownTasks: Array<() => void> = [];

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
// Streamen kann nicht jeder Anbieter — fehlt es, bleibt der Stream-Endpunkt aus
// und die Oberfläche fällt still auf die normale Antwort zurück.
const chatStream = provider.stream?.bind(provider);

// Telegram-Token separat lesen (Geheimnis) — nur seine Existenz fließt in die App.
const telegramToken = getTelegramToken();

// Zugriffstoken beim ersten Start anlegen; danach nur noch gelesen.
const accessToken = ensureAccessToken(config.dataDir);

const mcpRunner = createMcpRunner();
const app = createApp(db, chat, mcpRunner, {
  memoryLimits: config.memory,
  skillsDir: config.skillsDir,
  telegram: {
    pairingTtlSeconds: config.telegram.pairingTtlSeconds,
    enabled: telegramToken !== undefined,
  },
  accessToken,
  ...(chatStream ? { chatStream } : {}),
  ops: {
    backupsDir: config.backupsDir,
    backupKeep: config.backupKeep,
    logRequests: config.logRequests,
    reviewEnabled: config.reviewIntervalSeconds > 0,
    provider: {
      name: config.provider,
      model:
        config.provider === "ollama" ? config.ollama.defaultModel : config.anthropic.defaultModel,
      hasApiKey: getAnthropicApiKey() !== undefined,
    },
    startedAt,
  },
});

/** Adressen, die nur den eigenen Rechner meinen. */
function isLoopback(host: string): boolean {
  return host === "127.0.0.1" || host === "::1" || host === "localhost";
}

// `hostname` MUSS gesetzt sein: ohne die Angabe lauscht Node auf allen
// Netzwerkkarten, und da die API bewusst ohne Passwort arbeitet, könnte dann
// jedes Gerät im selben WLAN Gespräche mitlesen und Werkzeuge auslösen.
serve({ fetch: app.fetch, port: config.port, hostname: config.host }, (info) => {
  console.log(`Raider Core v${version} läuft auf http://localhost:${info.port}`);
  if (!isLoopback(config.host)) {
    console.warn(
      `WARNUNG: Der Core ist über das Netzwerk erreichbar (RAIDER_HOST=${config.host}).\n` +
        "         Die API hat kein Passwort — jedes Gerät im selben Netz kann deine\n" +
        "         Gespräche lesen und Werkzeuge auslösen. Nur in vertrauenswürdigen\n" +
        "         Netzen verwenden; sonst RAIDER_HOST entfernen.",
    );
  }
  console.log(`Datenbank: ${config.databasePath} (${migrations.applied} Migrationen angewendet)`);
  // Nur den PFAD ausgeben, niemals das Token selbst.
  console.log(`Zugriffstoken: ${tokenPath(config.dataDir)}`);
  console.log(`Anbieter: ${describeProvider()}`);
  console.log(
    `Telegram: ${telegramToken ? "aktiv (koppeln: npm run telegram -- pair)" : "aus (RAIDER_TELEGRAM_TOKEN fehlt)"}`,
  );
  const review =
    config.reviewIntervalSeconds > 0
      ? `alle ${config.reviewIntervalSeconds}s`
      : "aus (RAIDER_REVIEW_INTERVAL=0) — manuell: npm run review";
  console.log(`Hintergrund-Review: ${review}`);
  const backup =
    config.backupIntervalSeconds > 0
      ? `alle ${config.backupIntervalSeconds}s (${config.backupsDir})`
      : "aus (RAIDER_BACKUP_INTERVAL=0) — manuell: npm run backup";
  console.log(`Auto-Backup: ${backup}`);
});

// Gateway nur starten, wenn ein Token da ist; der Token verlässt den Core nie.
if (telegramToken) {
  const gateway = createTelegramGateway({ db, api: createTelegramApi(telegramToken), chat });
  gateway.start();
  shutdownTasks.push(() => gateway.stop());
}

// Scheduler läuft immer mit; er prüft vor jedem Lauf den Not-Stopp selbst.
const scheduler = createScheduler({ db, chat, tools: mcpRunner });
scheduler.start();
shutdownTasks.push(() => scheduler.stop());

// Hintergrund-Review nur bei gesetztem Intervall; prüft ebenfalls den Not-Stopp.
if (config.reviewIntervalSeconds > 0) {
  const reviewRunner = createReviewRunner(db, chat);
  reviewRunner.start(config.reviewIntervalSeconds * 1000);
  shutdownTasks.push(() => reviewRunner.stop());
}

// Automatische Sicherungen, wenn ein Intervall gesetzt ist.
if (config.backupIntervalSeconds > 0) {
  const timer = setInterval(() => {
    createBackup(db, config.backupsDir, config.backupKeep).catch((error) =>
      console.error("Auto-Backup fehlgeschlagen:", error),
    );
  }, config.backupIntervalSeconds * 1000);
  timer.unref?.();
  shutdownTasks.push(() => clearInterval(timer));
}

// Sauberes Herunterfahren: Runner stoppen, WAL-Checkpoint, DB schließen.
let shuttingDown = false;
function shutdown(signal: string): void {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`\n${signal} empfangen — fahre sauber herunter …`);
  for (const task of shutdownTasks) {
    try {
      task();
    } catch (error) {
      console.error("Fehler beim Herunterfahren:", error);
    }
  }
  try {
    db.pragma("wal_checkpoint(TRUNCATE)");
    db.close();
  } catch (error) {
    console.error("Fehler beim Schließen der Datenbank:", error);
  }
  process.exit(0);
}
process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));

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
