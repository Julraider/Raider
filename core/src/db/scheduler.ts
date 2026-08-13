import type { ScheduledTask, ScheduleKind, TaskRunStatus } from "@raider/shared";
import type { Db } from "./index";

interface TaskRow {
  id: number;
  name: string;
  schedule_kind: string;
  schedule_value: string;
  agent_id: number | null;
  prompt: string;
  enabled: number;
  last_run_at: string | null;
  last_status: string | null;
  last_error: string | null;
  last_session_id: number | null;
  next_run_at: string;
  created_at: string;
}

/**
 * Ausgang eines Laufs. Ohne Angabe wird das Ergebnis nicht angefasst — das
 * brauchen ältere Aufrufer und Tests, die nur die Fälligkeit fortschreiben.
 */
export interface TaskRunOutcome {
  status: TaskRunStatus;
  /** Klartext für den Nutzer, wenn etwas schiefging. */
  error?: string | null;
  /** Sitzung, in der der Lauf stattfand. */
  sessionId?: number | null;
}

export interface NewScheduledTask {
  name: string;
  scheduleKind: ScheduleKind;
  scheduleValue: string;
  prompt: string;
  agentId?: number | null;
}

export interface ScheduledTaskPatch {
  name?: string;
  scheduleKind?: ScheduleKind;
  scheduleValue?: string;
  prompt?: string;
  agentId?: number | null;
  enabled?: boolean;
}

/** Fehler bei einer ungültigen Zeitplan-Angabe (→ HTTP 400). */
export class ScheduleError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ScheduleError";
  }
}

