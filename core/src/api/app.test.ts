import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type {
  ChatResponse,
  SearchResponse,
  Session,
  SessionMessagesResponse,
  StatusResponse,
} from "@raider/shared";
import { describe, expect, it } from "vitest";
import { openDatabase } from "../db/index";
import { runMigrations } from "../db/migrate";
import { createApp } from "./app";

const migrationsDir = join(dirname(fileURLToPath(import.meta.url)), "..", "db", "migrations");

/** Eine feste Chat-Antwort für Tests, ohne echten Anbieter. */
const stubChat = async (): Promise<ChatResponse> => ({
  role: "assistant",
  content: "Testantwort",
  model: "test-model",
  stopReason: "end_turn",
  usage: { inputTokens: 5, outputTokens: 3 },
});

function setupApp() {
  const db = openDatabase(":memory:");
  runMigrations(db, migrationsDir);
  return createApp(db, stubChat);
}

describe("GET /status", () => {
  it("meldet Version und angewendete Migration", async () => {
    const app = setupApp();
    const res = await app.request("/status");
    expect(res.status).toBe(200);

    const body = (await res.json()) as StatusResponse;
    expect(body.status).toBe("ok");
    expect(body.version).toMatch(/^\d+\.\d+\.\d+/);
    expect(body.database.connected).toBe(true);
    expect(body.database.migrations.applied).toBe(1);
    expect(body.database.migrations.latest).toBe("001_sessions_messages.sql");
  });
});

describe("Sitzungen", () => {
  it("legt eine Sitzung an, speichert einen Dialog-Zug und liest ihn zurück", async () => {
    const app = setupApp();

    const created = await app.request("/sessions", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ channel: "cli", title: "Test" }),
    });
    expect(created.status).toBe(201);
    const session = (await created.json()) as Session;
    expect(session.channel).toBe("cli");

    const turn = await app.request(`/sessions/${session.id}/messages`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ content: "Hallo Core" }),
    });
    expect(turn.status).toBe(200);
    const response = (await turn.json()) as ChatResponse;
    expect(response.content).toBe("Testantwort");

    const history = await app.request(`/sessions/${session.id}/messages`);
    const body = (await history.json()) as SessionMessagesResponse;
    expect(body.messages.map((m) => m.role)).toEqual(["user", "assistant"]);
    expect(body.messages[0]?.content).toBe("Hallo Core");
    expect(body.messages[1]?.tokensOut).toBe(3);
  });

  it("antwortet mit 404 für eine unbekannte Sitzung", async () => {
    const app = setupApp();
    const res = await app.request("/sessions/999/messages");
    expect(res.status).toBe(404);
  });
});

describe("GET /search", () => {
  it("findet gespeicherte Nachrichten per Volltext", async () => {
    const app = setupApp();

    const created = await app.request("/sessions", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ channel: "cli" }),
    });
    const session = (await created.json()) as Session;

    await app.request(`/sessions/${session.id}/messages`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ content: "Erzähl mir etwas über Segelboote" }),
    });

    const res = await app.request("/search?q=segelboote");
    expect(res.status).toBe(200);
    const body = (await res.json()) as SearchResponse;
    expect(body.hits.length).toBeGreaterThan(0);
    expect(body.hits[0]?.snippet).toContain("[Segelboote]");
  });

  it("verlangt einen Query-Parameter", async () => {
    const app = setupApp();
    const res = await app.request("/search");
    expect(res.status).toBe(400);
  });
});
