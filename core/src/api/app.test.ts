import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { StatusResponse } from "@raider/shared";
import Database from "better-sqlite3";
import { describe, expect, it } from "vitest";
import { runMigrations } from "../db/migrate";
import { createApp } from "./app";

const migrationsDir = join(dirname(fileURLToPath(import.meta.url)), "..", "db", "migrations");

/** Frische App gegen eine flüchtige In-Memory-Datenbank. */
function setupApp() {
  const db = new Database(":memory:");
  runMigrations(db, migrationsDir);
  return createApp(db);
}

describe("GET /status", () => {
  it("meldet Version und Datenbankstatus", async () => {
    const app = setupApp();

    const res = await app.request("/status");
    expect(res.status).toBe(200);

    const body = (await res.json()) as StatusResponse;
    expect(body.status).toBe("ok");
    expect(body.version).toMatch(/^\d+\.\d+\.\d+/);
    expect(body.database.connected).toBe(true);
    // Im Skelett gibt es noch keine Migrationsdateien.
    expect(body.database.migrations.applied).toBe(0);
    expect(body.database.migrations.latest).toBeNull();
  });
});
