import type { ScheduledTask } from "@raider/shared";
import type { ChatFn } from "../chat/turn";
import { runSessionTurn } from "../chat/turn";
import { isStopped } from "../db/emergency";
import type { Db } from "../db/index";
import { addMessage, createSession } from "../db/repository";
import { dueTasks, markTaskRun } from "../db/scheduler";
import type { McpRunner } from "../mcp/types";

export interface SchedulerDeps {
  db: Db;
  chat: ChatFn;
  /**
   * MCP-Zugang, damit auch Hintergrundläufe freigegebene Werkzeuge benutzen
   * dürfen — sonst könnte eine geplante Aufgabe nur Text erzeugen.
   */
  tools?: McpRunner;
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
 *
 * Ein Fehlschlag beendet den Zeitgeber nicht — aber er verschwindet auch nicht
 * mehr. Er landet an zwei Stellen: als Ergebnis an der Aufgabe (dort sieht man
 * ihn in der Liste) und als Nachricht in der Sitzung (dort steht der
 * Zusammenhang). Vorher wurde er in einem leeren `catch` geschluckt, und eine
 * Aufgabe, die jede Nacht scheiterte, sah aus wie eine, die jede Nacht lief.
 */
export async function runScheduledTask(
  db: Db,
  chat: ChatFn,
  task: ScheduledTask,
  now = new Date(),
  tools?: McpRunner,
): Promise<number> {
  const session = createSession(db, {
    channel: "cron",
    title: `⏰ ${task.name}`,
    agentId: task.agentId,
  });
  try {
    await runSessionTurn(db, chat, session, task.prompt, tools ? { tools } : {});
    markTaskRun(db, task, now, { status: "ok", sessionId: session.id });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unbekannter Fehler";
    addMessage(db, {
      sessionId: session.id,
      role: "assistant",
      content: `⚠️ Diese geplante Aufgabe ist fehlgeschlagen:\n\n${message}`,
    });
    // Fälligkeit trotzdem fortschreiben, sonst läuft die Aufgabe sofort erneut
    // und scheitert im Sekundentakt weiter.
    markTaskRun(db, task, now, { status: "error", error: message, sessionId: session.id });
  }
  return session.id;
}

/**
 * Zeitgeber, der fällige Aufgaben ausführt. Prüft vor jedem Lauf den Not-Stopp;
 * ist er aktiv, passiert nichts.
 */
export function createScheduler(deps: SchedulerDeps): Scheduler {
  const { db, chat, tools } = deps;
  const clock = deps.clock ?? (() => new Date());
  let timer: ReturnType<typeof setInterval> | undefined;

  async function tick(): Promise<{ ran: number; stopped: boolean }> {
    if (isStopped(db)) return { ran: 0, stopped: true };
    const now = clock();
    const due = dueTasks(db, now);
    for (const task of due) await runScheduledTask(db, chat, task, now, tools);
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
