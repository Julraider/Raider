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
import type { StreamChunk } from "../providers/provider";

/** Ruft ein Modell auf und liefert die Antwort im internen Format. */
export type ChatFn = (request: ChatRequest) => Promise<ChatResponse>;

/**
 * Obergrenze für Werkzeugrunden in einem Zug. Verhindert, dass sich ein Modell
 * im Kreis dreht und dabei unbegrenzt Werkzeuge aufruft (und Kosten erzeugt).
 */
const MAX_TOOL_ROUNDS = 5;

/**
 * Wie viele Zeichen Gesprächsverlauf höchstens ans Modell gehen.
 *
 * Vorher ging der KOMPLETTE Verlauf mit — bei einer langen Sitzung wächst der
 * damit unbegrenzt, bis der Anbieter die Anfrage ablehnt und gar nichts mehr
 * geht. Gezählt wird bewusst in Zeichen und nicht in Tokens: Eine echte
 * Token-Zählung bräuchte je Modell einen eigenen Zerleger, und für eine
 * Sicherheitsgrenze reicht die grobe Schätzung (rund 4 Zeichen je Token)
 * vollkommen aus. Der Wert liegt absichtlich weit unter dem, was heutige
 * Modelle können — er soll nur den Ausreißer abfangen.
 */
const DEFAULT_HISTORY_BUDGET_CHARS = 60_000;

/**
 * Kürzt den Verlauf von hinten: Die jüngsten Nachrichten sind die wichtigsten,
 * also bleiben sie. Wird gekürzt, bekommt das Modell einen kurzen Hinweis, dass
 * es den Anfang nicht sieht — sonst behauptet es womöglich, etwas sei nie
 * gesagt worden.
 */
export function trimHistory(
  messages: ChatMessage[],
  budget = DEFAULT_HISTORY_BUDGET_CHARS,
): ChatMessage[] {
  let used = 0;
  const kept: ChatMessage[] = [];
  for (let i = messages.length - 1; i >= 0; i--) {
    const message = messages[i];
    if (!message) continue;
    const size = message.content.length;
    // Die jüngste Nachricht bleibt immer, auch wenn sie allein das Budget sprengt.
    if (kept.length > 0 && used + size > budget) break;
    used += size;
    kept.unshift(message);
  }

  if (kept.length === messages.length) return kept;
  return [
    {
      role: "user",
      content:
        "[Hinweis: Der Anfang dieses Gesprächs ist zu lang geworden und wurde " +
        "weggelassen. Wenn dir Zusammenhang fehlt, frag bitte nach, statt zu raten.]",
    },
    ...kept,
  ];
}

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

/** Was ein Zug an Vorbereitung braucht: Verlauf, Anfrage-Grundlage, Werkzeuge. */
interface PreparedTurn {
  conversation: ChatMessage[];
  base: Omit<ChatRequest, "messages">;
  permitted: PermittedTool[];
}

/**
 * Speichert die Nutzer-Nachricht und baut alles zusammen, was der Modellaufruf
 * braucht: Verlauf, Systemprompt (Agent + Kerngedächtnis + Skills), Modell und
 * den Katalog der freigegebenen Werkzeuge. Von der normalen und der
 * streamenden Variante gemeinsam genutzt, damit beide Wege garantiert denselben
 * Kontext sehen.
 */
async function prepareTurn(
  db: Db,
  session: Session,
  content: string,
  options: TurnOptions,
): Promise<PreparedTurn> {
  // Nutzer-Nachricht sofort speichern — sie überlebt auch einen Anbieterfehler.
  addMessage(db, { sessionId: session.id, role: "user", content });

  const conversation: ChatMessage[] = trimHistory(
    getMessages(db, session.id).map((message) => ({
      role: message.role,
      content: message.content,
    })),
  );

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

  return {
    conversation,
    permitted,
    base: {
      ...(system ? { system } : {}),
      ...(model ? { model } : {}),
      ...(options.maxTokens ? { maxTokens: options.maxTokens } : {}),
      ...(toolDefs.length > 0 ? { tools: toolDefs } : {}),
    },
  };
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
  const { conversation, base, permitted } = await prepareTurn(db, session, content, options);
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

/* --------------------------------------------------------------------------
 * Streamender Zug: gleiche Vorbereitung, gleiche Werkzeugschleife — nur wird
 * der Text ausgegeben, während er entsteht, statt erst am Ende.
 * ----------------------------------------------------------------------- */

/** Ein Ereignis auf dem Weg zur fertigen Antwort. */
export type TurnEvent =
  | { type: "text"; text: string }
  | { type: "tool"; name: string; phase: "start" | "done"; isError?: boolean }
  | { type: "done"; response: ChatResponse };

/** Ein Anbieter, der stückweise antworten kann. */
export type ChatStreamFn = (request: ChatRequest) => AsyncIterable<StreamChunk>;

/**
 * Wie `runSessionTurn`, gibt die Antwort aber stückweise aus. Gespeichert wird
 * erst am Ende und nur einmal — bricht der Stream ab, steht keine halbe Antwort
 * in der Datenbank.
 */
export async function* runSessionTurnStreamed(
  db: Db,
  chatStream: ChatStreamFn,
  session: Session,
  content: string,
  options: TurnOptions = {},
): AsyncGenerator<TurnEvent> {
  const { conversation, base, permitted } = await prepareTurn(db, session, content, options);

  let answer = "";
  let totalIn = 0;
  let totalOut = 0;
  let last: ChatResponse | undefined;

  for (let round = 0; round <= MAX_TOOL_ROUNDS; round++) {
    let response: ChatResponse | undefined;

    for await (const chunk of chatStream({ messages: conversation, ...base })) {
      if (chunk.type === "text") {
        answer += chunk.text;
        yield { type: "text", text: chunk.text };
      } else {
        response = chunk.response;
      }
    }
    if (!response) break;

    last = response;
    totalIn += response.usage.inputTokens;
    totalOut += response.usage.outputTokens;

    const uses = response.toolUses ?? [];
    const runner = options.tools;
    if (uses.length === 0 || !runner) break;

    // Obergrenze erreicht: ehrlich abbrechen statt weiterzulaufen.
    if (round === MAX_TOOL_ROUNDS) {
      const note = `\n\n_(Abgebrochen: Raider hat die Obergrenze von ${MAX_TOOL_ROUNDS} Werkzeugrunden für eine Antwort erreicht.)_`;
      answer += note;
      yield { type: "text", text: note };
      break;
    }

    conversation.push({ role: "assistant", content: response.content, toolUses: uses });

    const results: ToolResult[] = [];
    for (const use of uses) {
      yield { type: "tool", name: use.name, phase: "start" };
      const result = await executeTool(db, runner, permitted, use.id, use.name, use.input);
      yield { type: "tool", name: use.name, phase: "done", isError: result.isError };
      results.push(result);
    }
    conversation.push({ role: "user", content: "", toolResults: results });
  }

  const final: ChatResponse = {
    role: "assistant",
    content: answer,
    model: last?.model ?? "unbekannt",
    stopReason: last?.stopReason ?? null,
    usage: { inputTokens: totalIn, outputTokens: totalOut },
  };

  addMessage(db, {
    sessionId: session.id,
    role: "assistant",
    content: answer,
    tokensIn: totalIn,
    tokensOut: totalOut,
  });

  yield { type: "done", response: final };
}
