import type { McpServer, McpServerType, ToolCall } from "@raider/shared";
import type { McpServerConfig } from "../mcp/types";
import type { Db } from "./index";

interface McpServerRow {
  id: number;
  name: string;
  type: string;
  command: string | null;
  args: string;
  url: string | null;
  env: string;
  enabled: number;
  created_at: string;
  updated_at: string;
}

interface ToolCallRow {
  id: number;
  server_id: number | null;
  tool_name: string;
  arguments: string;
  result: string;
  is_error: number;
  approved_by: string | null;
  created_at: string;
}

export interface NewMcpServer {
  name: string;
  type: McpServerType;
  command?: string | null;
  args?: string[];
  url?: string | null;
  env?: Record<string, string>;
  enabled?: boolean;
}

export interface McpServerPatch {
  name?: string;
  type?: McpServerType;
  command?: string | null;
  args?: string[];
  url?: string | null;
  env?: Record<string, string>;
  enabled?: boolean;
}

export interface NewToolCall {
  serverId: number | null;
  toolName: string;
  arguments: unknown;
  result: string;
  isError: boolean;
  approvedBy: string | null;
}

export function createMcpServer(db: Db, input: NewMcpServer): McpServer {
  const info = db
    .prepare(
      "INSERT INTO mcp_servers (name, type, command, args, url, env, enabled) VALUES (?, ?, ?, ?, ?, ?, ?)",
    )
    .run(
      input.name,
      input.type,
      input.command ?? null,
      JSON.stringify(input.args ?? []),
      input.url ?? null,
      JSON.stringify(input.env ?? {}),
      input.enabled === false ? 0 : 1,
    );
  const server = getMcpServer(db, Number(info.lastInsertRowid));
  if (!server) throw new Error("MCP-Server konnte nicht angelegt werden.");
  return server;
}

/** Öffentliche Sicht: env-Werte geschwärzt. */
export function getMcpServer(db: Db, id: number): McpServer | undefined {
  const row = getRow(db, id);
  return row ? toPublic(row) : undefined;
}

export function listMcpServers(db: Db): McpServer[] {
  const rows = db.prepare("SELECT * FROM mcp_servers ORDER BY name, id").all() as McpServerRow[];
  return rows.map(toPublic);
}

/** Interne Sicht mit echten env-Werten — nur für den Verbindungsaufbau. */
export function getMcpServerConfig(db: Db, id: number): McpServerConfig | undefined {
  const row = getRow(db, id);
  return row ? toConfig(row) : undefined;
}

export function updateMcpServer(db: Db, id: number, patch: McpServerPatch): McpServer | undefined {
  const current = getMcpServerConfig(db, id);
  if (!current) return undefined;

  const next = {
    name: patch.name ?? current.name,
    type: patch.type ?? current.type,
    command: patch.command !== undefined ? patch.command : current.command,
    args: patch.args ?? current.args,
    url: patch.url !== undefined ? patch.url : current.url,
    env: patch.env ?? current.env,
    enabled: patch.enabled ?? current.enabled,
  };

  db.prepare(
    `UPDATE mcp_servers
     SET name = ?, type = ?, command = ?, args = ?, url = ?, env = ?, enabled = ?,
         updated_at = datetime('now')
     WHERE id = ?`,
  ).run(
    next.name,
    next.type,
    next.command,
    JSON.stringify(next.args),
    next.url,
    JSON.stringify(next.env),
    next.enabled ? 1 : 0,
    id,
  );

  return getMcpServer(db, id);
}

export function deleteMcpServer(db: Db, id: number): boolean {
  return db.prepare("DELETE FROM mcp_servers WHERE id = ?").run(id).changes > 0;
}

export function recordToolCall(db: Db, input: NewToolCall): ToolCall {
  const info = db
    .prepare(
      "INSERT INTO tool_calls (server_id, tool_name, arguments, result, is_error, approved_by) VALUES (?, ?, ?, ?, ?, ?)",
    )
    .run(
      input.serverId,
      input.toolName,
      JSON.stringify(input.arguments ?? {}),
      input.result,
      input.isError ? 1 : 0,
      input.approvedBy,
    );
  const row = db
    .prepare("SELECT * FROM tool_calls WHERE id = ?")
    .get(Number(info.lastInsertRowid)) as ToolCallRow;
  return toToolCall(row);
}

export function listToolCalls(db: Db, limit = 50): ToolCall[] {
  const rows = db
    .prepare("SELECT * FROM tool_calls ORDER BY id DESC LIMIT ?")
    .all(limit) as ToolCallRow[];
  return rows.map(toToolCall);
}

function getRow(db: Db, id: number): McpServerRow | undefined {
  return db.prepare("SELECT * FROM mcp_servers WHERE id = ?").get(id) as McpServerRow | undefined;
}

function toPublic(row: McpServerRow): McpServer {
  return { ...base(row), env: redactEnv(parseEnv(row.env)) };
}

function toConfig(row: McpServerRow): McpServerConfig {
  const b = base(row);
  return {
    id: b.id,
    name: b.name,
    type: b.type,
    command: b.command,
    args: b.args,
    url: b.url,
    env: parseEnv(row.env),
    enabled: b.enabled,
  };
}

function base(row: McpServerRow) {
  return {
    id: row.id,
    name: row.name,
    type: row.type as McpServerType,
    command: row.command,
    args: parseArgs(row.args),
    url: row.url,
    enabled: row.enabled === 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function toToolCall(row: ToolCallRow): ToolCall {
  return {
    id: row.id,
    serverId: row.server_id,
    toolName: row.tool_name,
    arguments: safeParse(row.arguments),
    result: row.result,
    isError: row.is_error === 1,
    approvedBy: row.approved_by,
    createdAt: row.created_at,
  };
}

/** Schwärzt jeden nicht-leeren env-Wert. */
function redactEnv(env: Record<string, string>): Record<string, string> {
  return Object.fromEntries(
    Object.entries(env).map(([key, value]) => [key, value === "" ? "" : "••••••"]),
  );
}

function parseArgs(raw: string): string[] {
  const value = safeParse(raw);
  return Array.isArray(value) ? (value as string[]) : [];
}

function parseEnv(raw: string): Record<string, string> {
  const value = safeParse(raw);
  return value && typeof value === "object" ? (value as Record<string, string>) : {};
}

function safeParse(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}
