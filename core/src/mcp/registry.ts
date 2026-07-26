import type { ToolDefinition } from "@raider/shared";
import type { Db } from "../db/index";
import { getMcpServerConfig, listMcpServers, listToolPermissions } from "../db/mcp";
import type { McpRunner, McpServerConfig } from "./types";

/**
 * Stellt dem Modell den Katalog der Werkzeuge bereit, die es selbst benutzen
 * darf — und übersetzt zwischen dem flachen Namen, den das Modell sieht
 * (`server__werkzeug`), und dem tatsächlichen Server samt Werkzeugnamen.
 *
 * Der Katalog enthält AUSSCHLIESSLICH ausdrücklich freigegebene Werkzeuge
 * aktiver Server. Was nicht freigegeben ist, kann das Modell nicht anfordern,
 * weil es davon nichts weiß.
 */

/** Trennzeichen im flachen Namen. Doppelt, damit es nicht mit Werkzeugnamen kollidiert. */
const SEPARATOR = "__";

/** Ein freigegebenes Werkzeug samt Herkunft. */
export interface PermittedTool {
  serverId: number;
  serverName: string;
  toolName: string;
  /** Name, unter dem das Modell das Werkzeug sieht. */
  flatName: string;
  description: string;
  inputSchema: unknown;
}

/** Baut den flachen Namen für das Modell. */
export function flatToolName(serverName: string, toolName: string): string {
  return `${sanitize(serverName)}${SEPARATOR}${toolName}`;
}

/**
 * Nur Zeichen, die Anbieter in Werkzeugnamen akzeptieren (Buchstaben, Ziffern,
 * Binde- und Unterstrich). Umlaute und Leerzeichen in Servernamen sind erlaubt,
 * dürfen aber nicht im Werkzeugnamen landen.
 */
function sanitize(name: string): string {
  const cleaned = name
    .normalize("NFKD")
    .replace(/[^\w-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  return cleaned === "" ? "server" : cleaned;
}

/**
 * Sammelt alle freigegebenen Werkzeuge. Fragt dafür jeden aktiven Server nach
 * seinen Werkzeugen; Server, die gerade nicht erreichbar sind, werden
 * übersprungen statt den ganzen Zug scheitern zu lassen.
 */
export async function collectPermittedTools(db: Db, runner: McpRunner): Promise<PermittedTool[]> {
  const permissions = listToolPermissions(db);
  if (permissions.length === 0) return [];

  // Nur Server anfragen, für die es überhaupt Freigaben gibt und die aktiv sind.
  const enabledIds = new Set(
    listMcpServers(db)
      .filter((server) => server.enabled)
      .map((server) => server.id),
  );
  const wanted = new Map<number, Set<string>>();
  for (const permission of permissions) {
    if (!enabledIds.has(permission.serverId)) continue;
    const set = wanted.get(permission.serverId) ?? new Set<string>();
    set.add(permission.toolName);
    wanted.set(permission.serverId, set);
  }

  const tools: PermittedTool[] = [];
  for (const [serverId, toolNames] of wanted) {
    const config = getMcpServerConfig(db, serverId);
    if (!config) continue;
    let available: Awaited<ReturnType<McpRunner["listTools"]>>;
    try {
      available = await runner.listTools(config);
    } catch {
      // Server gerade nicht erreichbar — die übrigen Werkzeuge bleiben nutzbar.
      continue;
    }
    for (const tool of available) {
      if (!toolNames.has(tool.name)) continue;
      tools.push({
        serverId,
        serverName: config.name,
        toolName: tool.name,
        flatName: flatToolName(config.name, tool.name),
        description: tool.description ?? `Werkzeug „${tool.name}" von ${config.name}`,
        inputSchema: tool.inputSchema ?? { type: "object", properties: {} },
      });
    }
  }
  return tools;
}

/** Formt den Katalog in das, was der Provider dem Modell schickt. */
export function toToolDefinitions(tools: PermittedTool[]): ToolDefinition[] {
  return tools.map((tool) => ({
    name: tool.flatName,
    description: tool.description,
    inputSchema: tool.inputSchema,
  }));
}

/** Findet das Werkzeug zu einem flachen Namen zurück. */
export function resolveTool(tools: PermittedTool[], flatName: string): PermittedTool | undefined {
  return tools.find((tool) => tool.flatName === flatName);
}

/** Lädt die Verbindungsdaten für einen Aufruf. */
export function configFor(db: Db, tool: PermittedTool): McpServerConfig | undefined {
  return getMcpServerConfig(db, tool.serverId);
}
