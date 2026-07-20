import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { ChatResponse, StatusResponse } from "@raider/shared";
import Database from "better-sqlite3";
import { describe, expect, it } from "vitest";
import { runMigrations } from "../db/migrate";
import { createApp } from "./app";

const migrationsDir = join(dirname(fileURLToPath(import.meta.url)), "..", "db", "migrations");

/** Eine feste Chat-Antwort für Tests, ohne echten Anbieter. */
const stubChat = async (): Promise<ChatResponse> => ({
  role: "assistant",
  content: "Testantwort",
  model: "test-model",
  stopReason: "end_turn",
  usage: { inputTokens: 1, outputTokens: 2 },
});

/** Frische App gegen eine flüchtige In-Memory-Datenbank. */
function setupApp() {
  const db = new Database(":memory:");
  runMigrations(db, migrationsDir);
  return createApp(db, stubChat);
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

describe("POST /chat", () => {
  it("gibt die Antwort im internen Format zurück", async () => {
    const app = setupApp();

    const res = await app.request("/chat", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ messages: [{ role: "user", content: "Hallo" }] }),
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as ChatResponse;
    expect(body.content).toBe("Testantwort");
    expect(body.usage).toEqual({ inputTokens: 1, outputTokens: 2 });
  });

  it("lehnt einen leeren messages-Body mit 400 ab", async () => {
    const app = setupApp();

    const res = await app.request("/chat", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ messages: [] }),
    });

    expect(res.status).toBe(400);
  });
});
