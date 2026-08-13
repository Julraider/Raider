import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import {
  getDefaultEnvironment,
  StdioClientTransport,
} from "@modelcontextprotocol/sdk/client/stdio.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import type { McpTool } from "@raider/shared";
import type { McpRunner, McpServerConfig } from "./types";

/**
 * Echter MCP-Client über das offizielle SDK. Verbindet pro Aufruf, führt die
 * Operation aus und trennt wieder — einfach und ausreichend für „ein Server,
 * ein Werkzeugaufruf". Verbindungspooling käme später.
 */

const CLIENT_INFO = { name: "raider", version: "0.1.0" };

/*
 * Zeitgrenzen. Ohne sie hängt ein MCP-Server, der einmal nicht antwortet, den
 * ganzen Dialog-Zug auf: Der Nutzer sieht „Schreibt…" und wartet auf etwas, das
 * nie kommt. Ein Fehler nach ein paar Sekunden ist immer besser als ein Fenster,
 * das steht.
 *
 * Die Werte sind bewusst knapp gewählt — ein Werkzeug, das lokal länger als eine
 * Minute rechnet, ist für einen Chat ohnehin unbrauchbar. Wer es doch braucht,
 * kann `RAIDER_MCP_TIMEOUT_MS` setzen.
 */
const CONNECT_TIMEOUT_MS = 15_000;
const LIST_TIMEOUT_MS = 20_000;
const DEFAULT_CALL_TIMEOUT_MS = 60_000;
/** Ein Server, der sich nicht sauber verabschiedet, darf uns nicht aufhalten. */
const CLOSE_TIMEOUT_MS = 5_000;

/** Zeitgrenze für einen Werkzeugaufruf; über `RAIDER_MCP_TIMEOUT_MS` änderbar. */
function callTimeoutMs(): number {
  const raw = Number(process.env.RAIDER_MCP_TIMEOUT_MS);
  return Number.isFinite(raw) && raw > 0 ? raw : DEFAULT_CALL_TIMEOUT_MS;
}

/**
 * Übersteuerbare Zeitgrenzen. Im Betrieb bleiben die Vorgaben; Tests setzen
 * Millisekunden, damit sie eine Zeitüberschreitung wirklich auslösen können,
 * statt sie nur zu behaupten.
 */
export interface McpTimeouts {
  connectMs?: number;
  listMs?: number;
  callMs?: number;
  closeMs?: number;
}

/**
 * Wartet höchstens `ms` auf `promise`. Danach gilt der Schritt als
 * fehlgeschlagen — die Fehlermeldung ist für den Nutzer geschrieben, nicht für
 * ein Protokoll, denn sie landet als Werkzeugergebnis im Gespräch.
 */
function withDeadline<T>(promise: Promise<T>, ms: number, what: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const limit = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      reject(new Error(`${what} hat nach ${Math.round(ms / 1000)} Sekunden nicht geantwortet.`));
    }, ms);
  });
  return Promise.race([promise, limit]).finally(() => clearTimeout(timer));
}

function transportFor(config: McpServerConfig) {
  if (config.type === "http") {
    if (!config.url) throw new Error("HTTP-Server ohne URL.");
    return new StreamableHTTPClientTransport(new URL(config.url));
  }
  if (!config.command) throw new Error("stdio-Server ohne Befehl.");
  return new StdioClientTransport({
    command: config.command,
    args: config.args,
    env: { ...getDefaultEnvironment(), ...config.env },
  });
}

/**
 * Verbindet, führt aus, trennt — jeder Schritt mit eigener Zeitgrenze.
 *
 * Geschlossen wird auch nach einer Zeitüberschreitung, und zwar immer: Bei
 * stdio-Servern hängt an der Verbindung ein echter Kindprozess, der sonst
 * weiterliefe. Fehler beim Schließen werden geschluckt — sie dürfen das
 * eigentliche Ergebnis nicht überschreiben.
 */
async function withClient<T>(
  config: McpServerConfig,
  limits: Required<McpTimeouts>,
  fn: (client: Client) => Promise<T>,
): Promise<T> {
  const client = new Client(CLIENT_INFO, { capabilities: {} });
  try {
    await withDeadline(
      client.connect(transportFor(config), { timeout: limits.connectMs }),
      limits.connectMs,
      `Der Server „${config.name}" hat die Verbindung nicht angenommen und`,
    );
    return await fn(client);
  } finally {
    await withDeadline(client.close(), limits.closeMs, "Schließen").catch(() => undefined);
  }
}

export function createMcpRunner(timeouts: McpTimeouts = {}): McpRunner {
  const limits: Required<McpTimeouts> = {
    connectMs: timeouts.connectMs ?? CONNECT_TIMEOUT_MS,
    listMs: timeouts.listMs ?? LIST_TIMEOUT_MS,
    callMs: timeouts.callMs ?? callTimeoutMs(),
    closeMs: timeouts.closeMs ?? CLOSE_TIMEOUT_MS,
  };

  return {
    listTools: (config) =>
      withClient(config, limits, async (client) => {
        const { tools } = await withDeadline(
          client.listTools(undefined, { timeout: limits.listMs }),
          limits.listMs,
          `Der Server „${config.name}" hat seine Werkzeugliste nicht geschickt und`,
        );
        return tools.map(
          (tool): McpTool => ({
            name: tool.name,
            description: tool.description ?? null,
            inputSchema: tool.inputSchema,
          }),
        );
      }),
    callTool: (config, tool, args) =>
      withClient(config, limits, async (client) => {
        const result = await withDeadline(
          client.callTool({ name: tool, arguments: args }, undefined, { timeout: limits.callMs }),
          limits.callMs,
          `Das Werkzeug „${tool}" auf „${config.name}"`,
        );
        return { content: flattenContent(result.content), isError: result.isError === true };
      }),
  };
}

/** Fügt die Textblöcke einer MCP-Antwort zu einem String zusammen. */
function flattenContent(content: unknown): string {
  if (!Array.isArray(content)) return "";
  return (content as Array<{ type?: string; text?: string }>)
    .map((block) =>
      block.type === "text" && typeof block.text === "string"
        ? block.text
        : `[${block.type ?? "?"}]`,
    )
    .join("\n");
}
