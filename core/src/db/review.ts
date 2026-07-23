import type { ReviewRun } from "@raider/shared";
import type { Db } from "./index";

interface ReviewRunRow {
  id: number;
  ran_at: string;
  created: number;
  skipped: number;
  note: string | null;
}

export function recordReviewRun(
  db: Db,
  input: { created: number; skipped: number; note: string | null },
): ReviewRun {
  const info = db
    .prepare("INSERT INTO review_runs (created, skipped, note) VALUES (?, ?, ?)")
    .run(input.created, input.skipped, input.note);
  const run = getReviewRun(db, Number(info.lastInsertRowid));
  if (!run) throw new Error("Review-Lauf konnte nicht gespeichert werden.");
  return run;
}

export function getReviewRun(db: Db, id: number): ReviewRun | undefined {
  const row = db.prepare("SELECT * FROM review_runs WHERE id = ?").get(id) as
    | ReviewRunRow
    | undefined;
  return row ? toRun(row) : undefined;
}

export function listReviewRuns(db: Db, limit = 20): ReviewRun[] {
  const rows = db
    .prepare("SELECT * FROM review_runs ORDER BY id DESC LIMIT ?")
    .all(limit) as ReviewRunRow[];
  return rows.map(toRun);
}

export function lastReviewRun(db: Db): ReviewRun | undefined {
  const row = db.prepare("SELECT * FROM review_runs ORDER BY id DESC LIMIT 1").get() as
    | ReviewRunRow
    | undefined;
  return row ? toRun(row) : undefined;
}

function toRun(row: ReviewRunRow): ReviewRun {
  return {
    id: row.id,
    ranAt: row.ran_at,
    created: row.created,
    skipped: row.skipped,
    note: row.note,
  };
}
