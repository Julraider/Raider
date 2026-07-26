import type {
  AgentListResponse,
  BackupListResponse,
  CallToolRequest,
  ChatRequest,
  CreateAgentRequest,
  CreateMcpServerRequest,
  CreateMemoryRequest,
  CreatePendingWriteRequest,
  CreateScheduledTaskRequest,
  CreateSessionRequest,
  CreateSkillRequest,
  EmergencyStopState,
  HealthReport,
  ImportSkillRequest,
  McpServerListResponse,
  McpTestResponse,
  MemoryProposal,
  MemoryView,
  PendingWriteListResponse,
  PendingWriteStatus,
  PostMessageRequest,
  ReviewRunListResponse,
  ReviewSummary,
  RunTaskResponse,
  ScheduledTaskListResponse,
  SearchResponse,
  SessionListResponse,
  SessionMessagesResponse,
  SkillExportResponse,
  SkillListResponse,
  SkillProposal,
  StatsReport,
  StatusResponse,
  TelegramChatListResponse,
  TelegramStatusResponse,
  ToolCallListResponse,
  UpdateAgentRequest,
  UpdateMcpServerRequest,
  UpdateMemoryRequest,
  UpdateScheduledTaskRequest,
  UpdateSkillRequest,
} from "@raider/shared";
import { type Context, Hono } from "hono";
import { cors } from "hono/cors";
import { streamSSE } from "hono/streaming";
import {
  type ChatFn,
  type ChatStreamFn,
  runSessionTurn,
  runSessionTurnStreamed,
} from "../chat/turn";
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
  /**
   * Streamende Modellanbindung. Fehlt sie, gibt es den Stream-Endpunkt nicht
   * und Clients fallen automatisch auf die normale Antwort zurück.
   */
  chatStream?: ChatStreamFn;
  /** Betrieb: Sicherungen, Logging und Angaben für den Gesundheitscheck. */
  ops: {
    backupsDir: string;
    backupKeep: number;
    logRequests: boolean;
    /** Läuft der Hintergrund-Review automatisch? */
    reviewEnabled: boolean;
    /** Anbieter-Angaben für /health (nie das Geheimnis selbst). */
    provider: { name: string; model: string; hasApiKey: boolean };
    /** Startzeitpunkt (epoch ms) für die Laufzeit-Anzeige. */
    startedAt: number;
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
import { createBackup, listBackups } from "../db/backup";
import { engageStop, getStop, isStopped, releaseStop } from "../db/emergency";
import type { Db } from "../db/index";
import {
  createMcpServer,
  deleteMcpServer,
  getMcpServer,
  getMcpServerConfig,
  grantToolPermission,
  listMcpServers,
  listToolCalls,
  listToolPermissions,
  recordToolCall,
  revokeToolPermission,
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
import { listReviewRuns } from "../db/review";
import {
  createScheduledTask,
  deleteScheduledTask,
  getScheduledTask,
  listScheduledTasks,
  ScheduleError,
  updateScheduledTask,
} from "../db/scheduler";
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
import { collectStats } from "../db/stats";
import { chatCount, createPairingCode, listChats, unpairChat } from "../db/telegram";
import type { McpRunner } from "../mcp/types";
import { MissingApiKeyError, ProviderError } from "../providers/errors";
import { runReview } from "../review/reviewer";
import { runScheduledTask } from "../scheduler/runner";
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

  // Betrieb: knappes Request-Log (nur Methode/Pfad/Status/Dauer, nie Inhalte).
  if (config.ops.logRequests) {
    app.use("*", async (c, next) => {
      const started = Date.now();
      await next();
      console.log(`${c.req.method} ${c.req.path} → ${c.res.status} (${Date.now() - started}ms)`);
    });
  }

  // Betrieb: ein unerwarteter Fehler wird eine saubere 500 statt eines Absturzes.
  app.onError((error, c) => {
    console.error(`Unerwarteter Fehler bei ${c.req.method} ${c.req.path}:`, error);
    return c.json({ error: "Interner Fehler." }, 500);
  });

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

  // --- Betrieb: Gesundheit, Statistik, Sicherungen ---

  app.get("/health", (c) => {
    const connected = db.open;
    const body: HealthReport = {
      status: connected ? "ok" : "degraded",
      version,
      uptimeSeconds: Math.round((Date.now() - config.ops.startedAt) / 1000),
      database: { connected, path: db.name },
      provider: config.ops.provider,
      workers: {
        scheduler: true,
        review: config.ops.reviewEnabled,
        telegram: config.telegram.enabled,
      },
      emergencyStop: isStopped(db),
    };
    return c.json(body, connected ? 200 : 503);
  });

  app.get("/stats", (c) => {
    const body: StatsReport = collectStats(db);
    return c.json(body);
  });

  app.post("/backup", async (c) => {
    const info = await createBackup(db, config.ops.backupsDir, config.ops.backupKeep);
    return c.json(info, 201);
  });

  app.get("/backups", (c) => {
    const body: BackupListResponse = { backups: listBackups(config.ops.backupsDir) };
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
        // Raider darf dabei die Werkzeuge benutzen, die dauerhaft freigegeben
        // sind — nur diese sieht das Modell überhaupt.
        tools: mcp,
      });
      return c.json(response);
    } catch (error) {
      return chatErrorResponse(c, error);
    }
  });

  /**
   * Wie POST /sessions/:id/messages, liefert die Antwort aber stückweise
   * (Server-Sent Events), damit sie im Fenster Wort für Wort erscheint.
   * Ereignisse: `text` (Stück), `tool` (Werkzeug läuft), `done` (fertig),
   * `error` (abgebrochen).
   */
  app.post("/sessions/:id/messages/stream", async (c) => {
    const streamChat = config.chatStream;
    if (!streamChat) return c.json({ error: "Dieser Anbieter kann nicht streamen." }, 501);

    const id = parseId(c.req.param("id"));
    if (id === null) return c.json({ error: "Ungültige Sitzungs-ID." }, 400);
    const session = getSession(db, id);
    if (!session) return c.json({ error: "Sitzung nicht gefunden." }, 404);

    const body = await readJson<PostMessageRequest>(c);
    const content = body?.content?.trim();
    if (!content) return c.json({ error: "Feld 'content' darf nicht leer sein." }, 400);

    const events = runSessionTurnStreamed(db, streamChat, session, content, {
      ...(body?.model ? { model: body.model } : {}),
      ...(body?.maxTokens ? { maxTokens: body.maxTokens } : {}),
      tools: mcp,
    });

    return streamSSE(c, async (sse) => {
      try {
        for await (const event of events) {
          await sse.writeSSE({ event: event.type, data: JSON.stringify(event) });
        }
      } catch (error) {
        // Der Fehler muss über den offenen Strom gemeldet werden — ein
        // HTTP-Status ist zu diesem Zeitpunkt längst gesendet.
        await sse.writeSSE({
          event: "error",
          data: JSON.stringify({ message: messageOf(error) }),
        });
      }
    });
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

  /* ---------------------------------------------------------------------
   * Dauerfreigaben: welche Werkzeuge Raider von sich aus benutzen darf.
   *
   * Ohne Eintrag hier bekommt das Modell ein Werkzeug gar nicht zu sehen —
   * die Freigabe ist also die einzige Stelle, an der aus einem verbundenen
   * Server eine Fähigkeit des Assistenten wird.
   * ------------------------------------------------------------------- */

  app.get("/mcp/permissions", (c) => {
    return c.json({ permissions: listToolPermissions(db) });
  });

  app.post("/mcp/servers/:id/permissions", async (c) => {
    const id = parseId(c.req.param("id"));
    if (id === null) return c.json({ error: "Ungültige Server-ID." }, 400);
    if (!getMcpServer(db, id)) return c.json({ error: "Server nicht gefunden." }, 404);

    const body = await readJson<{ toolName?: string; grantedBy?: string }>(c);
    const toolName = body?.toolName?.trim();
    if (!toolName) return c.json({ error: "Feld 'toolName' fehlt." }, 400);

    grantToolPermission(db, id, toolName, body?.grantedBy?.trim() || null);
    return c.json({ granted: true, serverId: id, toolName }, 201);
  });

  app.delete("/mcp/servers/:id/permissions/:tool", (c) => {
    const id = parseId(c.req.param("id"));
    if (id === null) return c.json({ error: "Ungültige Server-ID." }, 400);
    const toolName = c.req.param("tool");
    const revoked = revokeToolPermission(db, id, toolName);
    if (!revoked) return c.json({ error: "Freigabe nicht gefunden." }, 404);
    return c.json({ revoked: true });
  });

  // Werkzeugaufruf — nur mit Freigabe (approvedBy).
  app.post("/mcp/servers/:id/tools/:tool/call", async (c) => {
    if (isStopped(db)) return c.json({ error: "Not-Stopp aktiv — keine Werkzeugaufrufe." }, 423);
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

  // --- Scheduler (geplante Aufgaben) ---

  app.post("/scheduler/tasks", async (c) => {
    const body = await readJson<CreateScheduledTaskRequest>(c);
    const name = body?.name?.trim();
    const prompt = body?.prompt?.trim();
    if (!name || !prompt || !body?.scheduleKind || !body?.scheduleValue) {
      return c.json(
        { error: "Felder 'name', 'prompt', 'scheduleKind' und 'scheduleValue' sind nötig." },
        400,
      );
    }
    try {
      const task = createScheduledTask(db, {
        name,
        scheduleKind: body.scheduleKind,
        scheduleValue: body.scheduleValue,
        prompt,
        agentId: body.agentId ?? null,
      });
      return c.json(task, 201);
    } catch (error) {
      if (error instanceof ScheduleError) return c.json({ error: error.message }, 400);
      throw error;
    }
  });

  app.get("/scheduler/tasks", (c) => {
    const body: ScheduledTaskListResponse = { tasks: listScheduledTasks(db) };
    return c.json(body);
  });

  app.get("/scheduler/tasks/:id", (c) => {
    const id = parseId(c.req.param("id"));
    if (id === null) return c.json({ error: "Ungültige Aufgaben-ID." }, 400);
    const task = getScheduledTask(db, id);
    if (!task) return c.json({ error: "Aufgabe nicht gefunden." }, 404);
    return c.json(task);
  });

  app.patch("/scheduler/tasks/:id", async (c) => {
    const id = parseId(c.req.param("id"));
    if (id === null) return c.json({ error: "Ungültige Aufgaben-ID." }, 400);
    const body = (await readJson<UpdateScheduledTaskRequest>(c)) ?? {};
    try {
      const task = updateScheduledTask(db, id, body);
      if (!task) return c.json({ error: "Aufgabe nicht gefunden." }, 404);
      return c.json(task);
    } catch (error) {
      if (error instanceof ScheduleError) return c.json({ error: error.message }, 400);
      throw error;
    }
  });

  app.delete("/scheduler/tasks/:id", (c) => {
    const id = parseId(c.req.param("id"));
    if (id === null) return c.json({ error: "Ungültige Aufgaben-ID." }, 400);
    if (!deleteScheduledTask(db, id)) return c.json({ error: "Aufgabe nicht gefunden." }, 404);
    return c.json({ deleted: true });
  });

  // Sofort ausführen (auch wenn nicht fällig) — bei Not-Stopp gesperrt.
  app.post("/scheduler/tasks/:id/run", async (c) => {
    if (isStopped(db)) return c.json({ error: "Not-Stopp aktiv — keine Ausführung." }, 423);
    const id = parseId(c.req.param("id"));
    if (id === null) return c.json({ error: "Ungültige Aufgaben-ID." }, 400);
    const task = getScheduledTask(db, id);
    if (!task) return c.json({ error: "Aufgabe nicht gefunden." }, 404);
    try {
      const sessionId = await runScheduledTask(db, chat, task, new Date(), mcp);
      const body: RunTaskResponse = { sessionId, ran: true };
      return c.json(body);
    } catch (error) {
      return chatErrorResponse(c, error);
    }
  });

  // --- Not-Stopp (der große rote Schalter) ---

  app.get("/emergency-stop", (c) => {
    const body: EmergencyStopState = getStop(db);
    return c.json(body);
  });

  app.post("/emergency-stop", async (c) => {
    const body = await readJson<{ reason?: string }>(c);
    const state: EmergencyStopState = engageStop(db, body?.reason?.trim() || null);
    return c.json(state);
  });

  app.delete("/emergency-stop", (c) => {
    const state: EmergencyStopState = releaseStop(db);
    return c.json(state);
  });

  // --- Hintergrund-Review (schlägt vor, wendet nie an) ---

  app.post("/review/run", async (c) => {
    if (isStopped(db)) return c.json({ error: "Not-Stopp aktiv — kein Review." }, 423);
    try {
      const summary: ReviewSummary = await runReview(db, chat);
      return c.json(summary);
    } catch (error) {
      return chatErrorResponse(c, error);
    }
  });

  app.get("/review/runs", (c) => {
    const body: ReviewRunListResponse = { runs: listReviewRuns(db) };
    return c.json(body);
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
