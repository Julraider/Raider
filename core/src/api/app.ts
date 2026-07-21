import type {
  AgentListResponse,
  CallToolRequest,
  ChatRequest,
  CreateAgentRequest,
  CreateMcpServerRequest,
  CreateMemoryRequest,
  CreatePendingWriteRequest,
  CreateSessionRequest,
  CreateSkillRequest,
  ImportSkillRequest,
  McpServerListResponse,
  McpTestResponse,
  MemoryProposal,
  MemoryView,
  PendingWriteListResponse,
  PendingWriteStatus,
  PostMessageRequest,
  SearchResponse,
  SessionListResponse,
  SessionMessagesResponse,
  SkillExportResponse,
  SkillListResponse,
  SkillProposal,
  StatusResponse,
  TelegramChatListResponse,
  TelegramStatusResponse,
  ToolCallListResponse,
  UpdateAgentRequest,
  UpdateMcpServerRequest,
  UpdateMemoryRequest,
  UpdateSkillRequest,
} from "@raider/shared";
import { type Context, Hono } from "hono";
import { cors } from "hono/cors";
import { type ChatFn, runSessionTurn } from "../chat/turn";
import type { MemoryLimits } from "../config";

/** Konfiguration, die die API zur Laufzeit braucht. */
export interface AppConfig {
  memoryLimits: MemoryLimits;
  skillsDir: string;
  telegram: {
    /** Gültigkeitsdauer eines Kopplungs-Codes in Sekunden. */
    pairingTtlSeconds: number;
    /** Ob ein Bot-Token gesetzt ist (der Token selbst bleibt im Core). */
    enabled: boolean;
  };
}

import {
  createAgent,
  deleteAgent,
  duplicateAgent,
  getAgent,
  listAgents,
  updateAgent,
} from "../db/agents";
import type { Db } from "../db/index";
import {
  createMcpServer,
  deleteMcpServer,
  getMcpServer,
  getMcpServerConfig,
  listMcpServers,
  listToolCalls,
  recordToolCall,
  updateMcpServer,
} from "../db/mcp";
import {
  addMemoryEntry,
  deleteMemoryEntry,
  getEntry,
  listMemory,
  MemoryError,
  updateMemoryEntry,
  usedChars,
} from "../db/memory";
import { getMigrationStatus } from "../db/migrate";
import {
  createPendingWrite,
  getPendingWrite,
  listPendingWrites,
  resolvePendingWrite,
} from "../db/pending";
import {
  createSession,
  getMessages,
  getSession,
  listSessions,
  searchMessages,
} from "../db/repository";
import {
  assignSkill,
  createSkill,
  deleteSkill,
  exportSkill,
  getSkill,
  getSkillContent,
  importSkill,
  listAgentSkills,
  listSkills,
  unassignSkill,
  updateSkill,
} from "../db/skills";
import { chatCount, createPairingCode, listChats, unpairChat } from "../db/telegram";
import type { McpRunner } from "../mcp/types";
import { MissingApiKeyError, ProviderError } from "../providers/errors";
import { version } from "../version";

export type { ChatFn } from "../chat/turn";

/**
 * Baut die lokale API. Bewusst als Fabrik: Tests bekommen so eine App gegen
 * eine In-Memory-Datenbank und eine austauschbare Chat-Funktion, ohne einen
 * echten Port oder Anbieter zu brauchen.
 */
