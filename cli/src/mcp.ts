import { stdin, stdout } from "node:process";
import { createInterface } from "node:readline/promises";
import type { CreateMcpServerRequest } from "@raider/shared";
import { ApiError, coreClient, resolveBaseUrl } from "./client";

/**
 * MCP-Server verwalten (Schritt 7).
 *
 * Nutzung (Core muss laufen: npm run dev):
 *   npm run mcp                          Server auflisten
 *   npm run mcp -- add <Name> <Befehl> [Argumente...]   stdio-Server anlegen
 *   npm run mcp -- test <id>             verbinden + Werkzeuge auflisten
 *   npm run mcp -- call <id> <werkzeug> [json-argumente]   mit Freigabe aufrufen
 */

async function main(): Promise<void> {
  const client = coreClient();
  const [command, ...rest] = process.argv.slice(2);

  try {
    if (command === "add") {
      const [name, cmd, ...args] = rest;
      if (!name || !cmd) {
        console.error("Nutzung: npm run mcp -- add <Name> <Befehl> [Argumente...]");
        process.exit(1);
      }
      const input: CreateMcpServerRequest = { name, type: "stdio", command: cmd, args };
      const server = await client.createMcpServer(input);
      console.log(`MCP-Server #${server.id} "${server.name}" angelegt.`);
      return;
    }

    if (command === "test") {
      const id = Number(rest[0]);
      if (!Number.isInteger(id)) {
        console.error("Nutzung: npm run mcp -- test <id>");
        process.exit(1);
      }
      const { tools } = await client.testMcpServer(id);
      if (tools.length === 0) {
        console.log("Verbunden, aber keine Werkzeuge gemeldet.");
        return;
      }
      console.log("Werkzeuge:");
      for (const tool of tools) {
        console.log(`  ${tool.name}${tool.description ? ` — ${tool.description}` : ""}`);
      }
      return;
    }

    if (command === "call") {
      await callWithApproval(client, rest);
      return;
    }

    // Standard: auflisten.
    const { servers } = await client.listMcpServers();
    if (servers.length === 0) {
      console.log("Noch keine MCP-Server. Anlegen: npm run mcp -- add <Name> <Befehl>");
      return;
    }
    for (const server of servers) {
      const where =
        server.type === "http" ? server.url : `${server.command} ${server.args.join(" ")}`;
      const state = server.enabled ? "an" : "aus";
      console.log(`#${server.id}  ${server.name}  [${server.type}, ${state}]  ${where ?? ""}`);
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

async function callWithApproval(
  client: ReturnType<typeof coreClient>,
  rest: string[],
): Promise<void> {
  const [idRaw, tool, argsRaw] = rest;
  const id = Number(idRaw);
  if (!Number.isInteger(id) || !tool) {
    console.error("Nutzung: npm run mcp -- call <id> <werkzeug> [json-argumente]");
    process.exit(1);
  }

  let args: Record<string, unknown> = {};
  if (argsRaw) {
    try {
      args = JSON.parse(argsRaw);
    } catch {
      console.error('Argumente müssen gültiges JSON sein, z. B. \'{"text":"Hallo"}\'.');
      process.exit(1);
    }
  }

  // Freigabedialog.
  console.log(`Werkzeugaufruf: ${tool}  Argumente: ${JSON.stringify(args)}`);
  const rl = createInterface({ input: stdin, output: stdout });
  const answer = (await rl.question("Freigeben? (j/N) ")).trim().toLowerCase();
  rl.close();

  if (answer !== "j" && answer !== "ja") {
    console.log("Abgebrochen — nicht freigegeben.");
    return;
  }

  const record = await client.callTool(id, tool, { arguments: args, approvedBy: "cli-user" });
  console.log(record.isError ? `Fehler: ${record.result}` : record.result);
}

void main();
