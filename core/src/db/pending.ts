import type {
  CreatePendingWriteRequest,
  PendingProposal,
  PendingWrite,
  PendingWriteKind,
  PendingWriteOrigin,
  PendingWriteStatus,
} from "@raider/shared";
import type { Db } from "./index";

interface PendingRow {
  id: number;
  kind: string;
  proposal: string;
  origin: string;
  status: string;
  source_session_id: number | null;
  created_at: string;
  resolved_at: string | null;
}

export function createPendingWrite(db: Db, input: CreatePendingWriteRequest): PendingWrite {
  const info = db
    .prepare(
      "INSERT INTO pending_writes (kind, proposal, origin, source_session_id) VALUES (?, ?, ?, ?)",
    )
    .run(
      input.kind,
      JSON.stringify(input.proposal),
      input.origin ?? "auto",
      input.sourceSessionId ?? null,
    );
  const write = getPendingWrite(db, Number(info.lastInsertRowid));
  if (!write) throw new Error("Vorschlag konnte nicht angelegt werden.");
  return write;
}

export function getPendingWrite(db: Db, id: number): PendingWrite | undefined {
  const row = db.prepare("SELECT * FROM pending_writes WHERE id = ?").get(id) as
    | PendingRow
    | undefined;
  return row ? toPending(row) : undefined;
}

export function listPendingWrites(db: Db, status?: PendingWriteStatus): PendingWrite[] {
  const rows = status
    ? (db
        .prepare("SELECT * FROM pending_writes WHERE status = ? ORDER BY id DESC")
        .all(status) as PendingRow[])
    : (db.prepare("SELECT * FROM pending_writes ORDER BY id DESC").all() as PendingRow[]);
  return rows.map(toPending);
}

export function resolvePendingWrite(
  db: Db,
  id: number,
  status: PendingWriteStatus,
): PendingWrite | undefined {
  db.prepare(
    "UPDATE pending_writes SET status = ?, resolved_at = datetime('now') WHERE id = ?",
  ).run(status, id);
  return getPendingWrite(db, id);
}

export function deletePendingWrite(db: Db, id: number): boolean {
  return db.prepare("DELETE FROM pending_writes WHERE id = ?").run(id).changes > 0;
}

function toPending(row: PendingRow): PendingWrite {
  return {
    id: row.id,
    kind: row.kind as PendingWriteKind,
    proposal: JSON.parse(row.proposal) as PendingProposal,
    origin: row.origin as PendingWriteOrigin,
    status: row.status as PendingWriteStatus,
    sourceSessionId: row.source_session_id,
    createdAt: row.created_at,
    resolvedAt: row.resolved_at,
  };
}
