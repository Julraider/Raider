import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { serve } from "@hono/node-server";
import type { SetupRequest, SetupStatus } from "@raider/shared";
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
import { readSecrets, resolveSecret, writeSecrets } from "./security/secrets";
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

/*
 * Anbieter: Einstellungen kommen aus der Umgebung ODER aus der Datei, die die
 * Einrichtung in der Oberfläche schreibt (Umgebung hat Vorrang). Der Anbieter
 * liegt in einer Variablen, damit er nach einer Änderung neu gebaut werden kann
 * — sonst müsste der Nutzer Raider nach jeder Einstellung neu starten.
 */
function currentSettings() {
  const stored = readSecrets(config.dataDir);
  const apiKey = resolveSecret(getAnthropicApiKey(), stored.anthropicApiKey);
  const provider = process.env.RAIDER_PROVIDER
    ? config.provider
    : (stored.provider ?? (apiKey ? "anthropic" : "ollama"));
  const model =
    process.env.RAIDER_MODEL ??
    stored.model ??
    (provider === "ollama" ? config.ollama.defaultModel : config.anthropic.defaultModel);
  return { apiKey, provider, model };
}

function buildProvider() {
  const { apiKey, provider, model } = currentSettings();
  const effective = {
    ...config,
    provider,
    anthropic: { ...config.anthropic, defaultModel: model },
    ollama: { ...config.ollama, defaultModel: model },
  };
  return createProvider(effective, apiKey);
}

let provider = buildProvider();
const chat: ChatFn = (request) => provider.complete(request);
// Beide Adapter können streamen; der Umweg über die Variable sorgt dafür, dass
// nach einem Anbieterwechsel sofort der neue benutzt wird.
const chatStream = (request: Parameters<ChatFn>[0]) => {
  const stream = provider.stream;
  if (!stream) throw new Error("Dieser Anbieter kann nicht streamen.");
  return stream.call(provider, request);
};

// Telegram-Token separat lesen (Geheimnis) — nur seine Existenz fließt in die App.
let telegramToken = resolveSecret(getTelegramToken(), readSecrets(config.dataDir).telegramToken);

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
  setup: {
    status: setupStatus,
    apply: applySetup,
    probeOllama,
  },
  chatStream,
  ops: {
    backupsDir: config.backupsDir,
    backupKeep: config.backupKeep,
    logRequests: config.logRequests,
    reviewEnabled: config.reviewIntervalSeconds > 0,
    provider: () => {
      const { apiKey, provider: name, model } = currentSettings();
      return { name, model, hasApiKey: apiKey !== undefined };
    },
    startedAt,
  },
});

/**
 * Was ist eingerichtet? Gibt NIEMALS ein Geheimnis zurück, nur die Auskunft,
 * ob eines vorliegt — und woher es kommt, damit die Oberfläche sagen kann,
 * dass ein in `.env` gesetzter Wert hier nicht überschreibbar ist.
 */
function setupStatus(): SetupStatus {
  const { apiKey, provider: name, model } = currentSettings();
  const stored = readSecrets(config.dataDir);
  const telegram = resolveSecret(getTelegramToken(), stored.telegramToken);
  return {
    ready: name === "ollama" || apiKey !== undefined,
    provider: name,
    model,
    hasApiKey: apiKey !== undefined,
    hasTelegramToken: telegram !== undefined,
    fromEnv: {
      apiKey: getAnthropicApiKey() !== undefined,
      telegramToken: getTelegramToken() !== undefined,
      provider: process.env.RAIDER_PROVIDER !== undefined,
    },
  };
}

/**
 * Übernimmt neue Einstellungen und baut den Anbieter sofort neu auf, damit der
 * Nutzer nicht neu starten muss. Werte, die aus der Umgebung kommen, werden
 * nicht angerührt — dort hat `.env` das letzte Wort.
 */
async function applySetup(patch: SetupRequest): Promise<SetupStatus> {
  const write: Parameters<typeof writeSecrets>[1] = {};
  if (patch.provider !== undefined) write.provider = patch.provider;
  if (patch.anthropicApiKey !== undefined) write.anthropicApiKey = patch.anthropicApiKey;
  if (patch.telegramToken !== undefined) write.telegramToken = patch.telegramToken;
  if (patch.model !== undefined) write.model = patch.model;

  writeSecrets(config.dataDir, write);

  // Anbieter neu aufbauen, damit die Änderung sofort greift.
  provider = buildProvider();
  telegramToken = resolveSecret(getTelegramToken(), readSecrets(config.dataDir).telegramToken);

  return setupStatus();
}

/**
 * Schaut nach, ob auf diesem Rechner ein Ollama-Server läuft, und welche
 * Modelle er anbietet. So kann die Einrichtung „ich nutze ein lokales Modell"
 * anbieten, ohne dass der Nutzer etwas eintippen muss.
 */
async function probeOllama(): Promise<{ reachable: boolean; models: string[] }> {
  try {
    const response = await fetch(`${config.ollama.baseUrl}/api/tags`, {
      signal: AbortSignal.timeout(2500),
    });
    if (!response.ok) return { reachable: false, models: [] };
    const data = (await response.json()) as { models?: Array<{ name?: string }> };
    const models = (data.models ?? [])
      .map((entry) => entry.name)
      .filter((name): name is string => typeof name === "string");
    return { reachable: true, models };
  } catch {
    return { reachable: false, models: [] };
  }
}

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
