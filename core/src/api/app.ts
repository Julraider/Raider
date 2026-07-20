import type { ChatRequest, ChatResponse, StatusResponse } from "@raider/shared";
import { Hono } from "hono";
import type { Db } from "../db/index";
import { getMigrationStatus } from "../db/migrate";
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

  app.post("/chat", async (c) => {
    let request: ChatRequest;
    try {
      request = await c.req.json();
    } catch {
      return c.json({ error: "Ungültiger JSON-Body." }, 400);
    }

    if (!Array.isArray(request.messages) || request.messages.length === 0) {
      return c.json({ error: "Feld 'messages' muss ein nicht-leeres Array sein." }, 400);
    }

    try {
      const response = await chat(request);
      return c.json(response);
    } catch (error) {
      if (error instanceof MissingApiKeyError) {
        return c.json({ error: error.message }, 503);
      }
      if (error instanceof ProviderError) {
        // Auth- und Rate-Limit-Fehler durchreichen, alles andere als Bad Gateway.
        const status = error.status === 401 || error.status === 429 ? error.status : 502;
        return c.json({ error: error.message }, status);
      }
      return c.json({ error: "Interner Fehler beim Modellaufruf." }, 500);
    }
  });

  return app;
}
