import type { ChatRequest, ChatResponse } from "@raider/shared";

/**
 * Minimaler CLI-Client für Schritt 2: stellt genau eine Frage an den Core und
 * druckt die Antwort. Redet ausschließlich über die lokale API — nie direkt
 * mit Datenbank oder Anbieter.
 *
 * Nutzung:  npm run ask -- "deine Frage"
 * Der Core muss laufen (npm run dev).
 */

const port = process.env.RAIDER_PORT ? Number(process.env.RAIDER_PORT) : 4179;
const baseUrl = `http://localhost:${port}`;

async function main(): Promise<void> {
  // Führendes "ask" tolerieren, damit `raider ask ...` und die reine Frage beide gehen.
  const args = process.argv.slice(2);
  if (args[0] === "ask") args.shift();
  const prompt = args.join(" ").trim();

  if (!prompt) {
    console.error('Nutzung: npm run ask -- "deine Frage"');
    process.exit(1);
  }

  const request: ChatRequest = { messages: [{ role: "user", content: prompt }] };

  let response: Response;
  try {
    response = await fetch(`${baseUrl}/chat`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(request),
    });
  } catch {
    console.error(`Kein Core erreichbar unter ${baseUrl}. Läuft 'npm run dev'?`);
    process.exit(1);
  }

  const data = (await response.json()) as ChatResponse & { error?: string };

  if (!response.ok) {
    console.error(`Fehler (${response.status}): ${data.error ?? "unbekannt"}`);
    process.exit(1);
  }

  console.log(data.content);
  console.error(`\n[${data.model} · ${data.usage.inputTokens}→${data.usage.outputTokens} Tokens]`);
}

void main();
