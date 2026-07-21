import type { MemoryStore } from "@raider/shared";
import { ApiError, coreClient, resolveBaseUrl } from "./client";

/**
 * Freigabe-Posteingang (Schritt 9).
 *
 * Nutzung (Core muss laufen: npm run dev):
 *   npm run inbox                              offene Vorschläge anzeigen
 *   npm run inbox -- propose <user|agent> <Text>   Memory-Vorschlag einstellen
 *   npm run inbox -- approve <id>             freigeben (wird angewendet)
 *   npm run inbox -- reject <id>              ablehnen
 */

async function main(): Promise<void> {
  const client = coreClient();
  const [command, ...rest] = process.argv.slice(2);

  try {
    if (command === "propose") {
      const store = parseStore(rest[0]);
      const content = rest.slice(1).join(" ").trim();
      if (!store || !content) {
        console.error("Nutzung: npm run inbox -- propose <user|agent> <Text>");
        process.exit(1);
      }
      const write = await client.createPendingWrite({
        kind: "memory",
        proposal: { store, content },
        origin: "chat",
      });
      console.log(`Vorschlag #${write.id} eingestellt (wartet auf Freigabe).`);
      return;
    }

    if (command === "approve") {
      const id = Number(rest[0]);
      if (!Number.isInteger(id)) {
        console.error("Nutzung: npm run inbox -- approve <id>");
        process.exit(1);
      }
      await client.approvePendingWrite(id);
      console.log(`Vorschlag #${id} freigegeben und angewendet.`);
      return;
    }

    if (command === "reject") {
      const id = Number(rest[0]);
      if (!Number.isInteger(id)) {
        console.error("Nutzung: npm run inbox -- reject <id>");
        process.exit(1);
      }
      await client.rejectPendingWrite(id);
      console.log(`Vorschlag #${id} abgelehnt.`);
      return;
    }

    // Standard: offene Vorschläge anzeigen.
    const { pendingWrites } = await client.listInbox("pending");
    if (pendingWrites.length === 0) {
      console.log("Posteingang leer — keine offenen Vorschläge.");
      return;
    }
    for (const write of pendingWrites) {
      const what =
        write.kind === "memory" ? `${write.proposal.store}: ${write.proposal.content}` : write.kind;
      console.log(`#${write.id}  [${write.kind}, ${write.origin}]  ${what}`);
    }
    console.error("\nFreigeben: npm run inbox -- approve <id>   Ablehnen: -- reject <id>");
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
