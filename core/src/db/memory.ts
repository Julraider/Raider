import type { MemoryEntry, MemoryStore } from "@raider/shared";
import type { Db } from "./index";

/**
 * Kerngedächtnis (Memory Ebene 1). ALLE Schreibzugriffe laufen durch dieses
 * Modul — better-sqlite3 ist synchron und Node einthreadig, damit sind Writes
 * serialisiert (nie parallel), wie es der Spec verlangt.
 */

/** Fehler beim Schreiben ins Kerngedächtnis, mit passendem HTTP-Status. */
export class MemoryError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "MemoryError";
    this.status = status;
  }
}

interface MemoryRow {
  id: number;
  store: string;
  content: string;
  source_session_id: number | null;
  created_at: string;
  updated_at: string;
}

export interface NewMemoryEntry {
  store: MemoryStore;
  content: string;
  sourceSessionId?: number | null;
}

// Heuristik gegen Prompt-Injection. Bewusst ein erster Filter, keine Garantie.
const INJECTION =
  /\b(ignore|disregard|forget)\b[^.]{0,40}\b(previous|above|prior|earlier|all)\b[^.]{0,40}\b(instructions?|prompts?|rules?)\b|\byou are now\b|\bsystem prompt\b|<\/?system>|\[INST\]/i;

export function listMemory(db: Db, store: MemoryStore): MemoryEntry[] {
  const rows = db
    .prepare(
      "SELECT id, store, content, source_session_id, created_at, updated_at FROM memory_entries WHERE store = ? ORDER BY id",
    )
    .all(store) as MemoryRow[];
  return rows.map(toEntry);
}

/** Genutzte Zeichen in einem Speicher. */
export function usedChars(db: Db, store: MemoryStore): number {
  return listMemory(db, store).reduce((sum, entry) => sum + entry.content.length, 0);
}

export function addMemoryEntry(db: Db, input: NewMemoryEntry, limit: number): MemoryEntry {
  const content = input.content.trim();
  validate(content);

  if (isDuplicate(db, input.store, content)) {
    throw new MemoryError(409, "Eintrag ist ein Duplikat und wurde abgelehnt.");
  }

  const used = usedChars(db, input.store);
  if (used + content.length > limit) {
    throw new MemoryError(
      413,
      `Kerngedächtnis voll: ${used} + ${content.length} > ${limit} Zeichen. Bitte verdichten.`,
    );
  }

  const info = db
    .prepare("INSERT INTO memory_entries (store, content, source_session_id) VALUES (?, ?, ?)")
    .run(input.store, content, input.sourceSessionId ?? null);
  const entry = getEntry(db, Number(info.lastInsertRowid));
  if (!entry) throw new MemoryError(500, "Eintrag konnte nicht gespeichert werden.");
  return entry;
}

export function updateMemoryEntry(
  db: Db,
  id: number,
  rawContent: string,
  limit: number,
): MemoryEntry | undefined {
  const existing = getEntry(db, id);
  if (!existing) return undefined;

  const content = rawContent.trim();
  validate(content);

  if (isDuplicate(db, existing.store, content, id)) {
    throw new MemoryError(409, "Eintrag ist ein Duplikat und wurde abgelehnt.");
  }

  const usedWithout = usedChars(db, existing.store) - existing.content.length;
  if (usedWithout + content.length > limit) {
    throw new MemoryError(413, "Kerngedächtnis voll. Bitte verdichten.");
  }

  db.prepare(
    "UPDATE memory_entries SET content = ?, updated_at = datetime('now') WHERE id = ?",
  ).run(content, id);
  return getEntry(db, id);
}

export function deleteMemoryEntry(db: Db, id: number): boolean {
  return db.prepare("DELETE FROM memory_entries WHERE id = ?").run(id).changes > 0;
}

export function getEntry(db: Db, id: number): MemoryEntry | undefined {
  const row = db
    .prepare(
      "SELECT id, store, content, source_session_id, created_at, updated_at FROM memory_entries WHERE id = ?",
    )
    .get(id) as MemoryRow | undefined;
  return row ? toEntry(row) : undefined;
}

function validate(content: string): void {
  if (content === "") throw new MemoryError(400, "Eintrag darf nicht leer sein.");
  if (hasInvisibleChars(content)) {
    throw new MemoryError(400, "Eintrag enthält unsichtbare Zeichen und wurde abgelehnt.");
  }
  if (INJECTION.test(content)) {
    throw new MemoryError(400, "Eintrag sieht nach Prompt-Injection aus und wurde abgelehnt.");
  }
}

/**
 * Erkennt Steuer-, Zero-Width-, Bidi-Override-, Word-Joiner- und BOM-Zeichen
 * über die Codepoints. Normale Whitespaces (Tab, Zeilenumbruch, Wagenrücklauf)
 * bleiben erlaubt.
 */
function hasInvisibleChars(text: string): boolean {
  for (const ch of text) {
    const code = ch.codePointAt(0) ?? 0;
    if (
      code <= 0x08 ||
      code === 0x0b ||
      code === 0x0c ||
      (code >= 0x0e && code <= 0x1f) ||
      code === 0x7f ||
      (code >= 0x200b && code <= 0x200f) ||
      code === 0x2028 ||
      code === 0x2029 ||
      (code >= 0x202a && code <= 0x202e) ||
      (code >= 0x2060 && code <= 0x2064) ||
      code === 0xfeff
    ) {
      return true;
    }
  }
  return false;
}

function isDuplicate(db: Db, store: MemoryStore, content: string, excludeId?: number): boolean {
  const row =
    excludeId !== undefined
      ? db
          .prepare("SELECT id FROM memory_entries WHERE store = ? AND content = ? AND id != ?")
          .get(store, content, excludeId)
      : db
          .prepare("SELECT id FROM memory_entries WHERE store = ? AND content = ?")
          .get(store, content);
  return row !== undefined;
}

function toEntry(row: MemoryRow): MemoryEntry {
  return {
    id: row.id,
    store: row.store as MemoryStore,
    content: row.content,
    sourceSessionId: row.source_session_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
