import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { openDatabase } from "./index";
import { addMemoryEntry, listMemory, MemoryError, usedChars } from "./memory";
import { runMigrations } from "./migrate";

const migrationsDir = join(dirname(fileURLToPath(import.meta.url)), "migrations");

function freshDb() {
  const db = openDatabase(":memory:");
  runMigrations(db, migrationsDir);
  return db;
}

describe("Kerngedächtnis", () => {
  it("speichert einen Eintrag und zählt Zeichen", () => {
    const db = freshDb();
    addMemoryEntry(db, { store: "user", content: "Hallo" }, 1000);
    expect(usedChars(db, "user")).toBe(5);
    expect(listMemory(db, "user")).toHaveLength(1);
  });

  it("lehnt unsichtbare Zeichen ab", () => {
    const db = freshDb();
    // Zero-Width Space über den Codepoint, damit die Quelldatei sauber bleibt.
    const withZeroWidth = `Text${String.fromCharCode(0x200b)}mit`;
    expect(() => addMemoryEntry(db, { store: "user", content: withZeroWidth }, 1000)).toThrow(
      MemoryError,
    );
  });

  it("lehnt Überlauf ab", () => {
    const db = freshDb();
    expect(() => addMemoryEntry(db, { store: "user", content: "0123456789AB" }, 10)).toThrow(
      /voll/,
    );
  });

  it("lehnt Duplikate ab", () => {
    const db = freshDb();
    addMemoryEntry(db, { store: "user", content: "gleich" }, 1000);
    expect(() => addMemoryEntry(db, { store: "user", content: "gleich" }, 1000)).toThrow(
      /Duplikat/,
    );
  });
});