export function createScheduledTask(
  db: Db,
  input: NewScheduledTask,
  now = new Date(),
): ScheduledTask {
  const nextRun = computeNextRun(input.scheduleKind, input.scheduleValue, now);
  const info = db
    .prepare(
      `INSERT INTO scheduled_tasks (name, schedule_kind, schedule_value, agent_id, prompt, next_run_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
    )
    .run(
      input.name,
      input.scheduleKind,
      input.scheduleValue,
      input.agentId ?? null,
      input.prompt,
      nextRun.toISOString(),
    );
  const task = getScheduledTask(db, Number(info.lastInsertRowid));
  if (!task) throw new Error("Aufgabe konnte nicht angelegt werden.");
  return task;
}

export function getScheduledTask(db: Db, id: number): ScheduledTask | undefined {
  const row = db.prepare("SELECT * FROM scheduled_tasks WHERE id = ?").get(id) as
    | TaskRow
    | undefined;
  return row ? toTask(row) : undefined;
}

export function listScheduledTasks(db: Db): ScheduledTask[] {
  const rows = db
    .prepare("SELECT * FROM scheduled_tasks ORDER BY next_run_at, id")
    .all() as TaskRow[];
  return rows.map(toTask);
}

export function updateScheduledTask(
  db: Db,
  id: number,
  patch: ScheduledTaskPatch,
  now = new Date(),
): ScheduledTask | undefined {
  const current = getScheduledTask(db, id);
  if (!current) return undefined;

  const scheduleKind = patch.scheduleKind ?? current.scheduleKind;
  const scheduleValue = patch.scheduleValue ?? current.scheduleValue;
  const name = patch.name ?? current.name;
  const prompt = patch.prompt ?? current.prompt;
  const agentId = patch.agentId !== undefined ? patch.agentId : current.agentId;
  const enabled = patch.enabled ?? current.enabled;

  // Bei geänderter Zeitplanung die nächste Fälligkeit neu berechnen.
  const scheduleChanged = patch.scheduleKind !== undefined || patch.scheduleValue !== undefined;
  const nextRunAt = scheduleChanged
    ? computeNextRun(scheduleKind, scheduleValue, now).toISOString()
    : current.nextRunAt;

  db.prepare(
    `UPDATE scheduled_tasks
     SET name = ?, schedule_kind = ?, schedule_value = ?, agent_id = ?, prompt = ?, enabled = ?, next_run_at = ?
     WHERE id = ?`,
  ).run(name, scheduleKind, scheduleValue, agentId, prompt, enabled ? 1 : 0, nextRunAt, id);
  return getScheduledTask(db, id);
}

export function deleteScheduledTask(db: Db, id: number): boolean {
  return db.prepare("DELETE FROM scheduled_tasks WHERE id = ?").run(id).changes > 0;
}

/** Fällige, aktive Aufgaben (nächste Fälligkeit <= jetzt). */
export function dueTasks(db: Db, now = new Date()): ScheduledTask[] {
  const rows = db
    .prepare(
      "SELECT * FROM scheduled_tasks WHERE enabled = 1 AND next_run_at <= ? ORDER BY next_run_at, id",
    )
    .all(now.toISOString()) as TaskRow[];
  return rows.map(toTask);
}

/**
 * Vermerkt einen Lauf: setzt last_run_at, das Ergebnis und berechnet
 * next_run_at. Eine `once`-Aufgabe wird danach deaktiviert (läuft nicht
 * erneut).
 *
 * Das Ergebnis wird immer mitgeschrieben, auch ein Fehlschlag. Eine Aufgabe,
 * die seit Wochen jeden Morgen scheitert, muss man sehen können.
 */
export function markTaskRun(
  db: Db,
  task: ScheduledTask,
  now = new Date(),
  outcome?: TaskRunOutcome,
): void {
  const status = outcome?.status ?? null;
  const error = outcome?.status === "error" ? (outcome.error ?? "Unbekannter Fehler") : null;
  const sessionId = outcome?.sessionId ?? null;

  if (task.scheduleKind === "once") {
    db.prepare(
      `UPDATE scheduled_tasks
       SET last_run_at = ?, last_status = ?, last_error = ?, last_session_id = ?, enabled = 0
       WHERE id = ?`,
    ).run(now.toISOString(), status, error, sessionId, task.id);
    return;
  }
  const nextRun = computeNextRun(task.scheduleKind, task.scheduleValue, now);
  db.prepare(
    `UPDATE scheduled_tasks
     SET last_run_at = ?, last_status = ?, last_error = ?, last_session_id = ?, next_run_at = ?
     WHERE id = ?`,
  ).run(now.toISOString(), status, error, sessionId, nextRun.toISOString(), task.id);
}

/**
 * Berechnet die nächste Fälligkeit ab `from`. Wirft ScheduleError bei
 * ungültiger Angabe.
 */
export function computeNextRun(kind: ScheduleKind, value: string, from: Date): Date {
  if (kind === "interval") {
    const seconds = Number(value);
    if (!Number.isFinite(seconds) || seconds <= 0) {
      throw new ScheduleError("interval erwartet Sekunden > 0.");
    }
    return new Date(from.getTime() + seconds * 1000);
  }

  if (kind === "daily") {
    const match = value.match(/^(\d{1,2}):(\d{2})$/);
    const hours = match ? Number(match[1]) : Number.NaN;
    const minutes = match ? Number(match[2]) : Number.NaN;
    if (!match || hours > 23 || minutes > 59) {
      throw new ScheduleError("daily erwartet Uhrzeit als HH:MM.");
    }
    const next = new Date(from);
    next.setHours(hours, minutes, 0, 0);
    if (next.getTime() <= from.getTime()) next.setDate(next.getDate() + 1);
    return next;
  }

  // once
  const at = new Date(value);
  if (Number.isNaN(at.getTime())) {
    throw new ScheduleError("once erwartet einen ISO-Zeitstempel.");
  }
  return at;
}

function toTask(row: TaskRow): ScheduledTask {
  return {
    id: row.id,
    name: row.name,
    scheduleKind: row.schedule_kind as ScheduleKind,
    scheduleValue: row.schedule_value,
    agentId: row.agent_id,
    prompt: row.prompt,
    enabled: row.enabled === 1,
    lastRunAt: row.last_run_at,
    lastStatus: row.last_status === "ok" || row.last_status === "error" ? row.last_status : null,
    lastError: row.last_error,
    lastSessionId: row.last_session_id,
    nextRunAt: row.next_run_at,
    createdAt: row.created_at,
  };
}
