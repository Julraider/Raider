import type { ChatMessage, ChatRequest, ChatResponse, Session, ToolResult } from "@raider/shared";
import { getAgent } from "../db/agents";
import type { Db } from "../db/index";
import { recordToolCall } from "../db/mcp";
import { listMemory } from "../db/memory";
import { addMessage, getMessages } from "../db/repository";
import { activeAgentSkillContents } from "../db/skills";
import {
  collectPermittedTools,
  configFor,
  type PermittedTool,
  resolveTool,
  toToolDefinitions,
} from "../mcp/registry";
import type { McpRunner } from "../mcp/types";

/** Ruft ein Modell auf und liefert die Antwort im internen Format. */
export type ChatFn = (request: ChatRequest) => Promise<ChatResponse>;

/**
 * Obergrenze für Werkzeugrunden in einem Zug. Verhindert, dass sich ein Modell
 * im Kreis dreht und dabei unbegrenzt Werkzeuge aufruft (und Kosten erzeugt).
 */
const MAX_TOOL_ROUNDS = 5;

/** Optionale Übersteuerungen für einen einzelnen Zug. */
export interface TurnOptions {
  model?: string;
  maxTokens?: number;
  /**
   * MCP-Zugang. Fehlt er, läuft der Zug ohne Werkzeuge — genau wie bisher.
   * So bleiben Tests und der Telegram-Weg unverändert nutzbar.
   */
  tools?: McpRunner;
}

/**
 * Ein vollständiger Dialog-Zug für eine Sitzung: Nutzer-Nachricht speichern,
 * Kontext (Agent-Prompt + Kerngedächtnis + Skills) bauen, Modell aufrufen,
 * Antwort speichern. Eine Stelle für HTTP-Route und Telegram-Gateway, damit
 * beide Kanäle dieselbe Logik teilen.
 */
export async function runSessionTurn(
  db: Db,
  chat: ChatFn,
  session: Session,
  content: string,
  options: TurnOptions = {},
): Promise<ChatResponse> {
  // Nutzer-Nachricht sofort speichern — sie überlebt auch einen Anbieterfehler.
  addMessage(db, { sessionId: session.id, role: "user", content });

  const history: ChatMessage[] = getMessages(db, session.id).map((message) => ({
    role: message.role,
    content: message.content,
  }));

  const agent = session.agentId !== null ? getAgent(db, session.agentId) : undefined;
  const agentPrompt = agent && agent.systemPrompt.trim() !== "" ? agent.systemPrompt : undefined;
  const memory = buildMemoryContext(db);
  const skills = agent
    ? activeAgentSkillContents(db, agent.id)
        .map((skill) => `## Skill: ${skill.name}\n${skill.content}`)
        .join("\n\n") || undefined
    : undefined;
  const systemParts = [agentPrompt, memory, skills].filter((part): part is string => Boolean(part));
  const system = systemParts.length > 0 ? systemParts.join("\n\n") : undefined;
  const model = options.model ?? agent?.model ?? undefined;

  // Freigegebene Werkzeuge einsammeln. Ohne Freigaben bleibt die Liste leer und
  // der Zug verhält sich exakt wie vorher (ein Modellaufruf, keine Schleife).
  const permitted = options.tools ? await collectPermittedTools(db, options.tools) : [];
  const toolDefs = toToolDefinitions(permitted);

  const base = {
    ...(system ? { system } : {}),
    ...(model ? { model } : {}),
    ...(options.maxTokens ? { maxTokens: options.maxTokens } : {}),
    ...(toolDefs.length > 0 ? { tools: toolDefs } : {}),
  };

  // Laufender Gesprächsverlauf für diesen Zug — Werkzeugrunden hängen hier an,
  // ohne die gespeicherte Historie mit Zwischenschritten zu überfrachten.
  const conversation: ChatMessage[] = [...history];
  let response = await chat({ messages: conversation, ...base });
  let totalIn = response.usage.inputTokens;
  let totalOut = response.usage.outputTokens;

  // Werkzeugrunden: Modell fordert Werkzeuge an → ausführen → Ergebnis zurück.
  let rounds = 0;
  while (response.toolUses && response.toolUses.length > 0 && rounds < MAX_TOOL_ROUNDS) {
    rounds++;
    const runner = options.tools;
    if (!runner) break;

    conversation.push({
      role: "assistant",
      content: response.content,
      toolUses: response.toolUses,
    });

    const results: ToolResult[] = [];
    for (const use of response.toolUses) {
      results.push(await executeTool(db, runner, permitted, use.id, use.name, use.input));
    }
    conversation.push({ role: "user", content: "", toolResults: results });

    response = await chat({ messages: conversation, ...base });
    totalIn += response.usage.inputTokens;
    totalOut += response.usage.outputTokens;
  }

  // Wollte das Modell danach immer noch Werkzeuge, war die Obergrenze erreicht.
  const hitLimit = Boolean(response.toolUses && response.toolUses.length > 0);
  const answer = hitLimit
    ? `${response.content}\n\n_(Abgebrochen: Raider hat die Obergrenze von ${MAX_TOOL_ROUNDS} Werkzeugrunden für eine Antwort erreicht.)_`.trim()
    : response.content;

  addMessage(db, {
    sessionId: session.id,
    role: "assistant",
    content: answer,
    tokensIn: totalIn,
    tokensOut: totalOut,
  });
  return {
    ...response,
    content: answer,
    usage: { inputTokens: totalIn, outputTokens: totalOut },
  };
}

