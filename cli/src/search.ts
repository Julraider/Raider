import { ApiError, coreClient, resolveBaseUrl } from "./client";

/**
 * Volltextsuche über gespeicherte Nachrichten (Memory-Ebene 2).
 *
 * Nutzung:  npm run search -- "suchbegriff"   (Core muss laufen)
 */

async function main(): Promise<void> {
  const query = process.argv.slice(2).join(" ").trim();
  if (!query) {
    console.error('Nutzung: npm run search -- "suchbegriff"');
    process.exit(1);
  }

  try {
    const { hits } = await coreClient().search(query);
    if (hits.length === 0) {
      console.log("Keine Treffer.");
      return;
    }
    for (const hit of hits) {
      console.log(`#${hit.sessionId} · ${hit.role} · ${hit.createdAt}`);
      console.log(`  ${hit.snippet}`);
    }
    console.error(`\n${hits.length} Treffer.`);
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