export function createApp(db: Db, chat: ChatFn, mcp: McpRunner, config: AppConfig): Hono {
  const app = new Hono();
  const limitFor = (store: "agent" | "user") =>
    store === "agent" ? config.memoryLimits.agent : config.memoryLimits.user;

  // Lokale Clients (auch der Electron-Renderer im Browser) dürfen zugreifen.
  // Der Core lauscht ohnehin nur auf localhost.
  app.use("*", cors({ origin: (origin) => origin ?? "*" }));

  app.get("/status", (c) => {
    const body: StatusResponse = {
      status: "ok",
      version,
      database: {
        connected: db.open,
        migrations: getMigrationStatus(db),
      },
    };
    return c.json(body);
  });

  // Zustandsloser Einmal-Aufruf (für `raider ask`).
  app.post("/chat", async (c) => {
    const request = await readJson<ChatRequest>(c);
    if (!request || !Array.isArray(request.messages) || request.messages.length === 0) {
      return c.json({ error: "Feld 'messages' muss ein nicht-leeres Array sein." }, 400);
    }
    try {
      return c.json(await chat(request));
    } catch (error) {
      return chatErrorResponse(c, error);
    }
  });

  app.post("/sessions", async (c) => {
    const body = (await readJson<CreateSessionRequest>(c)) ?? {};
    const session = createSession(db, {
      title: body.title ?? null,
      channel: body.channel ?? "cli",
      agentId: body.agentId ?? null,
    });
    return c.json(session, 201);
  });

  app.get("/sessions", (c) => {
    const body: SessionListResponse = { sessions: listSessions(db) };
    return c.json(body);
  });

  app.get("/sessions/:id/messages", (c) => {
    const id = parseId(c.req.param("id"));
    if (id === null) return c.json({ error: "Ungültige Session-ID." }, 400);
    const session = getSession(db, id);
    if (!session) return c.json({ error: "Session nicht gefunden." }, 404);
    const body: SessionMessagesResponse = { session, messages: getMessages(db, id) };
    return c.json(body);
  });

  // Zustandsbehafteter Dialog-Zug: Verlauf laden → Modell → beide Nachrichten speichern.
  app.post("/sessions/:id/messages", async (c) => {
    const id = parseId(c.req.param("id"));
    if (id === null) return c.json({ error: "Ungültige Session-ID." }, 400);
    const session = getSession(db, id);
    if (!session) return c.json({ error: "Session nicht gefunden." }, 404);

    const body = await readJson<PostMessageRequest>(c);
    const content = body?.content?.trim();
    if (!content) return c.json({ error: "Feld 'content' darf nicht leer sein." }, 400);

    try {
      // Agent-Prompt, Kerngedächtnis und Skills baut runSessionTurn zusammen —
      // dieselbe Logik nutzt auch das Telegram-Gateway.
      const response = await runSessionTurn(db, chat, session, content, {
        ...(body?.model ? { model: body.model } : {}),
        ...(body?.maxTokens ? { maxTokens: body.maxTokens } : {}),
      });
      return c.json(response);
    } catch (error) {
      return chatErrorResponse(c, error);
    }
  });

  app.get("/search", (c) => {
    const query = (c.req.query("q") ?? "").trim();
    if (query === "") return c.json({ error: "Query-Parameter 'q' fehlt." }, 400);
    const body: SearchResponse = { query, hits: searchMessages(db, query) };
    return c.json(body);
  });

  // --- Agenten ---

  app.post("/agents", async (c) => {
    const body = await readJson<CreateAgentRequest>(c);
    const name = body?.name?.trim();
    if (!name) return c.json({ error: "Feld 'name' darf nicht leer sein." }, 400);
    const agent = createAgent(db, {
      name,
      icon: body?.icon ?? null,
      systemPrompt: body?.systemPrompt ?? "",
      model: body?.model ?? null,
      fallbackModel: body?.fallbackModel ?? null,
    });
    return c.json(agent, 201);
  });

  app.get("/agents", (c) => {
    const body: AgentListResponse = { agents: listAgents(db) };
    return c.json(body);
  });

  app.get("/agents/:id", (c) => {
    const id = parseId(c.req.param("id"));
    if (id === null) return c.json({ error: "Ungültige Agent-ID." }, 400);
    const agent = getAgent(db, id);
    if (!agent) return c.json({ error: "Agent nicht gefunden." }, 404);
    return c.json(agent);
  });

  app.patch("/agents/:id", async (c) => {
    const id = parseId(c.req.param("id"));
    if (id === null) return c.json({ error: "Ungültige Agent-ID." }, 400);
    const body = (await readJson<UpdateAgentRequest>(c)) ?? {};
    const agent = updateAgent(db, id, body);
    if (!agent) return c.json({ error: "Agent nicht gefunden." }, 404);
    return c.json(agent);
  });

  app.delete("/agents/:id", (c) => {
    const id = parseId(c.req.param("id"));
    if (id === null) return c.json({ error: "Ungültige Agent-ID." }, 400);
    if (!deleteAgent(db, id)) return c.json({ error: "Agent nicht gefunden." }, 404);
    return c.json({ deleted: true });
  });

  app.post("/agents/:id/duplicate", (c) => {
    const id = parseId(c.req.param("id"));
    if (id === null) return c.json({ error: "Ungültige Agent-ID." }, 400);
    const agent = duplicateAgent(db, id);
    if (!agent) return c.json({ error: "Agent nicht gefunden." }, 404);
    return c.json(agent, 201);
  });

  // --- MCP-Server ---

  app.post("/mcp/servers", async (c) => {
    const body = await readJson<CreateMcpServerRequest>(c);
    const name = body?.name?.trim();
    if (!name || (body?.type !== "stdio" && body?.type !== "http")) {
      return c.json({ error: "Felder 'name' und 'type' (stdio|http) sind nötig." }, 400);
    }
    const server = createMcpServer(db, {
      name,
      type: body.type,
      command: body.command ?? null,
      args: body.args ?? [],
      url: body.url ?? null,
      env: body.env ?? {},
      enabled: body.enabled ?? true,
    });
    return c.json(server, 201);
  });

  app.get("/mcp/servers", (c) => {
    const body: McpServerListResponse = { servers: listMcpServers(db) };
    return c.json(body);
  });

  app.get("/mcp/servers/:id", (c) => {
    const id = parseId(c.req.param("id"));
    if (id === null) return c.json({ error: "Ungültige Server-ID." }, 400);
    const server = getMcpServer(db, id);
    if (!server) return c.json({ error: "Server nicht gefunden." }, 404);
    return c.json(server);
  });

  app.patch("/mcp/servers/:id", async (c) => {
    const id = parseId(c.req.param("id"));
    if (id === null) return c.json({ error: "Ungültige Server-ID." }, 400);
    const body = (await readJson<UpdateMcpServerRequest>(c)) ?? {};
    const server = updateMcpServer(db, id, body);
    if (!server) return c.json({ error: "Server nicht gefunden." }, 404);
    return c.json(server);
  });

  app.delete("/mcp/servers/:id", (c) => {
    const id = parseId(c.req.param("id"));
    if (id === null) return c.json({ error: "Ungültige Server-ID." }, 400);
    if (!deleteMcpServer(db, id)) return c.json({ error: "Server nicht gefunden." }, 404);
    return c.json({ deleted: true });
  });

  // Verbindungstest: verbinden, Werkzeuge auflisten, trennen.
  app.post("/mcp/servers/:id/test", async (c) => {
    const id = parseId(c.req.param("id"));
    if (id === null) return c.json({ error: "Ungültige Server-ID." }, 400);
    const config = getMcpServerConfig(db, id);
    if (!config) return c.json({ error: "Server nicht gefunden." }, 404);
    if (!config.enabled) return c.json({ error: "Server ist deaktiviert." }, 409);
    try {
      const body: McpTestResponse = { serverId: id, tools: await mcp.listTools(config) };
      return c.json(body);
    } catch (error) {
      return c.json({ error: `Verbindung fehlgeschlagen: ${messageOf(error)}` }, 502);
    }
  });

  // Werkzeugaufruf — nur mit Freigabe (approvedBy).
  app.post("/mcp/servers/:id/tools/:tool/call", async (c) => {
    const id = parseId(c.req.param("id"));
    if (id === null) return c.json({ error: "Ungültige Server-ID." }, 400);
    const config = getMcpServerConfig(db, id);
    if (!config) return c.json({ error: "Server nicht gefunden." }, 404);
    if (!config.enabled) return c.json({ error: "Server ist deaktiviert." }, 409);

    const body = await readJson<CallToolRequest>(c);
    const approvedBy = body?.approvedBy?.trim();
    if (!approvedBy) return c.json({ error: "Freigabe erforderlich." }, 403);

    const tool = c.req.param("tool");
    const args = body?.arguments ?? {};
    try {
      const result = await mcp.callTool(config, tool, args);
      const record = recordToolCall(db, {
        serverId: id,
        toolName: tool,
        arguments: args,
        result: result.content,
        isError: result.isError,
        approvedBy,
      });
      return c.json(record);
    } catch (error) {
      return c.json({ error: `Werkzeugaufruf fehlgeschlagen: ${messageOf(error)}` }, 502);
    }
  });

  app.get("/tool-calls", (c) => {
    const body: ToolCallListResponse = { toolCalls: listToolCalls(db) };
    return c.json(body);
  });

  // --- Memory (Kerngedächtnis, Ebene 1) ---

  app.get("/memory/:store", (c) => {
    const store = parseStore(c.req.param("store"));
    if (!store) return c.json({ error: "Ungültiger Speicher (agent|user)." }, 400);
    const body: MemoryView = {
      store,
      used: usedChars(db, store),
      limit: limitFor(store),
      entries: listMemory(db, store),
    };
    return c.json(body);
  });

  app.post("/memory/:store", async (c) => {
    const store = parseStore(c.req.param("store"));
    if (!store) return c.json({ error: "Ungültiger Speicher (agent|user)." }, 400);
    const body = await readJson<CreateMemoryRequest>(c);
    if (!body?.content?.trim())
      return c.json({ error: "Feld 'content' darf nicht leer sein." }, 400);
    try {
      const entry = addMemoryEntry(
        db,
        { store, content: body.content, sourceSessionId: body.sourceSessionId ?? null },
        limitFor(store),
      );
      return c.json(entry, 201);
    } catch (error) {
      return memoryErrorResponse(c, error);
    }
  });

  app.patch("/memory/entries/:id", async (c) => {
    const id = parseId(c.req.param("id"));
    if (id === null) return c.json({ error: "Ungültige Eintrags-ID." }, 400);
    const existing = getEntry(db, id);
    if (!existing) return c.json({ error: "Eintrag nicht gefunden." }, 404);
    const body = await readJson<UpdateMemoryRequest>(c);
    if (!body?.content?.trim())
      return c.json({ error: "Feld 'content' darf nicht leer sein." }, 400);
    try {
      const entry = updateMemoryEntry(db, id, body.content, limitFor(existing.store));
      return c.json(entry);
    } catch (error) {
      return memoryErrorResponse(c, error);
    }
  });

  app.delete("/memory/entries/:id", (c) => {
    const id = parseId(c.req.param("id"));
    if (id === null) return c.json({ error: "Ungültige Eintrags-ID." }, 400);
    if (!deleteMemoryEntry(db, id)) return c.json({ error: "Eintrag nicht gefunden." }, 404);
    return c.json({ deleted: true });
  });

  // --- Freigabe-Posteingang ---

  app.post("/inbox", async (c) => {
    const body = await readJson<CreatePendingWriteRequest>(c);
    if (!body || (body.kind !== "memory" && body.kind !== "skill") || !body.proposal) {
      return c.json({ error: "Felder 'kind' (memory|skill) und 'proposal' sind nötig." }, 400);
    }
    return c.json(createPendingWrite(db, body), 201);
  });

  app.get("/inbox", (c) => {
    const raw = c.req.query("status");
    const filter: PendingWriteStatus | undefined =
      raw === "approved" || raw === "rejected" || raw === "pending"
        ? raw
        : raw === "all"
          ? undefined
          : "pending";
    const body: PendingWriteListResponse = { pendingWrites: listPendingWrites(db, filter) };
    return c.json(body);
  });

  app.post("/inbox/:id/approve", (c) => {
    const id = parseId(c.req.param("id"));
    if (id === null) return c.json({ error: "Ungültige ID." }, 400);
    const write = getPendingWrite(db, id);
    if (!write) return c.json({ error: "Vorschlag nicht gefunden." }, 404);
    if (write.status !== "pending") return c.json({ error: "Bereits bearbeitet." }, 409);

    if (write.kind === "memory") {
      const { store, content } = write.proposal as MemoryProposal;
      try {
        // Anwenden geht durch die Memory-Prüfung (Limit, Duplikat, Injection).
        const applied = addMemoryEntry(
          db,
          { store, content, sourceSessionId: write.sourceSessionId },
          limitFor(store),
        );
        const pendingWrite = resolvePendingWrite(db, id, "approved");
        return c.json({ pendingWrite, applied });
      } catch (error) {
        // Bei Ablehnung bleibt der Vorschlag offen — zum Nachbessern.
        return memoryErrorResponse(c, error);
      }
    }

    // kind === "skill": als neuen Skill anlegen.
    const proposal = write.proposal as SkillProposal;
    const applied = createSkill(db, config.skillsDir, {
      name: proposal.name,
      description: proposal.description,
      category: proposal.category,
      content: proposal.content,
      source: "auto",
    });
    const pendingWrite = resolvePendingWrite(db, id, "approved");
    return c.json({ pendingWrite, applied });
  });

  app.post("/inbox/:id/reject", (c) => {
    const id = parseId(c.req.param("id"));
    if (id === null) return c.json({ error: "Ungültige ID." }, 400);
    const write = getPendingWrite(db, id);
    if (!write) return c.json({ error: "Vorschlag nicht gefunden." }, 404);
    if (write.status !== "pending") return c.json({ error: "Bereits bearbeitet." }, 409);
    return c.json(resolvePendingWrite(db, id, "rejected"));
  });

  // --- Skills ---

  app.post("/skills", async (c) => {
    const body = await readJson<CreateSkillRequest>(c);
    const name = body?.name?.trim();
    if (!name) return c.json({ error: "Feld 'name' darf nicht leer sein." }, 400);
    const skill = createSkill(db, config.skillsDir, {
      name,
      description: body?.description ?? "",
      category: body?.category ?? null,
      content: body?.content ?? "",
    });
    return c.json(skill, 201);
  });

  app.get("/skills", (c) => {
    const body: SkillListResponse = { skills: listSkills(db) };
    return c.json(body);
  });

  app.get("/skills/:id", (c) => {
    const id = parseId(c.req.param("id"));
    if (id === null) return c.json({ error: "Ungültige Skill-ID." }, 400);
    const skill = getSkillContent(db, id);
    if (!skill) return c.json({ error: "Skill nicht gefunden." }, 404);
    return c.json(skill);
  });

  app.patch("/skills/:id", async (c) => {
    const id = parseId(c.req.param("id"));
    if (id === null) return c.json({ error: "Ungültige Skill-ID." }, 400);
    const body = (await readJson<UpdateSkillRequest>(c)) ?? {};
    const skill = updateSkill(db, id, body);
    if (!skill) return c.json({ error: "Skill nicht gefunden." }, 404);
    return c.json(skill);
  });

  app.delete("/skills/:id", (c) => {
    const id = parseId(c.req.param("id"));
    if (id === null) return c.json({ error: "Ungültige Skill-ID." }, 400);
    if (!deleteSkill(db, id)) return c.json({ error: "Skill nicht gefunden." }, 404);
    return c.json({ deleted: true });
  });

  app.get("/skills/:id/export", (c) => {
    const id = parseId(c.req.param("id"));
    if (id === null) return c.json({ error: "Ungültige Skill-ID." }, 400);
    const markdown = exportSkill(db, id);
    if (markdown === undefined) return c.json({ error: "Skill nicht gefunden." }, 404);
    const body: SkillExportResponse = { markdown };
    return c.json(body);
  });

  app.post("/skills/import", async (c) => {
    const body = await readJson<ImportSkillRequest>(c);
    if (!body?.markdown?.trim())
      return c.json({ error: "Feld 'markdown' darf nicht leer sein." }, 400);
    return c.json(importSkill(db, config.skillsDir, body.markdown), 201);
  });

  app.get("/agents/:id/skills", (c) => {
    const id = parseId(c.req.param("id"));
    if (id === null) return c.json({ error: "Ungültige Agent-ID." }, 400);
    if (!getAgent(db, id)) return c.json({ error: "Agent nicht gefunden." }, 404);
    const body: SkillListResponse = { skills: listAgentSkills(db, id) };
    return c.json(body);
  });

  app.post("/agents/:id/skills/:skillId", (c) => {
    const agentId = parseId(c.req.param("id"));
    const skillId = parseId(c.req.param("skillId"));
    if (agentId === null || skillId === null) return c.json({ error: "Ungültige ID." }, 400);
    if (!getAgent(db, agentId)) return c.json({ error: "Agent nicht gefunden." }, 404);
    if (!getSkill(db, skillId)) return c.json({ error: "Skill nicht gefunden." }, 404);
    assignSkill(db, agentId, skillId);
    return c.json({ assigned: true });
  });

  app.delete("/agents/:id/skills/:skillId", (c) => {
    const agentId = parseId(c.req.param("id"));
    const skillId = parseId(c.req.param("skillId"));
    if (agentId === null || skillId === null) return c.json({ error: "Ungültige ID." }, 400);
    unassignSkill(db, agentId, skillId);
    return c.json({ unassigned: true });
  });

  // --- Telegram-Gateway (Verwaltung; der Bot-Token bleibt im Core) ---

  app.get("/telegram/status", (c) => {
    const body: TelegramStatusResponse = {
      enabled: config.telegram.enabled,
      chatCount: chatCount(db),
    };
    return c.json(body);
  });

  app.post("/telegram/pairing-codes", (c) => {
    const code = createPairingCode(db, config.telegram.pairingTtlSeconds);
    return c.json(code, 201);
  });

  app.get("/telegram/chats", (c) => {
    const body: TelegramChatListResponse = { chats: listChats(db) };
    return c.json(body);
  });

  app.delete("/telegram/chats/:chatId", (c) => {
    const chatId = Number(c.req.param("chatId"));
    if (!Number.isInteger(chatId)) return c.json({ error: "Ungültige Chat-ID." }, 400);
    if (!unpairChat(db, chatId)) return c.json({ error: "Chat nicht gekoppelt." }, 404);
    return c.json({ unpaired: true });
  });

  return app;
}

