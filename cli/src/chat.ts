import { stdin, stdout } from "node:process";
import { createInterface } from "node:readline/promises";
import { ApiError, createSession, postSessionMessage, resolveBaseUrl } from "./client";

/**
 * Interaktiver CLI-Chat (Schritt 3, ab Schritt 4 DB-gestützt): der erste echte
 * Dialog. Redet ausschließlich über die lokale API. Der Verlauf lebt jetzt im
 * Core (SQLite) — die CLI hält keinen Zustand mehr und der Dialog überlebt Neustart.
 *
 * Nutzung:  npm run chat        (Core muss laufen: npm run dev)
 * Befehle:  /help  /reset  /model <id>  /exit
 */

const HELP = [
  "Befehle:",
  "  /help          diese Hilfe",
  "  /reset         neue Sitzung beginnen",
  "  /model <id>    Modell wechseln (z. B. /model claude-haiku-4-5)",
  "  /exit          beenden (oder Strg-D)",
].join("\n");

async function main(): Promise<void> {
  const baseUrl = resolveBaseUrl();

  let sessionId: number;
  try {
    sessionId = (await createSession(baseUrl, { channel: "cli" })).id;
  } catch {
    stdout.write(`Kein Core erreichbar unter ${baseUrl}. Läuft 'npm run dev'?\n`);
    process.exit(1);
  }

  let model: string | undefined;

  const rl = createInterface({ input: stdin, output: stdout });
  stdout.write(`Raider-Chat — Sitzung #${sessionId}. /help für Befehle, /exit zum Beenden.\n`);
  rl.setPrompt("› ");
  rl.prompt();

  for await (const line of rl) {
    const input = line.trim();

    if (input === "") {
      rl.prompt();
      continue;
    }
    if (input === "/exit" || input === "/quit") break;
    if (input === "/help") {
      stdout.write(`${HELP}\n`);
      rl.prompt();
      continue;
    }
    if (input === "/reset") {
      try {
        sessionId = (await createSession(baseUrl, { channel: "cli" })).id;
        stdout.write(`(neue Sitzung #${sessionId})\n`);
      } catch {
        stdout.write("Konnte keine neue Sitzung anlegen.\n");
      }
      rl.prompt();
      continue;
    }
    if (input.startsWith("/model ")) {
      model = input.slice("/model ".length).trim() || undefined;
      stdout.write(model ? `(Modell: ${model})\n` : "(Modell zurückgesetzt)\n");
      rl.prompt();
      continue;
    }

    try {
      const response = await postSessionMessage(baseUrl, sessionId, {
        content: input,
        ...(model ? { model } : {}),
      });
      stdout.write(`\n${response.content}\n`);
      stdout.write(
        `\n[${response.model} · ${response.usage.inputTokens}→${response.usage.outputTokens} Tokens]\n\n`,
      );
    } catch (error) {
      if (error instanceof ApiError) {
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
