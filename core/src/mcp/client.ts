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

async function withClient<T>(
  config: McpServerConfig,
  fn: (client: Client) => Promise<T>,
): Promise<T> {
  const client = new Client(CLIENT_INFO, { capabilities: {} });
  await client.connect(transportFor(config));
  try {
    return await fn(client);
  } finally {
    await client.close();
  }
}

export function createMcpRunner(): McpRunner {
  return {
    listTools: (config) =>
      withClient(config, async (client) => {
        const { tools } = await client.listTools();
        return tools.map(
          (tool): McpTool => ({
            name: tool.name,
            description: tool.description ?? null,
            inputSchema: tool.inputSchema,
          }),
        );
      }),
    callTool: (config, tool, args) =>
      withClient(config, async (client) => {
        const result = await client.callTool({ name: tool, arguments: args });
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
