import { ApiError, coreClient, resolveBaseUrl } from "./client";

/**
 * Einmalige Frage an den Core (Schritt 2). Redet ausschließlich über die
 * lokale API. Für einen fortlaufenden Dialog: npm run chat.
 *
 * Nutzung:  npm run ask -- "deine Frage"   (Core muss laufen: npm run dev)
 */

async function main(): Promise<void> {
  // Führendes "ask" tolerieren, damit `raider ask ...` und die reine Frage beide gehen.
  const args = process.argv.slice(2);
  if (args[0] === "ask") args.shift();
  const prompt = args.join(" ").trim();

  if (!prompt) {
    console.error('Nutzung: npm run ask -- "deine Frage"');
    process.exit(1);
  }

  try {
    const response = await coreClient().chat({
      messages: [{ role: "user", content: prompt }],
    });
    console.log(response.content);
    console.error(
      `\n[${response.model} · ${response.usage.inputTokens}→${response.usage.outputTokens} Tokens]`,
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

void main();
