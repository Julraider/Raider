import type { ChatMessage, ChatRequest, ChatResponse, Session } from "@raider/shared";
import { getAgent } from "../db/agents";
import type { Db } from "../db/index";
import { listMemory } from "../db/memory";
import { addMessage, getMessages } from "../db/repository";
import { activeAgentSkillContents } from "../db/skills";

/** Ruft ein Modell auf und liefert die Antwort im internen Format. */
export type ChatFn = (request: ChatRequest) => Promise<ChatResponse>;

/** Optionale Übersteuerungen für einen einzelnen Zug. */
export interface TurnOptions {
  model?: string;
  maxTokens?: number;
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

  const response = await chat({
    messages: history,
    ...(system ? { system } : {}),
    ...(model ? { model } : {}),
    ...(options.maxTokens ? { maxTokens: options.maxTokens } : {}),
  });

  addMessage(db, {
    sessionId: session.id,
    role: "assistant",
    content: response.content,
    tokensIn: response.usage.inputTokens,
    tokensOut: response.usage.outputTokens,
  });
  return response;
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
