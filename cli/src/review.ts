import { ApiError, coreClient, resolveBaseUrl } from "./client";

/**
 * Hintergrund-Review (Schritt 13).
 *
 * Nutzung (Core muss laufen: npm run dev):
 *   npm run review              Review jetzt ausführen — schlägt Einträge vor
 *   npm run review -- history   frühere Läufe anzeigen
 *
 * Vorschläge landen im Freigabe-Posteingang: npm run inbox
 */

async function main(): Promise<void> {
  const client = coreClient();
  const [command] = process.argv.slice(2);

  try {
    if (command === "history") {
      const { runs } = await client.listReviewRuns();
      if (runs.length === 0) {
        console.log("Noch keine Review-Läufe.");
        return;
      }
      for (const run of runs) {
        const note = run.note ? ` — ${run.note}` : "";
        console.log(
          `#${run.id}  ${run.ranAt}  +${run.created} / übersprungen ${run.skipped}${note}`,
        );
      }
      return;
    }

    const summary = await client.runReview();
    if (summary.created === 0) {
      console.log(`Review fertig: keine neuen Vorschläge (${summary.note ?? "—"}).`);
      return;
    }
    console.log(`Review fertig: ${summary.created} neue(r) Vorschlag/Vorschläge:`);
    for (const line of summary.proposals) console.log(`  • ${line}`);
    if (summary.skipped > 0) console.log(`(${summary.skipped} als Duplikat übersprungen)`);
    console.log("\nFreigeben oder ablehnen: npm run inbox");
  } catch (error) {
    if (error instanceof ApiError) {
      console.error(`Fehler (${error.status}): ${error.message}`);
    } else {
      console.error(`Kein Core erreichbar unter ${resolveBaseUrl()}. Läuft 'npm run dev'?`);
    }
    process.exit(1);
  }
}

void main();
