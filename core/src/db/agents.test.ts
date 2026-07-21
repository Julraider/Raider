import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  createAgent,
  deleteAgent,
  duplicateAgent,
  getAgent,
  listAgents,
  updateAgent,
} from "./agents";
import { openDatabase } from "./index";
import { runMigrations } from "./migrate";
import { createSession, getSession } from "./repository";

const migrationsDir = join(dirname(fileURLToPath(import.meta.url)), "migrations");

function freshDb() {
  const db = openDatabase(":memory:");
  runMigrations(db, migrationsDir);
  return db;
}

describe("Agenten", () => {
  it("legt an, liest, ändert und löscht", () => {
    const db = freshDb();
    const agent = createAgent(db, {
      name: "Coder",
      systemPrompt: "Du bist ein Programmier-Assistent.",
      model: "claude-haiku-4-5",
    });
    expect(agent.id).toBeGreaterThan(0);
    expect(getAgent(db, agent.id)?.name).toBe("Coder");

    const updated = updateAgent(db, agent.id, { name: "Coder Pro" });
    expect(updated?.name).toBe("Coder Pro");
    // Nicht angegebene Felder bleiben erhalten.
    expect(updated?.systemPrompt).toBe("Du bist ein Programmier-Assistent.");

    expect(deleteAgent(db, agent.id)).toBe(true);
    expect(getAgent(db, agent.id)).toBeUndefined();
  });

  it("dupliziert einen Agenten mit Namenszusatz", () => {
    const db = freshDb();
    const agent = createAgent(db, { name: "Basis", systemPrompt: "Hallo" });
    const copy = duplicateAgent(db, agent.id);
    expect(copy?.name).toBe("Basis (Kopie)");
    expect(copy?.systemPrompt).toBe("Hallo");
    expect(listAgents(db)).toHaveLength(2);
  });

  it("verknüpft eine Sitzung mit einem Agenten", () => {
    const db = freshDb();
    const agent = createAgent(db, { name: "A" });
    const session = createSession(db, { channel: "cli", agentId: agent.id });
    expect(getSession(db, session.id)?.agentId).toBe(agent.id);
  });
});
