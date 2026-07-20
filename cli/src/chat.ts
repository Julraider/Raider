import { stdin, stdout } from "node:process";
import { createInterface } from "node:readline/promises";
import { ChatRequestError, postChat, resolveBaseUrl } from "./client";
import { Conversation } from "./conversation";

/**
 * Interaktiver CLI-Chat (Schritt 3): der erste echte Dialog. Redet
 * ausschließlich über die lokale API des Cores. Der Verlauf lebt im Speicher
 * dieser Sitzung; der Core bleibt zustandslos.
 *
 * Nutzung:  npm run chat        (Core muss laufen: npm run dev)
 * Befehle:  /help  /reset  /model <id>  /exit
 */

const HELP = [
  "Befehle:",
  "  /help          diese Hilfe",
  "  /reset         Gesprächsverlauf löschen",
  "  /model <id>    Modell wechseln (z. B. /model claude-haiku-4-5)",
  "  /exit          beenden (oder Strg-D)",
].join("\n");

async function main(): Promise<void> {
  const baseUrl = resolveBaseUrl();
  const conversation = new Conversation();
  let model: string | undefined;

  const rl = createInterface({ input: stdin, output: stdout });

  stdout.write(`Raider-Chat — /help für Befehle, /exit zum Beenden.\n`);
  rl.setPrompt("› ");
  rl.prompt();

  for await (const line of rl) {
    const input = line.trim();

    if (input === "") {
      rl.prompt();
      continue;
    }

    if (input === "/exit" || input === "/quit") {
      break;
    }

    if (input === "/help") {
      stdout.write(`${HELP}\n`);
      rl.prompt();
      continue;
    }

    if (input === "/reset") {
      conversation.reset();
      stdout.write("(Verlauf gelöscht)\n");
      rl.prompt();
      continue;
    }

    if (input.startsWith("/model ")) {
      model = input.slice("/model ".length).trim() || undefined;
      stdout.write(model ? `(Modell: ${model})\n` : "(Modell zurückgesetzt)\n");
      rl.prompt();
      continue;
    }

    conversation.addUser(input);
    try {
      const response = await postChat(baseUrl, conversation.toRequest(model ? { model } : {}));
      conversation.addAssistant(response.content);
      stdout.write(`\n${response.content}\n`);
      stdout.write(
        `\n[${response.model} · ${response.usage.inputTokens}→${response.usage.outputTokens} Tokens]\n\n`,
      );
    } catch (error) {
      // Fehlgeschlagene Runde nicht im Verlauf behalten.
      conversation.dropLast();
      if (error instanceof ChatRequestError) {
        stdout.write(`Fehler (${error.status}): ${error.message}\n`);
      } else {
        stdout.write(`Kein Core erreichbar unter ${baseUrl}. Läuft 'npm run dev'?\n`);
      }
    }

    rl.prompt();
  }

  rl.close();
  stdout.write("\nTschüss.\n");
}

void main();
