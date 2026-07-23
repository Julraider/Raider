import type { RaiderClient, Skill } from "@raider/shared";
import { useCallback, useEffect, useState } from "react";
import { errorText, ui } from "../ui";

/** Skills auflisten, an-/abschalten, ansehen, löschen. */
export function SkillsPanel({ client }: { client: RaiderClient }) {
  const [skills, setSkills] = useState<Skill[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<number | null>(null);
  const [content, setContent] = useState<string>("");

  const load = useCallback(async () => {
    try {
      const { skills: list } = await client.listSkills();
      setSkills(list);
      setError(null);
    } catch (err) {
      setError(errorText(err));
    }
  }, [client]);

  useEffect(() => {
    void load();
  }, [load]);

  async function toggle(skill: Skill): Promise<void> {
    try {
      await client.updateSkill(skill.id, { active: !skill.active });
      await load();
    } catch (err) {
      setError(errorText(err));
    }
  }

  async function show(id: number): Promise<void> {
    if (open === id) {
      setOpen(null);
      return;
    }
    try {
      const skill = await client.getSkill(id);
      setContent(skill.content);
      setOpen(id);
    } catch (err) {
      setError(errorText(err));
    }
  }

  async function remove(id: number): Promise<void> {
    try {
      await client.deleteSkill(id);
      if (open === id) setOpen(null);
      await load();
    } catch (err) {
      setError(errorText(err));
    }
  }

  return (
    <div style={ui.panel}>
      <h2 style={ui.h2}>Skills</h2>
      {error !== null && <div style={ui.error}>{error}</div>}
      {skills.length === 0 && <p style={ui.empty}>Noch keine Skills.</p>}
      {skills.map((skill) => (
        <div key={skill.id} style={ui.card}>
          <div style={ui.spread}>
            <div>
              <strong>{skill.name}</strong>{" "}
              {skill.category && <span style={ui.badge}>{skill.category}</span>}{" "}
              <span style={ui.muted}>({skill.source})</span>
              {skill.description && <div style={ui.muted}>{skill.description}</div>}
            </div>
            <div style={ui.row}>
              <button type="button" style={ui.buttonLight} onClick={() => void show(skill.id)}>
                {open === skill.id ? "Zu" : "Inhalt"}
              </button>
              <button type="button" style={ui.buttonLight} onClick={() => void toggle(skill)}>
                {skill.active ? "Aus" : "An"}
              </button>
              <button type="button" style={ui.buttonDanger} onClick={() => void remove(skill.id)}>
                Löschen
              </button>
            </div>
          </div>
          {open === skill.id && <pre style={styles.pre}>{content || "(leer)"}</pre>}
        </div>
      ))}
    </div>
  );
}

const styles = {
  pre: {
    marginTop: "0.6rem",
    padding: "0.6rem",
    background: "#f5f5f5",
    borderRadius: 6,
    whiteSpace: "pre-wrap" as const,
    fontSize: "0.85rem",
  },
};
