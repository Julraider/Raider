import type { ScheduleKind } from "@raider/shared";
import { ApiError, coreClient, resolveBaseUrl } from "./client";

/**
 * Geplante Aufgaben verwalten (Schritt 12).
 *
 * Nutzung (Core muss laufen: npm run dev):
 *   npm run scheduler                                  Aufgaben anzeigen
 *   npm run scheduler -- new <interval|daily|once> <Wert> "<Name>" "<Prompt>" [agentId]
 *       Wert:  interval=Sekunden   daily=HH:MM   once=ISO-Zeit (2026-07-21T09:00:00Z)
 *   npm run scheduler -- on <id> | off <id>            an-/abschalten
 *   npm run scheduler -- run <id>                      jetzt ausführen
 *   npm run scheduler -- del <id>                      löschen
 */

async function main(): Promise<void> {
  const client = coreClient();
  const [command, ...rest] = process.argv.slice(2);

  try {
    if (command === "new") {
      const [kind, value, name, prompt, agentIdRaw] = rest;
      if (!isKind(kind) || !value || !name || !prompt) {
        console.error(
          'Nutzung: npm run scheduler -- new <interval|daily|once> <Wert> "<Name>" "<Prompt>" [agentId]',
        );
        process.exit(1);
      }
      const agentId = agentIdRaw ? Number(agentIdRaw) : null;
      const task = await client.createScheduledTask({
        name,
        scheduleKind: kind,
        scheduleValue: value,
        prompt,
        agentId,
      });
      console.log(`Aufgabe #${task.id} "${task.name}" angelegt. Nächster Lauf: ${task.nextRunAt}`);
      return;
    }

    if (command === "on" || command === "off") {
      const id = Number(rest[0]);
      if (!Number.isInteger(id)) {
        console.error(`Nutzung: npm run scheduler -- ${command} <id>`);
        process.exit(1);
      }
      await client.updateScheduledTask(id, { enabled: command === "on" });
      console.log(`Aufgabe #${id} ${command === "on" ? "aktiviert" : "deaktiviert"}.`);
      return;
    }

    if (command === "run") {
      const id = Number(rest[0]);
      if (!Number.isInteger(id)) {
        console.error("Nutzung: npm run scheduler -- run <id>");
        process.exit(1);
      }
      const result = await client.runScheduledTask(id);
      console.log(`Aufgabe #${id} ausgeführt (Sitzung #${result.sessionId}).`);
      return;
    }

    if (command === "del") {
      const id = Number(rest[0]);
      if (!Number.isInteger(id)) {
        console.error("Nutzung: npm run scheduler -- del <id>");
        process.exit(1);
      }
      await client.deleteScheduledTask(id);
      console.log(`Aufgabe #${id} gelöscht.`);
      return;
    }

    // Standard: auflisten.
    const { tasks } = await client.listScheduledTasks();
    if (tasks.length === 0) {
      console.log("Keine geplanten Aufgaben. Anlegen: npm run scheduler -- new ...");
      return;
    }
    for (const task of tasks) {
      const state = task.enabled ? "an " : "aus";
      const plan = `${task.scheduleKind}=${task.scheduleValue}`;
      console.log(`#${task.id}  [${state}]  ${task.name}  (${plan}, nächster: ${task.nextRunAt})`);
    }
  } catch (error) {
    if (error instanceof ApiError) {
      console.error(`Fehler (${error.status}): ${error.message}`);
    } else {
      console.error(`Kein Core erreichbar unter ${resolveBaseUrl()}. Läuft 'npm run dev'?`);
    }
    process.exit(1);
  }
}

function isKind(raw: string | undefined): raw is ScheduleKind {
  return raw === "interval" || raw === "daily" || raw === "once";
}

void main();
