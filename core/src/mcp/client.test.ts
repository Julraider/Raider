import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { createMcpRunner } from "./client";
import type { McpServerConfig } from "./types";

const here = dirname(fileURLToPath(import.meta.url));
const serverPath = join(here, "__fixtures__", "echo-server.mjs");

// Echter stdio-MCP-Server als Unterprozess (node echo-server.mjs).
const config: McpServerConfig = {
  id: 1,
  name: "echo",
  type: "stdio",
  command: "node",
  args: [serverPath],
  url: null,
  env: {},
  enabled: true,
};

describe("MCP-Client (echt, über stdio)", () => {
  it("verbindet, listet Werkzeuge auf und trennt", async () => {
    const tools = await createMcpRunner().listTools(config);
    expect(tools.map((tool) => tool.name)).toContain("echo");
  });

  it("ruft ein Werkzeug auf und bekommt das Ergebnis", async () => {
    const result = await createMcpRunner().callTool(config, "echo", { text: "Hallo" });
    expect(result.isError).toBe(false);
    expect(result.content).toBe("echo: Hallo");
  });
});
