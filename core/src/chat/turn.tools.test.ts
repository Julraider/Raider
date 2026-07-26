import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { ChatRequest, ChatResponse, McpTool, Session } from "@raider/shared";
import { describe, expect, it } from "vitest";
import { openDatabase } from "../db/index";
import { createMcpServer, grantToolPermission, listToolCalls } from "../db/mcp";
import { runMigrations } from "../db/migrate";
import { createSession } from "../db/repository";
import type { McpRunner, McpServerConfig, McpToolResult } from "../mcp/types";
import { runSessionTurn } from "./turn";

const migrationsDir = join(dirname(fileURLToPath(import.meta.url)), "..", "db", "migrations");

function freshDb() {
  const db = openDatabase(":memory:");
  runMigrations(db, migrationsDir);
  return db;
}

/** Ein MCP-Server, der zwei Werkzeuge anbietet und Aufrufe mitschreibt. */
function fakeRunner(): McpRunner & { calls: Array<{ tool: string; args: unknown }> } {
  const calls: Array<{ tool: string; args: unknown }> = [];
  return {
    calls,
    listTools: async (): Promise<McpTool[]> => [
      { name: "lies_datei", description: "Liest eine Datei", inputSchema: { type: "object" } },
      { name: "loesche_datei", description: "Löscht eine Datei", inputSchema: { type: "object" } },
    ],
    callTool: async (
      _config: McpServerConfig,
      tool: string,
      args: Record<string, unknown>,
    ): Promise<McpToolResult> => {
      calls.push({ tool, args });
      return { content: `Ergebnis von ${tool}`, isError: false };
    },
  };
}

/** Baut eine Testumgebung mit einem aktiven Server. */
function setup() {
  const db = freshDb();
  const server = createMcpServer(db, {
    name: "Dateien",
    type: "stdio",
    command: "node",
    args: [],
    url: null,
    env: {},
  });
  const session = createSession(db, { channel: "desktop" }) as Session;
  return { db, server, session, runner: fakeRunner() };
}

/** Ein Modell, das nacheinander die vorgegebenen Antworten liefert. */
function scriptedChat(responses: ChatResponse[]) {
  const seen: ChatRequest[] = [];
  let index = 0;
  const chat = async (request: ChatRequest): Promise<ChatResponse> => {
    seen.push(request);
    const next = responses[Math.min(index, responses.length - 1)];
    index++;
    return next as ChatResponse;
  };
  return { chat, seen };
}

const plain = (content: string): ChatResponse => ({
  role: "assistant",
  content,
  model: "test",
  stopReason: "end_turn",
  usage: { inputTokens: 1, outputTokens: 1 },
});

const wantsTool = (name: string, input: Record<string, unknown> = {}): ChatResponse => ({
  role: "assistant",
  content: "",
  model: "test",
  stopReason: "tool_use",
  usage: { inputTokens: 1, outputTokens: 1 },
  toolUses: [{ id: "tu_1", name, input }],
});

describe("Werkzeugschleife im Dialog-Zug", () => {
  it("bietet dem Modell ohne Freigabe gar keine Werkzeuge an", async () => {
    const { db, session, runner } = setup();
    const { chat, seen } = scriptedChat([plain("Hallo")]);

    await runSessionTurn(db, chat, session, "Hi", { tools: runner });

    expect(seen[0]?.tools).toBeUndefined();
    expect(runner.calls).toHaveLength(0);
  });

  it("bietet nur das ausdrücklich freigegebene Werkzeug an, nicht das andere", async () => {
    const { db, server, session, runner } = setup();
    grantToolPermission(db, server.id, "lies_datei", "Test");
    const { chat, seen } = scriptedChat([plain("Fertig")]);

    await runSessionTurn(db, chat, session, "Hi", { tools: runner });

    const names = seen[0]?.tools?.map((tool) => tool.name);
    expect(names).toEqual(["Dateien__lies_datei"]);
    expect(names).not.toContain("Dateien__loesche_datei");
  });

  it("führt ein freigegebenes Werkzeug aus und reicht das Ergebnis zurück ans Modell", async () => {
    const { db, server, session, runner } = setup();
    grantToolPermission(db, server.id, "lies_datei", "Test");
    const { chat, seen } = scriptedChat([
      wantsTool("Dateien__lies_datei", { pfad: "notiz.txt" }),
      plain("Die Datei enthält: Hallo"),
    ]);

    const response = await runSessionTurn(db, chat, session, "Lies notiz.txt", { tools: runner });

    expect(runner.calls).toEqual([{ tool: "lies_datei", args: { pfad: "notiz.txt" } }]);
    expect(response.content).toBe("Die Datei enthält: Hallo");
    // Das Ergebnis muss als tool_result im zweiten Aufruf angekommen sein.
    const second = seen[1];
    const results = second?.messages.at(-1)?.toolResults;
    expect(results?.[0]?.content).toBe("Ergebnis von lies_datei");
    expect(results?.[0]?.toolUseId).toBe("tu_1");
  });

  it("führt ein NICHT freigegebenes Werkzeug nicht aus, selbst wenn das Modell es erfindet", async () => {
    const { db, server, session, runner } = setup();
    grantToolPermission(db, server.id, "lies_datei", "Test");
    const { chat, seen } = scriptedChat([
      wantsTool("Dateien__loesche_datei", { pfad: "wichtig.txt" }),
      plain("Ging nicht."),
    ]);

    await runSessionTurn(db, chat, session, "Lösch das", { tools: runner });

    expect(runner.calls).toHaveLength(0);
    const results = seen[1]?.messages.at(-1)?.toolResults;
    expect(results?.[0]?.isError).toBe(true);
    expect(results?.[0]?.content).toContain("nicht freigegeben");
  });

  it("protokolliert jeden ausgeführten Aufruf nachvollziehbar", async () => {
    const { db, server, session, runner } = setup();
    grantToolPermission(db, server.id, "lies_datei", "Test");
    const { chat } = scriptedChat([wantsTool("Dateien__lies_datei"), plain("Fertig")]);

    await runSessionTurn(db, chat, session, "Los", { tools: runner });

    const log = listToolCalls(db);
    expect(log).toHaveLength(1);
    expect(log[0]?.toolName).toBe("lies_datei");
    expect(log[0]?.approvedBy).toBe("Dauerfreigabe");
  });

  it("bricht nach der Rundenobergrenze ab, statt sich im Kreis zu drehen", async () => {
    const { db, server, session, runner } = setup();
    grantToolPermission(db, server.id, "lies_datei", "Test");
    // Das Modell fordert immer wieder dasselbe Werkzeug an.
    const { chat } = scriptedChat([wantsTool("Dateien__lies_datei")]);

    const response = await runSessionTurn(db, chat, session, "Los", { tools: runner });

    expect(runner.calls.length).toBe(5);
    expect(response.content).toContain("Obergrenze");
  });

  it("läuft ohne MCP-Zugang genau wie bisher", async () => {
    const { db, server, session } = setup();
    grantToolPermission(db, server.id, "lies_datei", "Test");
    const { chat, seen } = scriptedChat([plain("Antwort ohne Werkzeuge")]);

    const response = await runSessionTurn(db, chat, session, "Hi");

    expect(seen).toHaveLength(1);
    expect(seen[0]?.tools).toBeUndefined();
    expect(response.content).toBe("Antwort ohne Werkzeuge");
  });
});
