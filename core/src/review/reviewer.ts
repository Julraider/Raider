import type { CreatePendingWriteRequest, MemoryStore, ReviewSummary } from "@raider/shared";
import type { ChatFn } from "../chat/turn";
import { isStopped } from "../db/emergency";
import type { Db } from "../db/index";
import { listMemory } from "../db/memory";
import { createPendingWrite, listPendingWrites } from "../db/pending";
import { getMessages, listSessions } from "../db/repository";
import { recordReviewRun } from "../db/review";
import { listSkills } from "../db/skills";

/** Wie viel Kontext der Review höchstens ansieht. */
const MAX_SESSIONS = 5;
const MAX_MESSAGES_PER_SESSION = 6;
const MAX_DIGEST_CHARS = 6000;

const REVIEW_SYSTEM = `Du bist der Hintergrund-Review von Raider, einem persönlichen Assistenten.
Sieh dir die jüngste Aktivität an und schlage NUR dann Verbesserungen vor, wenn sie
klar aus der Aktivität hervorgehen. Erfinde nichts.

Antworte AUSSCHLIESSLICH mit JSON in genau dieser Form (keine Erklärung drumherum):
{
  "memory": [ { "store": "user" | "agent", "content": "kurzer Merksatz" } ],
  "skills": [ { "name": "Kurzname", "description": "wozu", "content": "Anleitung" } ]
}

- "memory.user": dauerhafte Fakten/Vorlieben über die Person.
- "memory.agent": Arbeitsnotizen, wie Raider besser helfen kann.
- "skills": nur bei klar wiederkehrenden Aufgaben. Meist leer lassen.
- Wenn nichts vorzuschlagen ist: gib leere Listen zurück.`;

interface RawProposal {
  memory?: Array<{ store?: string; content?: string }>;
  skills?: Array<{ name?: string; description?: string; content?: string }>;
}

export interface ReviewOptions {
  /** Uhr/True-Now nicht nötig; nur die Chat-Funktion und DB. */
  now?: Date;
}

/**
 * Führt einen Hintergrund-Review aus: baut einen Aktivitäts-Digest, fragt das
 * Modell nach Vorschlägen und legt diese als Posteingang-Einträge an. Es wird
 * NIE etwas direkt angewendet — alles geht über die bestehende Freigabe.
 */
export async function runReview(db: Db, chat: ChatFn): Promise<ReviewSummary> {
  const digest = buildActivityDigest(db);
  if (!digest.hasActivity) {
    recordReviewRun(db, { created: 0, skipped: 0, note: "keine Aktivität" });
    return { created: 0, skipped: 0, note: "keine Aktivität", proposals: [] };
  }

  let raw: string;
  try {
    const response = await chat({
      system: REVIEW_SYSTEM,
      messages: [{ role: "user", content: digest.text }],
    });
    raw = response.content;
  } catch (error) {
    const note = `Modell nicht erreichbar: ${error instanceof Error ? error.message : "unbekannt"}`;
    recordReviewRun(db, { created: 0, skipped: 0, note });
    return { created: 0, skipped: 0, note, proposals: [] };
  }

  const parsed = parseProposals(raw);
  const proposals: string[] = [];
  let created = 0;
  let skipped = 0;

  const existingMemory = new Set(
    [...listMemory(db, "user"), ...listMemory(db, "agent")].map((entry) =>
      normalize(entry.content),
    ),
  );
  const pendingMemory = new Set(
    listPendingWrites(db, "pending")
      .filter((write) => write.kind === "memory")
      .map((write) => normalize((write.proposal as { content: string }).content)),
  );
  const existingSkillNames = new Set(listSkills(db).map((skill) => normalize(skill.name)));

  for (const item of parsed.memory ?? []) {
    const content = (item.content ?? "").trim();
    const store = item.store === "agent" ? "agent" : "user";
    if (!content) continue;
    const key = normalize(content);
    if (existingMemory.has(key) || pendingMemory.has(key)) {
      skipped += 1;
      continue;
    }
    createPending(db, { kind: "memory", proposal: { store: store as MemoryStore, content } });
    pendingMemory.add(key);
    proposals.push(`Merken (${store}): ${content}`);
    created += 1;
  }

  for (const item of parsed.skills ?? []) {
    const name = (item.name ?? "").trim();
    const content = (item.content ?? "").trim();
    if (!name || !content) continue;
    if (existingSkillNames.has(normalize(name))) {
      skipped += 1;
      continue;
    }
    createPending(db, {
      kind: "skill",
      proposal: { name, description: (item.description ?? "").trim(), content },
    });
    existingSkillNames.add(normalize(name));
    proposals.push(`Skill: ${name}`);
    created += 1;
  }

  const note = created > 0 ? `${created} Vorschlag/Vorschläge` : "nichts vorzuschlagen";
  recordReviewRun(db, { created, skipped, note });
  return { created, skipped, note, proposals };
}

