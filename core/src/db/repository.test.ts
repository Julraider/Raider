import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { openDatabase } from "./index";
import { runMigrations } from "./migrate";
import { addMessage, createSession, getMessages, listSessions, searchMessages } from "./repository";

const migrationsDir = join(dirname(fileURLToPath(import.meta.url)), "migrations");

function freshDb() {
  const db = openDatabase(":memory:");
  runMigrations(db, migrationsDir);
  return db;
}

describe("Sitzungen & Nachrichten", () => {
  it("speichert Nachrichten in Reihenfolge und mit Token-Zahlen", () => {
    const db = freshDb();
    const session = createSession(db, { channel: "cli", title: "Test" });
    expect(session.status).toBe("active");

    addMessage(db, { sessionId: session.id, role: "user", content: "Hallo" });
    addMessage(db, {
      sessionId: session.id,
      role: "assistant",
      content: "Hi!",
      tokensIn: 4,
      tokensOut: 2,
    });

    const messages = getMessages(db, session.id);
    expect(messages.map((m) => m.role)).toEqual(["user", "assistant"]);
    expect(messages[1]?.tokensOut).toBe(2);
  });

  it("listet Sitzungen mit Nachrichtenzahl", () => {
    const db = freshDb();
    const session = createSession(db, { channel: "cli" });
    addMessage(db, { sessionId: session.id, role: "user", content: "Eins" });

    const list = listSessions(db);
    expect(list).toHaveLength(1);
    expect(list[0]?.messageCount).toBe(1);
  });
});

describe("Volltextsuche (FTS5)", () => {
  it("findet Nachrichten und markiert die Fundstelle", () => {
    const db = freshDb();
    const session = createSession(db, { channel: "cli" });
    addMessage(db, { sessionId: session.id, role: "user", content: "Ich mag Segelboote und Wind" });
    addMessage(db, { sessionId: session.id, role: "user", content: "Heute gibt es Pasta" });

    const hits = searchMessages(db, "segelboote");
    expect(hits).toHaveLength(1);
    expect(hits[0]?.snippet).toContain("[Segelboote]");
  });

  it("verknüpft mehrere Wörter mit UND", () => {
    const db = freshDb();
    const session = createSession(db, { channel: "cli" });
    addMessage(db, { sessionId: session.id, role: "user", content: "Segelboote bei Wind" });
    addMessage(db, { sessionId: session.id, role: "user", content: "Segelboote im Hafen" });

    expect(searchMessages(db, "segelboote wind")).toHaveLength(1);
    expect(searchMessages(db, "segelboote")).toHaveLength(2);
  });

  it("gibt bei leerer Query nichts zurück", () => {
    const db = freshDb();
    expect(searchMessages(db, "   ")).toEqual([]);
  });
});
