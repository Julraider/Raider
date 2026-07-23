import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { beforeEach, describe, expect, it } from "vitest";
import type { ChatFn } from "../chat/turn";
import { type Db, openDatabase } from "../db/index";
import { addMemoryEntry } from "../db/memory";
import { runMigrations } from "../db/migrate";
import { listPendingWrites } from "../db/pending";
import { addMessage, createSession } from "../db/repository";
import { lastReviewRun } from "../db/review";
import { parseProposals, runReview } from "./reviewer";

const migrationsDir = join(dirname(fileURLToPath(import.meta.url)), "..", "db", "migrations");

/** Ein Modell, das eine feste JSON-Antwort liefert. */
function jsonChat(payload: string): ChatFn {
  return async () => ({
    role: "assistant",
    content: payload,
    model: "test",
    stopReason: "end_turn",
    usage: { inputTokens: 1, outputTokens: 1 },
  });
}

let db: Db;

/** Legt eine Sitzung mit etwas Gesprächsverlauf an (damit es Aktivität gibt). */
function seedActivity(): void {
  const session = createSession(db, { channel: "cli", title: "Test" });
  addMessage(db, { sessionId: session.id, role: "user", content: "Ich trinke Kaffee schwarz." });
  addMessage(db, { sessionId: session.id, role: "assistant", content: "Notiert." });
}

beforeEach(() => {
  db = openDatabase(":memory:");
  runMigrations(db, migrationsDir);
});

describe("parseProposals", () => {
  it("liest sauberes JSON", () => {
    const parsed = parseProposals('{"memory":[{"store":"user","content":"X"}],"skills":[]}');
    expect(parsed.memory).toHaveLength(1);
  });

  it("findet JSON auch mit Text drumherum", () => {
    const parsed = parseProposals('Klar! {"memory":[{"store":"user","content":"X"}]} — fertig.');
    expect(parsed.memory?.[0]?.content).toBe("X");
  });

  it("ergibt leere Listen bei Müll", () => {
    expect(parseProposals("kein json hier").memory ?? []).toHaveLength(0);
    expect(parseProposals("{kaputt").memory ?? []).toHaveLength(0);
  });
});

describe("runReview", () => {
  it("legt Vorschläge aus der Modell-Antwort in den Posteingang", async () => {
    seedActivity();
    const chat = jsonChat(
      '{"memory":[{"store":"user","content":"Trinkt Kaffee schwarz"}],"skills":[{"name":"Espresso","description":"macht Espresso","content":"Schritt 1..."}]}',
    );

    const summary = await runReview(db, chat);
    expect(summary.created).toBe(2);

    const pending = listPendingWrites(db, "pending");
    expect(pending.map((p) => p.kind).sort()).toEqual(["memory", "skill"]);
    expect(pending.every((p) => p.origin === "auto")).toBe(true);
  });

  it("überspringt Vorschläge, die schon im Gedächtnis stehen", async () => {
    seedActivity();
    addMemoryEntry(db, { store: "user", content: "Trinkt Kaffee schwarz" }, 1375);
    const chat = jsonChat('{"memory":[{"store":"user","content":"Trinkt Kaffee schwarz"}]}');

    const summary = await runReview(db, chat);
    expect(summary.created).toBe(0);
    expect(summary.skipped).toBe(1);
    expect(listPendingWrites(db, "pending")).toHaveLength(0);
  });

  it("tut nichts ohne Aktivität und protokolliert den Lauf", async () => {
    const chat = jsonChat('{"memory":[{"store":"user","content":"X"}]}');
    const summary = await runReview(db, chat);
    expect(summary.created).toBe(0);
    expect(summary.note).toBe("keine Aktivität");
    expect(lastReviewRun(db)?.created).toBe(0);
  });
});
