import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Skill, SkillSource, SkillWithContent } from "@raider/shared";
import type { Db } from "./index";

interface SkillRow {
  id: number;
  name: string;
  description: string;
  category: string | null;
  file_path: string;
  active: number;
  source: string;
  created_at: string;
  updated_at: string;
}

export interface NewSkill {
  name: string;
  description?: string;
  category?: string | null;
  content: string;
  source?: SkillSource;
}

export interface SkillPatch {
  name?: string;
  description?: string;
  category?: string | null;
  content?: string;
  active?: boolean;
}

export function createSkill(db: Db, skillsDir: string, input: NewSkill): Skill {
  mkdirSync(skillsDir, { recursive: true });
  const info = db
    .prepare(
      "INSERT INTO skills (name, description, category, file_path, source) VALUES (?, ?, ?, ?, ?)",
    )
    .run(input.name, input.description ?? "", input.category ?? null, "", input.source ?? "manual");
  const id = Number(info.lastInsertRowid);

  const filePath = join(skillsDir, `${id}-${slugify(input.name)}.md`);
  db.prepare("UPDATE skills SET file_path = ? WHERE id = ?").run(filePath, id);
  writeFileSync(
    filePath,
    serialize(input.name, input.description ?? "", input.category ?? null, input.content),
    "utf8",
  );

  const skill = getSkill(db, id);
  if (!skill) throw new Error("Skill konnte nicht angelegt werden.");
  return skill;
}

export function getSkill(db: Db, id: number): Skill | undefined {
  const row = db.prepare("SELECT * FROM skills WHERE id = ?").get(id) as SkillRow | undefined;
  return row ? toSkill(row) : undefined;
}

export function listSkills(db: Db): Skill[] {
  const rows = db.prepare("SELECT * FROM skills ORDER BY name, id").all() as SkillRow[];
  return rows.map(toSkill);
}

export function getSkillContent(db: Db, id: number): SkillWithContent | undefined {
  const skill = getSkill(db, id);
  if (!skill) return undefined;
  const raw = existsSync(skill.filePath) ? readFileSync(skill.filePath, "utf8") : "";
  return { ...skill, content: parse(raw).body };
}

/** Exportiert den vollständigen Markdown (Frontmatter + Inhalt). */
export function exportSkill(db: Db, id: number): string | undefined {
  const skill = getSkill(db, id);
  if (!skill) return undefined;
  if (existsSync(skill.filePath)) return readFileSync(skill.filePath, "utf8");
  return serialize(skill.name, skill.description, skill.category, "");
}

export function updateSkill(db: Db, id: number, patch: SkillPatch): Skill | undefined {
  const current = getSkillContent(db, id);
  if (!current) return undefined;

  const name = patch.name ?? current.name;
  const description = patch.description ?? current.description;
  const category = patch.category !== undefined ? patch.category : current.category;
  const content = patch.content ?? current.content;
  const active = patch.active ?? current.active;

  writeFileSync(current.filePath, serialize(name, description, category, content), "utf8");
  db.prepare(
    "UPDATE skills SET name = ?, description = ?, category = ?, active = ?, updated_at = datetime('now') WHERE id = ?",
  ).run(name, description, category, active ? 1 : 0, id);
  return getSkill(db, id);
}

export function deleteSkill(db: Db, id: number): boolean {
  const skill = getSkill(db, id);
  if (!skill) return false;
  if (existsSync(skill.filePath)) rmSync(skill.filePath);
  return db.prepare("DELETE FROM skills WHERE id = ?").run(id).changes > 0;
}

export function importSkill(db: Db, skillsDir: string, markdown: string): Skill {
  const parsed = parse(markdown);
  return createSkill(db, skillsDir, {
    name: parsed.name || "Unbenannter Skill",
    description: parsed.description,
    category: parsed.category,
    content: parsed.body,
  });
}

export function assignSkill(db: Db, agentId: number, skillId: number): void {
  db.prepare("INSERT OR IGNORE INTO agent_skills (agent_id, skill_id) VALUES (?, ?)").run(
    agentId,
    skillId,
  );
}

export function unassignSkill(db: Db, agentId: number, skillId: number): boolean {
  return (
    db.prepare("DELETE FROM agent_skills WHERE agent_id = ? AND skill_id = ?").run(agentId, skillId)
      .changes > 0
  );
}

export function listAgentSkills(db: Db, agentId: number): Skill[] {
  const rows = db
    .prepare(
      "SELECT s.* FROM skills s JOIN agent_skills a ON a.skill_id = s.id WHERE a.agent_id = ? ORDER BY s.name",
    )
    .all(agentId) as SkillRow[];
  return rows.map(toSkill);
}

/** Inhalt der aktiven, dem Agenten zugewiesenen Skills — für den Kontext. */
export function activeAgentSkillContents(
  db: Db,
  agentId: number,
): Array<{ name: string; content: string }> {
  return listAgentSkills(db, agentId)
    .filter((skill) => skill.active)
    .map((skill) => ({ name: skill.name, content: getSkillContent(db, skill.id)?.content ?? "" }));
}

function toSkill(row: SkillRow): Skill {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    category: row.category,
    filePath: row.file_path,
    active: row.active === 1,
    source: row.source as SkillSource,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/** Baut eine SKILL.md mit einfachem Frontmatter. */
function serialize(
  name: string,
  description: string,
  category: string | null,
  body: string,
): string {
  const lines = ["---", `name: ${name}`, `description: ${description}`];
  if (category) lines.push(`category: ${category}`);
  lines.push("---", "");
  return `${lines.join("\n")}\n${body.trim()}\n`;
}

interface ParsedSkill {
  name: string;
  description: string;
  category: string | null;
  body: string;
}

/** Liest Frontmatter + Inhalt aus einer SKILL.md. */
function parse(markdown: string): ParsedSkill {
  const match = markdown.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!match) {
    return { name: "", description: "", category: null, body: markdown.trim() };
  }
  const meta: Record<string, string> = {};
  for (const line of (match[1] ?? "").split("\n")) {
    const colon = line.indexOf(":");
    if (colon === -1) continue;
    meta[line.slice(0, colon).trim()] = line.slice(colon + 1).trim();
  }
  return {
    name: meta.name ?? "",
    description: meta.description ?? "",
    category: meta.category ?? null,
    body: (match[2] ?? "").trim(),
  };
}

function slugify(name: string): string {
  return (
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 40) || "skill"
  );
}
