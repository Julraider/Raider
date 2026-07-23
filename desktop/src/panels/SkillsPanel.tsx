import type { Agent, RaiderClient, Skill } from "@raider/shared";
import { useCallback, useEffect, useState } from "react";
import { errorText, ui } from "../ui";

/** Skills: anlegen, importieren, exportieren, Agenten zuweisen, an/aus, löschen. */
export function SkillsPanel({ client }: { client: RaiderClient }) {
  const [skills, setSkills] = useState<Skill[]>([]);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [open, setOpen] = useState<number | null>(null);
  const [content, setContent] = useState<string>("");

  // Anlegen / Import.
  const [newName, setNewName] = useState("");
  const [newContent, setNewContent] = useState("");
  const [markdown, setMarkdown] = useState("");

  const load = useCallback(async () => {
    try {
      const [s, a] = await Promise.all([client.listSkills(), client.listAgents()]);
      setSkills(s.skills);
      setAgents(a.agents);
      setError(null);
    } catch (err) {
      setError(errorText(err));
    }
  }, [client]);

  useEffect(() => {
    void load();
  }, [load]);

  async function act(fn: () => Promise<unknown>, message?: string): Promise<void> {
    try {
      await fn();
      if (message) setNote(message);
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

  async function create(): Promise<void> {
    if (!newName.trim()) return;
    await act(
      () => client.createSkill({ name: newName.trim(), content: newContent }),
      "Skill angelegt.",
    );
    setNewName("");
    setNewContent("");
  }

  async function doImport(): Promise<void> {
    if (!markdown.trim()) return;
    await act(() => client.importSkill({ markdown }), "Skill importiert.");
    setMarkdown("");
  }

  async function exportSkill(id: number): Promise<void> {
    try {
      const { markdown: md } = await client.exportSkill(id);
      setContent(md);
      setOpen(id);
      setNote("Exportierter Markdown wird unten angezeigt (zum Kopieren).");
    } catch (err) {
      setError(errorText(err));
    }
  }

  return (
    <div style={ui.panel}>
      <h2 style={ui.h2}>Skills</h2>
      {error !== null && <div style={ui.error}>{error}</div>}
      {note !== null && (
        <div
          style={{
            ...ui.error,
            background: "#e7f5ec",
            color: "#1a7f3c",
            border: "1px solid #bfe3ce",
          }}
        >
          {note}
        </div>
      )}
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
              <button
                type="button"
                style={ui.buttonLight}
                onClick={() => void exportSkill(skill.id)}
              >
                Export
              </button>
              <button
                type="button"
                style={ui.buttonLight}
                onClick={() =>
                  void act(() => client.updateSkill(skill.id, { active: !skill.active }))
                }
              >
                {skill.active ? "Aus" : "An"}
              </button>
              <button
                type="button"
                style={ui.buttonDanger}
                onClick={() => void act(() => client.deleteSkill(skill.id))}
              >
                Löschen
              </button>
            </div>
          </div>
          <div style={{ ...ui.row, marginTop: "0.4rem" }}>
            <span style={ui.muted}>Agenten zuweisen:</span>
            <select
              style={ui.select}
              defaultValue=""
              onChange={(e) => {
                const agentId = Number(e.target.value);
                if (Number.isInteger(agentId)) {
                  void act(() => client.assignSkill(agentId, skill.id), "Skill zugewiesen.");
                }
                e.target.value = "";
              }}
              aria-label="Agent zuweisen"
            >
              <option value="">— Agent wählen —</option>
              {agents.map((agent) => (
                <option key={agent.id} value={String(agent.id)}>
                  {agent.name}
                </option>
              ))}
            </select>
          </div>
          {open === skill.id && <pre style={styles.pre}>{content || "(leer)"}</pre>}
        </div>
      ))}

      <div style={{ ...ui.card, marginTop: "1rem" }}>
        <strong>Neuer Skill</strong>
        <input
          style={{ ...ui.input, marginTop: "0.5rem" }}
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder="Name"
          aria-label="Skill-Name"
        />
        <textarea
          style={{ ...ui.input, marginTop: "0.5rem", minHeight: 70, resize: "vertical" }}
          value={newContent}
          onChange={(e) => setNewContent(e.target.value)}
          placeholder="Inhalt (Anweisung an das Modell)"
          aria-label="Skill-Inhalt"
        />
        <div style={{ ...ui.row, marginTop: "0.5rem" }}>
          <button type="button" style={ui.button} onClick={() => void create()}>
            Anlegen
          </button>
        </div>
      </div>

      <div style={{ ...ui.card, marginTop: "1rem" }}>
        <strong>Skill importieren (Markdown)</strong>
        <textarea
          style={{
            ...ui.input,
            marginTop: "0.5rem",
            minHeight: 90,
            resize: "vertical",
            fontFamily: "monospace",
          }}
          value={markdown}
          onChange={(e) => setMarkdown(e.target.value)}
          placeholder={"---\nname: Beispiel\ndescription: …\n---\n\nInhalt…"}
          aria-label="Markdown"
        />
        <div style={{ ...ui.row, marginTop: "0.5rem" }}>
          <button type="button" style={ui.button} onClick={() => void doImport()}>
            Importieren
          </button>
        </div>
      </div>
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
    overflowX: "auto" as const,
  },
};
