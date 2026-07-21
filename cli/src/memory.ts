import type { MemoryStore } from "@raider/shared";
import { ApiError, coreClient, resolveBaseUrl } from "./client";

/**
 * Kerngedächtnis ansehen und bearbeiten (Schritt 8).
 *
 * Nutzung (Core muss laufen: npm run dev):
 *   npm run memory                       beide Speicher anzeigen
 *   npm run memory -- add user <Text>    Eintrag hinzufügen (user|agent)
 *   npm run memory -- edit <id> <Text>   Eintrag ändern
 *   npm run memory -- del <id>           Eintrag löschen
 */

async function main(): Promise<void> {
  const client = coreClient();
  const [command, ...rest] = process.argv.slice(2);

  try {
    if (command === "add") {
      const store = parseStore(rest[0]);
      const content = rest.slice(1).join(" ").trim();
      if (!store || !content) {
        console.error("Nutzung: npm run memory -- add <user|agent> <Text>");
        process.exit(1);
      }
      const entry = await client.addMemory(store, { content });
      console.log(`Eintrag #${entry.id} in "${store}" gespeichert.`);
      return;
    }

    if (command === "edit") {
      const id = Number(rest[0]);
      const content = rest.slice(1).join(" ").trim();
      if (!Number.isInteger(id) || !content) {
        console.error("Nutzung: npm run memory -- edit <id> <Text>");
        process.exit(1);
      }
      await client.updateMemory(id, { content });
      console.log(`Eintrag #${id} geändert.`);
      return;
    }

    if (command === "del") {
      const id = Number(rest[0]);
      if (!Number.isInteger(id)) {
        console.error("Nutzung: npm run memory -- del <id>");
        process.exit(1);
      }
      await client.deleteMemory(id);
      console.log(`Eintrag #${id} gelöscht.`);
      return;
    }

    // Standard: beide Speicher anzeigen.
    for (const store of ["user", "agent"] as const) {
      const view = await client.getMemory(store);
      const label = store === "user" ? "Nutzerprofil" : "Notizen";
      console.log(`\n${label} (${view.used}/${view.limit} Zeichen)`);
      if (view.entries.length === 0) {
        console.log("  (leer)");
        continue;
      }
      for (const entry of view.entries) {
        const from = entry.sourceSessionId ? ` [aus Sitzung #${entry.sourceSessionId}]` : "";
        console.log(`  #${entry.id}  ${entry.content}${from}`);
      }
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

function parseStore(raw: string | undefined): MemoryStore | null {
  return raw === "user" || raw === "agent" ? raw : null;
}

void main();