/** Fehlermeldung aus einem unbekannten Fehler ziehen. */
function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** Prüft und normalisiert den Speicher-Namen. */
function parseStore(raw: string): "agent" | "user" | null {
  return raw === "agent" || raw === "user" ? raw : null;
}

/** Bildet MemoryError auf den passenden HTTP-Status ab. */
function memoryErrorResponse(c: Context, error: unknown): Response {
  if (error instanceof MemoryError) {
    return c.json({ error: error.message }, error.status as 400 | 409 | 413 | 500);
  }
  return c.json({ error: "Interner Fehler im Kerngedächtnis." }, 500);
}

/** Liest JSON aus dem Request, oder null bei ungültigem Body. */
async function readJson<T>(c: Context): Promise<T | null> {
  try {
    return (await c.req.json()) as T;
  } catch {
    return null;
  }
}

/** Parst eine positive Ganzzahl-ID, oder null wenn ungültig. */
function parseId(raw: string): number | null {
  const id = Number(raw);
  return Number.isInteger(id) && id > 0 ? id : null;
}

/** Bildet Anbieter-/Key-Fehler auf passende HTTP-Antworten ab. */
function chatErrorResponse(c: Context, error: unknown): Response {
  if (error instanceof MissingApiKeyError) {
    return c.json({ error: error.message }, 503);
  }
  if (error instanceof ProviderError) {
    // Auth-, Rate-Limit- und „Dienst nicht erreichbar"-Fehler durchreichen.
    const passthrough = error.status === 401 || error.status === 429 || error.status === 503;
    return c.json({ error: error.message }, passthrough ? error.status : 502);
  }
  return c.json({ error: "Interner Fehler beim Modellaufruf." }, 500);
}
