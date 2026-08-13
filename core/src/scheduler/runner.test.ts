import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { beforeEach, describe, expect, it } from "vitest";
import type { ChatFn } from "../chat/turn";
import { engageStop } from "../db/emergency";
import { type Db, openDatabase } from "../db/index";
import { runMigrations } from "../db/migrate";
import { getMessages } from "../db/repository";
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

/*
 * Ein geplanter Lauf passiert, während niemand hinschaut. Umso wichtiger ist,
 * dass man hinterher sieht, was passiert ist — und vor allem, was NICHT geklappt
 * hat. Vorher verschwand jeder Fehlschlag spurlos in einem leeren `catch`.
 */
describe("Ergebnis eines geplanten Laufs", () => {
  function einTick(chat: ChatFn): Promise<{ ran: number; stopped: boolean }> {
    createScheduledTask(
      db,
      { name: "Tick", scheduleKind: "interval", scheduleValue: "60", prompt: "mach was" },
      new Date("2026-07-21T10:00:00Z"),
    );
    const later = new Date("2026-07-21T10:02:00Z");
    return createScheduler({ db, chat, clock: () => later }).tick();
  }

  it("vermerkt einen geglückten Lauf samt Sitzung", async () => {
    await einTick(countingChat);

    const task = getScheduledTask(db, 1);
    expect(task?.lastStatus).toBe("ok");
    expect(task?.lastError).toBeNull();
    expect(task?.lastSessionId).not.toBeNull();

    // Und in dieser Sitzung steht wirklich das Ergebnis.
    const messages = getMessages(db, task?.lastSessionId ?? 0);
    expect(messages.at(-1)?.content).toBe("erledigt");
  });

  it("vermerkt einen Fehlschlag, statt ihn zu verschlucken", async () => {
    const kaputt: ChatFn = async () => {
      throw new Error("Anbieter nicht erreichbar");
    };

    await einTick(kaputt);

    const task = getScheduledTask(db, 1);
    expect(task?.lastStatus).toBe("error");
    expect(task?.lastError).toContain("Anbieter nicht erreichbar");
    // Die Fälligkeit läuft trotzdem weiter — sonst scheitert die Aufgabe im
    // Sekundentakt neu.
    expect(task?.lastRunAt).not.toBeNull();
    expect(new Date(task?.nextRunAt ?? 0).getTime()).toBeGreaterThan(
      new Date("2026-07-21T10:02:00Z").getTime(),
    );
  });

  it("schreibt den Fehler auch in die Sitzung, damit er im Chat auffindbar ist", async () => {
    const kaputt: ChatFn = async () => {
      throw new Error("Modell antwortet nicht");
    };

    await einTick(kaputt);

    const task = getScheduledTask(db, 1);
    const messages = getMessages(db, task?.lastSessionId ?? 0);
    expect(messages.at(-1)?.content).toContain("Modell antwortet nicht");
    expect(messages.at(-1)?.role).toBe("assistant");
  });
});