/**
 * Intervall-Runner für den Hintergrund-Review. Prüft vor jedem Lauf den
 * Not-Stopp; standardmäßig aus (Intervall 0).
 */
export interface ReviewRunner {
  tick(): Promise<ReviewSummary | { stopped: true }>;
  start(intervalMs: number): void;
  stop(): void;
}

export function createReviewRunner(db: Db, chat: ChatFn): ReviewRunner {
  let timer: ReturnType<typeof setInterval> | undefined;

  async function tick(): Promise<ReviewSummary | { stopped: true }> {
    if (isStopped(db)) return { stopped: true };
    return runReview(db, chat);
  }

  return {
    tick,
    start(intervalMs) {
      if (timer || intervalMs <= 0) return;
      timer = setInterval(() => void tick(), intervalMs);
      timer.unref?.();
    },
    stop() {
      if (timer) clearInterval(timer);
      timer = undefined;
    },
  };
}

/** Baut einen kompakten Text aus der jüngsten Aktivität. */
export function buildActivityDigest(db: Db): { text: string; hasActivity: boolean } {
  const parts: string[] = [];

  const sessions = listSessions(db).slice(0, MAX_SESSIONS);
  const conversation: string[] = [];
  for (const session of sessions) {
    const messages = getMessages(db, session.id).slice(-MAX_MESSAGES_PER_SESSION);
    if (messages.length === 0) continue;
    conversation.push(`### Sitzung ${session.id} (${session.channel})`);
    for (const message of messages) {
      conversation.push(`- ${message.role}: ${oneLine(message.content, 300)}`);
    }
  }
  if (conversation.length > 0) parts.push(`## Letzte Gespräche\n${conversation.join("\n")}`);

  const userMemory = listMemory(db, "user");
  const agentMemory = listMemory(db, "agent");
  if (userMemory.length > 0 || agentMemory.length > 0) {
    const lines = [...userMemory, ...agentMemory].map(
      (entry) => `- ${oneLine(entry.content, 200)}`,
    );
    parts.push(`## Bereits im Kerngedächtnis (nicht doppelt vorschlagen)\n${lines.join("\n")}`);
  }

  const skills = listSkills(db);
  if (skills.length > 0) {
    parts.push(`## Vorhandene Skills\n${skills.map((skill) => `- ${skill.name}`).join("\n")}`);
  }

  const hasActivity = conversation.length > 0;
  const text = parts.join("\n\n").slice(0, MAX_DIGEST_CHARS);
  return { text, hasActivity };
}

/**
 * Liest die JSON-Vorschläge aus der Modell-Antwort. Defensiv: fehlerhafte oder
 * fehlende JSON-Ausgabe ergibt leere Listen statt eines Absturzes.
 */
export function parseProposals(raw: string): RawProposal {
  const json = extractJsonObject(raw);
  if (!json) return {};
  try {
    const value = JSON.parse(json) as RawProposal;
    return {
      memory: Array.isArray(value.memory) ? value.memory : [],
      skills: Array.isArray(value.skills) ? value.skills : [],
    };
  } catch {
    return {};
  }
}

/** Schneidet das erste balancierte {…}-Objekt aus einem Text. */
function extractJsonObject(raw: string): string | null {
  const start = raw.indexOf("{");
  if (start === -1) return null;
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < raw.length; i++) {
    const ch = raw[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === "\\") escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') inString = true;
    else if (ch === "{") depth += 1;
    else if (ch === "}") {
      depth -= 1;
      if (depth === 0) return raw.slice(start, i + 1);
    }
  }
  return null;
}

function createPending(db: Db, input: CreatePendingWriteRequest): void {
  createPendingWrite(db, { ...input, origin: "auto" });
}

function normalize(text: string): string {
  return text.trim().toLowerCase().replace(/\s+/g, " ");
}

function oneLine(text: string, max: number): string {
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length > max ? `${flat.slice(0, max)}…` : flat;
}
