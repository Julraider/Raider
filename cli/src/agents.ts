import { ApiError, coreClient, resolveBaseUrl } from "./client";

/**
 * Agenten verwalten (Schritt 6).
 *
 * Nutzung:
 *   npm run agents                              alle Agenten auflisten
 *   npm run agents -- new "<Name>" "<Systemprompt>" [modell]
 *
 * Der Core muss laufen (npm run dev).
 */

async function main(): Promise<void> {
  const client = coreClient();
  const [command, ...rest] = process.argv.slice(2);

  try {
    if (command === "new") {
      const [name, systemPrompt, model] = rest;
      if (!name) {
        console.error('Nutzung: npm run agents -- new "<Name>" "<Systemprompt>" [modell]');
        process.exit(1);
      }
      const agent = await client.createAgent({
        name,
        systemPrompt: systemPrompt ?? "",
        model: model ?? null,
      });
      console.log(`Agent #${agent.id} "${agent.name}" angelegt.`);
      return;
    }

    // Standard: auflisten.
    const { agents } = await client.listAgents();
    if (agents.length === 0) {
      console.log('Noch keine Agenten. Anlegen: npm run agents -- new "<Name>" "<Systemprompt>"');
      return;
    }
    for (const agent of agents) {
      const model = agent.model ?? "Standardmodell";
      console.log(`#${agent.id}  ${agent.name}  (${model})`);
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

void main();
