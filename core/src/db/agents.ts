import type { Agent } from "@raider/shared";
import type { Db } from "./index";

/** Rohe Zeilenform (snake_case) — nur modulintern. */
interface AgentRow {
  id: number;
  name: string;
  icon: string | null;
  system_prompt: string;
  model: string | null;
  fallback_model: string | null;
  created_at: string;
  updated_at: string;
}

export interface NewAgent {
  name: string;
  icon?: string | null;
  systemPrompt?: string;
  model?: string | null;
  fallbackModel?: string | null;
}

export interface AgentPatch {
  name?: string;
  icon?: string | null;
  systemPrompt?: string;
  model?: string | null;
  fallbackModel?: string | null;
}

export function createAgent(db: Db, input: NewAgent): Agent {
  const info = db
    .prepare(
      "INSERT INTO agents (name, icon, system_prompt, model, fallback_model) VALUES (?, ?, ?, ?, ?)",
    )
    .run(
      input.name,
      input.icon ?? null,
      input.systemPrompt ?? "",
      input.model ?? null,
      input.fallbackModel ?? null,
    );
  const agent = getAgent(db, Number(info.lastInsertRowid));
  if (!agent) throw new Error("Agent konnte nicht angelegt werden.");
  return agent;
}

export function getAgent(db: Db, id: number): Agent | undefined {
  const row = db.prepare("SELECT * FROM agents WHERE id = ?").get(id) as AgentRow | undefined;
  return row ? toAgent(row) : undefined;
}

export function listAgents(db: Db): Agent[] {
  const rows = db.prepare("SELECT * FROM agents ORDER BY name, id").all() as AgentRow[];
  return rows.map(toAgent);
}

/** Ändert nur die angegebenen Felder; gibt den neuen Stand zurück. */
export function updateAgent(db: Db, id: number, patch: AgentPatch): Agent | undefined {
  const current = getAgent(db, id);
  if (!current) return undefined;

  const next: Agent = {
    ...current,
    name: patch.name ?? current.name,
    icon: patch.icon !== undefined ? patch.icon : current.icon,
    systemPrompt: patch.systemPrompt ?? current.systemPrompt,
    model: patch.model !== undefined ? patch.model : current.model,
    fallbackModel: patch.fallbackModel !== undefined ? patch.fallbackModel : current.fallbackModel,
  };

  db.prepare(
    `UPDATE agents
     SET name = ?, icon = ?, system_prompt = ?, model = ?, fallback_model = ?,
         updated_at = datetime('now')
     WHERE id = ?`,
  ).run(next.name, next.icon, next.systemPrompt, next.model, next.fallbackModel, id);

  return getAgent(db, id);
}

export function deleteAgent(db: Db, id: number): boolean {
  const info = db.prepare("DELETE FROM agents WHERE id = ?").run(id);
  return info.changes > 0;
}

/** Legt eine Kopie eines Agenten an ("… (Kopie)"). */
export function duplicateAgent(db: Db, id: number): Agent | undefined {
  const source = getAgent(db, id);
  if (!source) return undefined;
  return createAgent(db, {
    name: `${source.name} (Kopie)`,
    icon: source.icon,
    systemPrompt: source.systemPrompt,
    model: source.model,
    fallbackModel: source.fallbackModel,
  });
}

function toAgent(row: AgentRow): Agent {
  return {
    id: row.id,
    name: row.name,
    icon: row.icon,
    systemPrompt: row.system_prompt,
    model: row.model,
    fallbackModel: row.fallback_model,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