/**
 * Führt einen vom Modell angeforderten Werkzeugaufruf aus und protokolliert ihn.
 *
 * Sicherheitsnetz: Es wird noch einmal geprüft, ob das Werkzeug wirklich im
 * Katalog der freigegebenen Werkzeuge steht. Ein Modell, das sich einen Namen
 * ausdenkt, bekommt eine Fehlermeldung statt einer Ausführung.
 */
async function executeTool(
  db: Db,
  runner: McpRunner,
  permitted: PermittedTool[],
  useId: string,
  flatName: string,
  input: Record<string, unknown>,
): Promise<ToolResult> {
  const tool = resolveTool(permitted, flatName);
  if (!tool) {
    return {
      toolUseId: useId,
      content: `Das Werkzeug „${flatName}" ist nicht freigegeben oder existiert nicht.`,
      isError: true,
    };
  }

  const config = configFor(db, tool);
  if (!config) {
    return {
      toolUseId: useId,
      content: `Der Server zu „${flatName}" ist nicht mehr eingerichtet.`,
      isError: true,
    };
  }

  try {
    const result = await runner.callTool(config, tool.toolName, input);
    recordToolCall(db, {
      serverId: tool.serverId,
      toolName: tool.toolName,
      arguments: input,
      result: result.content,
      isError: result.isError,
      approvedBy: "Dauerfreigabe",
    });
    return { toolUseId: useId, content: result.content, isError: result.isError };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unbekannter Fehler";
    recordToolCall(db, {
      serverId: tool.serverId,
      toolName: tool.toolName,
      arguments: input,
      result: message,
      isError: true,
      approvedBy: "Dauerfreigabe",
    });
    return { toolUseId: useId, content: `Werkzeugfehler: ${message}`, isError: true };
  }
}

/** Baut den Kontextblock aus dem Kerngedächtnis (oder undefined, wenn leer). */
export function buildMemoryContext(db: Db): string | undefined {
  const user = listMemory(db, "user");
  const agentNotes = listMemory(db, "agent");
  const parts: string[] = [];
  if (user.length > 0) {
    parts.push(`## Nutzerprofil\n${user.map((entry) => `- ${entry.content}`).join("\n")}`);
  }
  if (agentNotes.length > 0) {
    parts.push(`## Notizen\n${agentNotes.map((entry) => `- ${entry.content}`).join("\n")}`);
  }
  return parts.length > 0 ? parts.join("\n\n") : undefined;
}
