import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { createRaiderClient, type RaiderClient } from "@raider/shared";

// ApiError kommt jetzt aus dem gemeinsamen Client.
export { ApiError } from "@raider/shared";

/** Basis-URL der lokalen API, aus RAIDER_PORT abgeleitet. */
export function resolveBaseUrl(env: NodeJS.ProcessEnv = process.env): string {
  const port = env.RAIDER_PORT ? Number(env.RAIDER_PORT) : 4179;
  return `http://localhost:${port}`;
}

/** Datenordner des Cores — dort liegt auch das Zugriffstoken. */
function resolveDataDir(env: NodeJS.ProcessEnv): string {
  return env.RAIDER_DATA_DIR ?? join(homedir(), "Raider");
}

/**
 * Liest das Zugriffstoken aus dem Datenordner. Bewusst hier nachgebaut statt
 * aus dem Core importiert: Die CLI ist ein eigenes Paket und soll nicht quer in
 * die Interna des Cores greifen.
 */
function readAccessToken(dataDir: string): string | undefined {
  const path = join(dataDir, ".access-token");
  try {
    if (!existsSync(path)) return undefined;
    const token = readFileSync(path, "utf8").trim();
    return token === "" ? undefined : token;
  } catch {
    return undefined;
  }
}

/**
 * Fertig konfigurierter Core-Client für die CLI. Das Zugriffstoken liest die
 * CLI aus dem Datenordner — sie läuft auf demselben Rechner und darf das.
 */
export function coreClient(env: NodeJS.ProcessEnv = process.env): RaiderClient {
  return createRaiderClient(resolveBaseUrl(env), readAccessToken(resolveDataDir(env)));
}
