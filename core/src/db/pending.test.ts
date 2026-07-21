import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { openDatabase } from "./index";
import { runMigrations } from "./migrate";
import {
  createPendingWrite,
  getPendingWrite,
  listPendingWrites,
  resolvePendingWrite,
} from "./pending";

const migrationsDir = join(dirname(fileURLToPath(import.meta.url)), "migrations");

function freshDb() {
  const db = openDatabase(":memory:");
  runMigrations(db, migrationsDir);
  return db;
}

describe("Freigabe-Posteingang", () => {
  it("stellt einen Vorschlag ein und filtert nach Status", () => {
    const db = freshDb();
    const write = createPendingWrite(db, {
      kind: "memory",
      proposal: { store: "user", content: "Mag Tee." },
      origin: "chat",
    });
    expect(write.status).toBe("pending");
    expect(write.proposal.content).toBe("Mag Tee.");

    expect(listPendingWrites(db, "pending")).toHaveLength(1);
    expect(listPendingWrites(db, "approved")).toHaveLength(0);
  });

  it("löst einen Vorschlag auf (Status + Zeitstempel)", () => {
    const db = freshDb();
    const write = createPendingWrite(db, {
      kind: "memory",
      proposal: { store: "user", content: "x" },
      origin: "auto",
    });
    const resolved = resolvePendingWrite(db, write.id, "rejected");
    expect(resolved?.status).toBe("rejected");
    expect(resolved?.resolvedAt).not.toBeNull();
    expect(getPendingWrite(db, write.id)?.status).toBe("rejected");
  });
});
