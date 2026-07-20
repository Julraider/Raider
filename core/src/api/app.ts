import type { StatusResponse } from "@raider/shared";
import { Hono } from "hono";
import type { Db } from "../db/index";
import { getMigrationStatus } from "../db/migrate";
import { version } from "../version";

/**
 * Baut die lokale API. Bewusst als Fabrik: Tests bekommen so eine App gegen
 * eine In-Memory-Datenbank, ohne einen echten Port zu öffnen.
 */
export function createApp(db: Db): Hono {
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

  return app;
}
