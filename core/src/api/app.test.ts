import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type {
  Agent,
  ChatRequest,
  McpServer,
  SearchResponse,
  Session,
  SessionMessagesResponse,
  StatusResponse,
  ToolCall,
} from "@raider/shared";
import { describe, expect, it } from "vitest";
import { openDatabase } from "../db/index";
import { runMigrations } from "../db/migrate";
import type { McpRunner } from "../mcp/types";
import { type ChatFn, createApp } from "./app";

const migrationsDir = join(dirname(fileURLToPath(import.meta.url)), "..", "db", "migrations");

/** Eine feste Chat-Antwort für Tests, ohne echten Anbieter. */
const stubChat: ChatFn = async () => ({
  role: "assistant",
  content: "Testantwort",
  model: "test-model",
  stopReason: "end_turn",
  usage: { inputTokens: 5, outputTokens: 3 },
});

/** Ersetzt den echten MCP-Client in Tests. */
const stubMcp: McpRunner = {
  listTools: async () => [{ name: "echo", description: "Echo", inputSchema: {} }],
  callTool: async (_config, tool, args) => ({
    content: `${tool}(${JSON.stringify(args)})`,
    isError: false,
  }),
};

function setupApp(chat: ChatFn = stubChat, mcp: McpRunner = stubMcp) {
  const db = openDatabase(":memory:");
  runMigrations(db, migrationsDir);
  return createApp(db, chat, mcp);
}

const json = (body: unknown): RequestInit => ({
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify(body),
});

describe("GET /status", () => {
  it("meldet Version und angewendete Migrationen", async () => {
    const app = setupApp();
    const res = await app.request("/status");
    expect(res.status).toBe(200);

    const body = (await res.json()) as StatusResponse;
    expect(body.status).toBe("ok");
    expect(body.database.connected).toBe(true);
    expect(body.database.migrations.applied).toBe(3);
    expect(body.database.migrations.latest).toBe("003_mcp.sql");
  });
});

describe("Sitzungen", () => {
  it("speichert einen Dialog-Zug und liest ihn zurück", async () => {
    const app = setupApp();

    const created = await app.request("/sessions", json({ channel: "cli", title: "Test" }));
    expect(created.status).toBe(201);
    const session = (await created.json()) as Session;

    const turn = await app.request(`/sessions/${session.id}/messages`, json({ content: "Hallo" }));
    expect(turn.status).toBe(200);

    const history = await app.request(`/sessions/${session.id}/messages`);
    const body = (await history.json()) as SessionMessagesResponse;
    expect(body.messages.map((m) => m.role)).toEqual(["user", "assistant"]);
  });

  it("antwortet mit 404 für eine unbekannte Sitzung", async () => {
    const app = setupApp();
    expect((await app.request("/sessions/999/messages")).status).toBe(404);
  });
});

describe("GET /search", () => {
  it("findet gespeicherte Nachrichten per Volltext", async () => {
    const app = setupApp();
    const created = await app.request("/sessions", json({ channel: "cli" }));
    const session = (await created.json()) as Session;
    await app.request(
      `/sessions/${session.id}/messages`,
      json({ content: "Etwas über Segelboote" }),
    );

    const res = await app.request("/search?q=segelboote");
    const body = (await res.json()) as SearchResponse;
    expect(body.hits[0]?.snippet).toContain("[Segelboote]");
  });
});

describe("Agenten", () => {
  it("legt einen Agenten an und listet ihn", async () => {
    const app = setupApp();
    const created = await app.request(
      "/agents",
      json({ name: "Coder", systemPrompt: "Sei knapp." }),
    );
    expect(created.status).toBe(201);
    const agent = (await created.json()) as Agent;
    expect(agent.name).toBe("Coder");

    const list = await app.request("/agents");
    const body = (await list.json()) as { agents: Agent[] };
    expect(body.agents).toHaveLength(1);
  });

  it("prägt den Modellaufruf mit Systemprompt und Modell des Agenten", async () => {
    let captured: ChatRequest | null = null;
    const capturingChat: ChatFn = async (request) => {
      captured = request;
      return stubChat(request);
    };
    const app = setupApp(capturingChat);

    const createdAgent = await app.request(
      "/agents",
      json({ name: "A", systemPrompt: "Du bist knapp.", model: "claude-haiku-4-5" }),
    );
    const agent = (await createdAgent.json()) as Agent;

    const createdSession = await app.request(
      "/sessions",
      json({ channel: "cli", agentId: agent.id }),
    );
    const session = (await createdSession.json()) as Session;
    expect(session.agentId).toBe(agent.id);

    await app.request(`/sessions/${session.id}/messages`, json({ content: "Hallo" }));

    expect(captured).not.toBeNull();
    const request = captured as unknown as ChatRequest;
    expect(request.system).toBe("Du bist knapp.");
    expect(request.model).toBe("claude-haiku-4-5");
  });
});

describe("MCP", () => {
  const stdioServer = json({
    name: "echo",
    type: "stdio",
    command: "node",
    env: { API_KEY: "geheim" },
  });

  it("legt einen Server an und schwärzt Secrets in der Liste", async () => {
    const app = setupApp();
    const created = await app.request("/mcp/servers", stdioServer);
    expect(created.status).toBe(201);
    const server = (await created.json()) as McpServer;
    expect(server.env.API_KEY).toBe("••••••");

    const list = await app.request("/mcp/servers");
    const body = (await list.json()) as { servers: McpServer[] };
    expect(body.servers[0]?.env.API_KEY).toBe("••••••");
  });

  it("testet die Verbindung und listet Werkzeuge auf", async () => {
    const app = setupApp();
    const created = await app.request("/mcp/servers", stdioServer);
    const server = (await created.json()) as McpServer;

    const res = await app.request(`/mcp/servers/${server.id}/test`, json({}));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { tools: { name: string }[] };
    expect(body.tools.map((t) => t.name)).toContain("echo");
  });

  it("verlangt eine Freigabe für einen Werkzeugaufruf", async () => {
    const app = setupApp();
    const created = await app.request("/mcp/servers", stdioServer);
    const server = (await created.json()) as McpServer;

    const denied = await app.request(`/mcp/servers/${server.id}/tools/echo/call`, json({}));
    expect(denied.status).toBe(403);
  });

  it("führt einen freigegebenen Aufruf aus und protokolliert ihn", async () => {
    const app = setupApp();
    const created = await app.request("/mcp/servers", stdioServer);
    const server = (await created.json()) as McpServer;

    const call = await app.request(
      `/mcp/servers/${server.id}/tools/echo/call`,
      json({ arguments: { text: "Hi" }, approvedBy: "test-user" }),
    );
    expect(call.status).toBe(200);
    const record = (await call.json()) as ToolCall;
    expect(record.approvedBy).toBe("test-user");
    expect(record.result).toContain("echo");

    const audit = await app.request("/tool-calls");
    const body = (await audit.json()) as { toolCalls: ToolCall[] };
    expect(body.toolCalls).toHaveLength(1);
  });
});
