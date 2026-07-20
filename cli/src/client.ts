import { createRaiderClient, type RaiderClient } from "@raider/shared";

// ApiError kommt jetzt aus dem gemeinsamen Client.
export { ApiError } from "@raider/shared";

/** Basis-URL der lokalen API, aus RAIDER_PORT abgeleitet. */
export function resolveBaseUrl(env: NodeJS.ProcessEnv = process.env): string {
  const port = env.RAIDER_PORT ? Number(env.RAIDER_PORT) : 4179;
  return `http://localhost:${port}`;
}

/** Fertig konfigurierter Core-Client für die CLI. */
export function coreClient(env: NodeJS.ProcessEnv = process.env): RaiderClient {
  return createRaiderClient(resolveBaseUrl(env));
}
