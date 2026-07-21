import { ApiError, coreClient, resolveBaseUrl } from "./client";

/**
 * Not-Stopp — der große rote Schalter (Schritt 12).
 *
 * Nutzung (Core muss laufen: npm run dev):
 *   npm run stop                 Not-Stopp AKTIVIEREN (hält alle Automatik an)
 *   npm run stop -- "<Grund>"    aktivieren mit Grund
 *   npm run stop -- release      Not-Stopp lösen
 *   npm run stop -- status       aktuellen Zustand zeigen
 *
 * Aktiv = kein Scheduler, keine Telegram-Antworten, keine Werkzeugaufrufe.
 * Manuelles Tippen am Rechner bleibt möglich.
 */

async function main(): Promise<void> {
  const client = coreClient();
  const [command, ...rest] = process.argv.slice(2);

  try {
    if (command === "status") {
      const state = await client.getEmergencyStop();
      if (state.engaged) {
        console.log(`⛔ Not-Stopp AKTIV seit ${state.engagedAt}${grund(state.reason)}`);
      } else {
        console.log("✅ Kein Not-Stopp — Automatik läuft normal.");
      }
      return;
    }

    if (command === "release") {
      await client.releaseEmergencyStop();
      console.log("✅ Not-Stopp gelöst. Automatik läuft wieder.");
      return;
    }

    // Standard (auch mit Grund als erstem Argument): aktivieren.
    const reason = [command, ...rest].filter(Boolean).join(" ").trim();
    const state = await client.engageEmergencyStop(reason || undefined);
    console.log(`⛔ Not-Stopp AKTIVIERT${grund(state.reason)}`);
    console.log("Scheduler, Telegram-Antworten und Werkzeugaufrufe sind gestoppt.");
    console.log("Lösen mit: npm run stop -- release");
  } catch (error) {
    if (error instanceof ApiError) {
      console.error(`Fehler (${error.status}): ${error.message}`);
    } else {
      console.error(`Kein Core erreichbar unter ${resolveBaseUrl()}. Läuft 'npm run dev'?`);
    }
    process.exit(1);
  }
}

function grund(reason: string | null): string {
  return reason ? ` (Grund: ${reason})` : "";
}

void main();
