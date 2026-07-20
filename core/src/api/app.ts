import type {
  ChatMessage,
  ChatRequest,
  ChatResponse,
  CreateSessionRequest,
  PostMessageRequest,
  SearchResponse,
  SessionListResponse,
  SessionMessagesResponse,
  StatusResponse,
} from "@raider/shared";
import { type Context, Hono } from "hono";
import type { Db } from "../db/index";
import { getMigrationStatus } from "../db/migrate";
import {
  addMessage,
  createSession,
  getMessages,
  getSession,
  listSessions,
  searchMessages,
} from "../db/repository";
import { MissingApiKeyError, ProviderError } from "../providers/anthropic";
import { version } from "../version";

/** Ruft ein Modell auf und liefert die Antwort im internen Format. */
export type ChatFn = (request: ChatRequest) => Promise<ChatResponse>;

/**
 * Baut die lokale API. Bewusst als Fabrik: Tests bekommen so eine App gegen
 * eine In-Memory-Datenbank und eine austauschbare Chat-Funktion, ohne einen
 * echten Port oder Anbieter zu brauchen.
 */
export function createApp(db: Db, chat: ChatFn): Hono {
  const app = new Hono();

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
    if (!getSession(db, id)) return c.json({ error: "Session nicht gefunden." }, 404);

    const body = await readJson<PostMessageRequest>(c);
    const content = body?.content?.trim();
    if (!content) return c.json({ error: "Feld 'content' darf nicht leer sein." }, 400);

    // Nutzer-Nachricht sofort speichern — sie überlebt auch einen Anbieterfehler.
    addMessage(db, { sessionId: id, role: "user", content });

    const history: ChatMessage[] = getMessages(db, id).map((message) => ({
      role: message.role,
      content: message.content,
    }));

    try {
      const response = await chat({
        messages: history,
        ...(body?.model ? { model: body.model } : {}),
        ...(body?.maxTokens ? { maxTokens: body.maxTokens } : {}),
      });
      addMessage(db, {
        sessionId: id,
        role: "assistant",
        content: response.content,
        tokensIn: response.usage.inputTokens,
        tokensOut: response.usage.outputTokens,
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

  return app;
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
    const status = error.status === 401 || error.status === 429 ? error.status : 502;
    return c.json({ error: error.message }, status);
  }
  return c.json({ error: "Interner Fehler beim Modellaufruf." }, 500);
}
