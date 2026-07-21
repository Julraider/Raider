import type { ScheduledTask } from "@raider/shared";
import type { ChatFn } from "../chat/turn";
import { runSessionTurn } from "../chat/turn";
import { isStopped } from "../db/emergency";
import type { Db } from "../db/index";
import { createSession } from "../db/repository";
import { dueTasks, markTaskRun } from "../db/scheduler";

export interface SchedulerDeps {
  db: Db;
  chat: ChatFn;
  /** Uhr — in Tests injizierbar. */
  clock?: () => Date;
}

export interface Scheduler {
  /** Prüft einmal auf fällige Aufgaben (der testbare Kern). */
  tick(): Promise<{ ran: number; stopped: boolean }>;
  start(tickMs?: number): void;
  stop(): void;
}

const DEFAULT_TICK_MS = 30_000;

/**
 * Führt eine einzelne geplante Aufgabe aus: frische Sitzung (Kanal „cron"),
 * Prompt durch die gemeinsame Dialog-Logik, dann den Lauf vermerken. Wird auch
 * vom „jetzt ausführen"-Endpunkt genutzt.
 */
export async function runScheduledTask(
  db: Db,
  chat: ChatFn,
  task: ScheduledTask,
  now = new Date(),
): Promise<number> {
  const session = createSession(db, {
    channel: "cron",
    title: `⏰ ${task.name}`,
    agentId: task.agentId,
  });
  try {
    await runSessionTurn(db, chat, session, task.prompt);
  } catch {
    // Ein Fehlschlag (z. B. Anbieter nicht erreichbar) darf den Lauf nicht
    // verschlucken: Fälligkeit trotzdem fortschreiben, sonst läuft es sofort neu.
  }
  markTaskRun(db, task, now);
  return session.id;
}

/**
 * Zeitgeber, der fällige Aufgaben ausführt. Prüft vor jedem Lauf den Not-Stopp;
 * ist er aktiv, passiert nichts.
 */
export function createScheduler(deps: SchedulerDeps): Scheduler {
  const { db, chat } = deps;
  const clock = deps.clock ?? (() => new Date());
  let timer: ReturnType<typeof setInterval> | undefined;

  async function tick(): Promise<{ ran: number; stopped: boolean }> {
    if (isStopped(db)) return { ran: 0, stopped: true };
    const now = clock();
    const due = dueTasks(db, now);
    for (const task of due) await runScheduledTask(db, chat, task, now);
    return { ran: due.length, stopped: false };
  }

  function start(tickMs = DEFAULT_TICK_MS): void {
    if (timer) return;
    timer = setInterval(() => void tick(), tickMs);
    // Nicht den Prozess am Leben halten, nur wegen des Zeitgebers.
    timer.unref?.();
  }

  function stop(): void {
    if (timer) clearInterval(timer);
    timer = undefined;
  }

  return { tick, start, stop };
}
