import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { beforeEach, describe, expect, it } from "vitest";
import type { ChatFn } from "../chat/turn";
import { engageStop } from "../db/emergency";
import { type Db, openDatabase } from "../db/index";
import { runMigrations } from "../db/migrate";
import { computeNextRun, createScheduledTask, getScheduledTask } from "../db/scheduler";
import { createScheduler } from "./runner";

const migrationsDir = join(dirname(fileURLToPath(import.meta.url)), "..", "db", "migrations");

let db: Db;
let calls: number;

const countingChat: ChatFn = async () => {
  calls += 1;
  return {
    role: "assistant",
    content: "erledigt",
    model: "test",
    stopReason: "end_turn",
    usage: { inputTokens: 1, outputTokens: 1 },
  };
};

beforeEach(() => {
  db = openDatabase(":memory:");
  runMigrations(db, migrationsDir);
  calls = 0;
});

describe("computeNextRun", () => {
  it("interval: addiert Sekunden", () => {
    const from = new Date("2026-07-21T10:00:00Z");
    expect(computeNextRun("interval", "60", from).toISOString()).toBe("2026-07-21T10:01:00.000Z");
  });

  it("once: nimmt den Zeitstempel unverändert", () => {
    const from = new Date("2026-07-21T10:00:00Z");
    expect(computeNextRun("once", "2026-07-22T09:00:00Z", from).toISOString()).toBe(
      "2026-07-22T09:00:00.000Z",
    );
  });

  it("wirft bei ungültiger Angabe", () => {
    const from = new Date();
    expect(() => computeNextRun("interval", "0", from)).toThrow();
    expect(() => computeNextRun("daily", "25:00", from)).toThrow();
  });
});

describe("Scheduler", () => {
  it("führt eine fällige Aufgabe aus und schreibt die Fälligkeit fort", async () => {
    const start = new Date("2026-07-21T10:00:00Z");
    createScheduledTask(
      db,
      { name: "Tick", scheduleKind: "interval", scheduleValue: "60", prompt: "mach was" },
      start,
    );

    // Uhr steht auf 2 Minuten später → Aufgabe ist fällig.
    const later = new Date("2026-07-21T10:02:00Z");
    const scheduler = createScheduler({ db, chat: countingChat, clock: () => later });
    const result = await scheduler.tick();

    expect(result.ran).toBe(1);
    expect(calls).toBe(1);
    const task = getScheduledTask(db, 1);
    expect(task?.lastRunAt).not.toBeNull();
    // Nächste Fälligkeit liegt nach „later".
    expect(new Date(task?.nextRunAt ?? 0).getTime()).toBeGreaterThan(later.getTime());
  });

  it("deaktiviert eine once-Aufgabe nach dem Lauf", async () => {
    const start = new Date("2026-07-21T10:00:00Z");
    createScheduledTask(
      db,
      { name: "Einmal", scheduleKind: "once", scheduleValue: "2026-07-21T10:01:00Z", prompt: "hi" },
      start,
    );
    const later = new Date("2026-07-21T10:05:00Z");
    const scheduler = createScheduler({ db, chat: countingChat, clock: () => later });

    await scheduler.tick();
    expect(getScheduledTask(db, 1)?.enabled).toBe(false);

    // Zweiter Tick: nichts mehr fällig.
    const second = await scheduler.tick();
    expect(second.ran).toBe(0);
    expect(calls).toBe(1);
  });

  it("läuft bei aktivem Not-Stopp gar nicht", async () => {
    const start = new Date("2026-07-21T10:00:00Z");
    createScheduledTask(
      db,
      { name: "Tick", scheduleKind: "interval", scheduleValue: "60", prompt: "x" },
      start,
    );
    engageStop(db, "Test");

    const later = new Date("2026-07-21T10:05:00Z");
    const scheduler = createScheduler({ db, chat: countingChat, clock: () => later });
    const result = await scheduler.tick();

    expect(result.stopped).toBe(true);
    expect(result.ran).toBe(0);
    expect(calls).toBe(0);
  });
});
