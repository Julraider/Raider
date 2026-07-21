import { stdin, stdout } from "node:process";
import { createInterface } from "node:readline/promises";
import { ApiError, coreClient, resolveBaseUrl } from "./client";

/**
 * Interaktiver CLI-Chat, DB-gestützt, mit Agentenwahl (Schritte 3–6). Redet
 * ausschließlich über die lokale API. Der Verlauf lebt im Core (SQLite).
 *
 * Nutzung:  npm run chat        (Core muss laufen: npm run dev)
 * Befehle:  /help  /reset  /model <id>  /agents  /agent <id|none>  /exit
 */

const HELP = [
  "Befehle:",
  "  /help            diese Hilfe",
  "  /reset           neue Sitzung beginnen",
  "  /model <id>      Modell wechseln (überstimmt den Agenten)",
  "  /agents          Agenten auflisten",
  "  /agent <id>      Agent wählen (neue Sitzung)",
  "  /agent none      ohne Agent weiter (neue Sitzung)",
  "  /exit            beenden (oder Strg-D)",
].join("\n");

async function main(): Promise<void> {
  const baseUrl = resolveBaseUrl();
  const client = coreClient();

  let agentId: number | null = null;
  let model: string | undefined;

  async function startSession(): Promise<number> {
    return (await client.createSession({ channel: "cli", agentId })).id;
  }

  let sessionId: number;
  try {
    sessionId = await startSession();
  } catch {
    stdout.write(`Kein Core erreichbar unter ${baseUrl}. Läuft 'npm run dev'?\n`);
    process.exit(1);
  }

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
        sessionId = await startSession();
        stdout.write(`(neue Sitzung #${sessionId})\n`);
      } catch {
        stdout.write("Konnte keine neue Sitzung anlegen.\n");
      }
      rl.prompt();
      continue;
    }
    if (input === "/agents") {
      try {
        const { agents } = await client.listAgents();
        if (agents.length === 0) stdout.write("Noch keine Agenten (npm run agents -- new …).\n");
        for (const agent of agents) {
          stdout.write(`  #${agent.id}  ${agent.name}  (${agent.model ?? "Standardmodell"})\n`);
        }
      } catch {
        stdout.write("Konnte Agenten nicht laden.\n");
      }
      rl.prompt();
      continue;
    }
    if (input.startsWith("/agent ")) {
      const arg = input.slice("/agent ".length).trim();
      agentId = arg === "none" ? null : Number(arg);
      if (agentId !== null && !Number.isInteger(agentId)) {
        stdout.write("Ungültige Agent-ID.\n");
        agentId = null;
      } else {
        try {
          sessionId = await startSession();
          stdout.write(
            agentId === null
              ? `(ohne Agent, neue Sitzung #${sessionId})\n`
              : `(Agent #${agentId}, neue Sitzung #${sessionId})\n`,
          );
        } catch {
          stdout.write("Konnte keine neue Sitzung anlegen.\n");
        }
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
      const response = await client.sendMessage(sessionId, {
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
