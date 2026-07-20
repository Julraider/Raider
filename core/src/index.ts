import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { serve } from "@hono/node-server";
import { createApp } from "./api/app";
import { loadConfig } from "./config";
import { openDatabase } from "./db/index";
import { runMigrations } from "./db/migrate";
import { version } from "./version";

const config = loadConfig();

// Datenordner sicherstellen, dann DB öffnen und migrieren.
mkdirSync(dirname(config.databasePath), { recursive: true });
const db = openDatabase(config.databasePath);

const migrationsDir = join(dirname(fileURLToPath(import.meta.url)), "db", "migrations");
const migrations = runMigrations(db, migrationsDir);

const app = createApp(db);

serve({ fetch: app.fetch, port: config.port }, (info) => {
  console.log(`Raider Core v${version} läuft auf http://localhost:${info.port}`);
  console.log(`Datenbank: ${config.databasePath} (${migrations.applied} Migrationen angewendet)`);
});
