import type { EmergencyStopState } from "@raider/shared";
import type { Db } from "./index";

interface StopRow {
  engaged: number;
  engaged_at: string | null;
  reason: string | null;
}

/** Schneller Ja/Nein-Check — nutzen Scheduler, Telegram und MCP-Aufrufe. */
export function isStopped(db: Db): boolean {
  const row = db.prepare("SELECT engaged FROM emergency_stop WHERE id = 1").get() as
    | { engaged: number }
    | undefined;
  return row?.engaged === 1;
}

export function getStop(db: Db): EmergencyStopState {
  const row = db
    .prepare("SELECT engaged, engaged_at, reason FROM emergency_stop WHERE id = 1")
    .get() as StopRow | undefined;
  return {
    engaged: row?.engaged === 1,
    engagedAt: row?.engaged_at ?? null,
    reason: row?.reason ?? null,
  };
}

export function engageStop(db: Db, reason: string | null): EmergencyStopState {
  db.prepare(
    "UPDATE emergency_stop SET engaged = 1, engaged_at = datetime('now'), reason = ? WHERE id = 1",
  ).run(reason);
  return getStop(db);
}

export function releaseStop(db: Db): EmergencyStopState {
  db.prepare(
    "UPDATE emergency_stop SET engaged = 0, engaged_at = NULL, reason = NULL WHERE id = 1",
  ).run();
  return getStop(db);
}
