// Winziger MCP-Server für Tests: bietet ein "echo"-Werkzeug über stdio.
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const server = new McpServer({ name: "echo", version: "0.0.1" });

server.registerTool(
  "echo",
  { description: "Gibt den übergebenen Text zurück.", inputSchema: { text: z.string() } },
  async ({ text }) => ({ content: [{ type: "text", text: `echo: ${text}` }] }),
);

await server.connect(new StdioServerTransport());
