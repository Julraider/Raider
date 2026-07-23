import { ApiError, coreClient, resolveBaseUrl } from "./client";

/**
 * Gesundheit & Statistik (Schritt 14).
 *
 * Nutzung (Core muss laufen: npm run dev):
 *   npm run health     Herzschlag + Zählerstände anzeigen
 */

async function main(): Promise<void> {
  const client = coreClient();
  try {
    const health = await client.health();
    const on = (v: boolean) => (v ? "an" : "aus");
    console.log(
      `Status: ${health.status === "ok" ? "✅ ok" : "⚠️ eingeschränkt"}  (v${health.version})`,
    );
    console.log(`Laufzeit: ${formatDuration(health.uptimeSeconds)}`);
    console.log(
      `Datenbank: ${health.database.connected ? "verbunden" : "getrennt"}  (${health.database.path})`,
    );
    console.log(
      `Anbieter: ${health.provider.name} / ${health.provider.model}  (Key ${health.provider.hasApiKey ? "gesetzt" : "fehlt"})`,
    );
    console.log(
      `Dienste: Scheduler ${on(health.workers.scheduler)}, Review ${on(health.workers.review)}, Telegram ${on(health.workers.telegram)}`,
    );
    if (health.emergencyStop) console.log("⛔ Not-Stopp ist AKTIV.");

    const stats = await client.stats();
    console.log("\nZählerstände:");
    console.log(`  Sitzungen ${stats.sessions}, Nachrichten ${stats.messages}`);
    console.log(`  Gedächtnis: user ${stats.memory.user}, agent ${stats.memory.agent}`);
    console.log(
      `  Skills ${stats.skills}, MCP-Server ${stats.mcpServers}, Werkzeugaufrufe ${stats.toolCalls}`,
    );
    console.log(
      `  Offene Vorschläge ${stats.pendingProposals}, Aufgaben ${stats.scheduledTasks}, Review-Läufe ${stats.reviewRuns}`,
    );
  } catch (error) {
    if (error instanceof ApiError) {
      console.error(`Fehler (${error.status}): ${error.message}`);
    } else {
      console.error(`Kein Core erreichbar unter ${resolveBaseUrl()}. Läuft 'npm run dev'?`);
    }
    process.exit(1);
  }
}

function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

void main();
