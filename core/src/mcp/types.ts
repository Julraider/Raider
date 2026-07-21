import type { McpServerType, McpTool } from "@raider/shared";

/** Vollständige Verbindungsdaten eines MCP-Servers (env unverdeckt, nur intern). */
export interface McpServerConfig {
  id: number;
  name: string;
  type: McpServerType;
  command: string | null;
  args: string[];
  url: string | null;
  env: Record<string, string>;
  enabled: boolean;
}

export interface McpToolResult {
  content: string;
  isError: boolean;
}

/** Führt MCP-Operationen aus. Als Schnittstelle, damit Tests sie ersetzen können. */
export interface McpRunner {
  listTools(config: McpServerConfig): Promise<McpTool[]>;
  callTool(
    config: McpServerConfig,
    tool: string,
    args: Record<string, unknown>,
  ): Promise<McpToolResult>;
}
