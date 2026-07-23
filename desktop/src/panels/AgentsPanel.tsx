import type { Agent, RaiderClient } from "@raider/shared";
import { useCallback, useEffect, useState } from "react";
import { errorText, ui } from "../ui";

/** Agenten verwalten: anlegen, bearbeiten, duplizieren, löschen. */
export function AgentsPanel({ client }: { client: RaiderClient }) {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<number | null>(null);
  const [name, setName] = useState("");
  const [prompt, setPrompt] = useState("");
  const [model, setModel] = useState("");

  const load = useCallback(async () => {
    try {
      const { agents: list } = await client.listAgents();
      setAgents(list);
      setError(null);
    } catch (err) {
      setError(errorText(err));
    }
  }, [client]);

  useEffect(() => {
    void load();
  }, [load]);

  function reset(): void {
    setEditing(null);
    setName("");
    setPrompt("");
    setModel("");
  }

  function edit(agent: Agent): void {
    setEditing(agent.id);
    setName(agent.name);
    setPrompt(agent.systemPrompt);
    setModel(agent.model ?? "");
  }

  async function save(): Promise<void> {
    if (!name.trim()) return;
    const body = {
      name: name.trim(),
      systemPrompt: prompt,
      model: model.trim() === "" ? null : model.trim(),
    };
    try {
      if (editing === null) await client.createAgent(body);
      else await client.updateAgent(editing, body);
      reset();
      await load();
    } catch (err) {
      setError(errorText(err));
    }
  }

  async function act(fn: () => Promise<unknown>): Promise<void> {
    try {
      await fn();
      await load();
    } catch (err) {
      setError(errorText(err));
    }
  }

  return (
    <div style={ui.panel}>
      <h2 style={ui.h2}>Agenten</h2>
      {error !== null && <div style={ui.error}>{error}</div>}

      {agents.length === 0 && <p style={ui.empty}>Noch keine Agenten.</p>}
      {agents.map((agent) => (
        <div key={agent.id} style={ui.card}>
          <div style={ui.spread}>
            <div>
              <strong>{agent.name}</strong>{" "}
              {agent.model && <span style={ui.badge}>{agent.model}</span>}
              {agent.systemPrompt && <div style={ui.muted}>{agent.systemPrompt}</div>}
            </div>
            <div style={ui.row}>
              <button type="button" style={ui.buttonLight} onClick={() => edit(agent)}>
                Bearbeiten
              </button>
              <button
                type="button"
                style={ui.buttonLight}
                onClick={() => void act(() => client.duplicateAgent(agent.id))}
              >
                Duplizieren
              </button>
              <button
                type="button"
                style={ui.buttonDanger}
                onClick={() => void act(() => client.deleteAgent(agent.id))}
              >
                Löschen
              </button>
            </div>
          </div>
        </div>
      ))}

      <div style={{ ...ui.card, marginTop: "1rem" }}>
        <strong>{editing === null ? "Neuer Agent" : `Agent #${editing} bearbeiten`}</strong>
        <div style={{ ...ui.row, marginTop: "0.5rem", flexWrap: "wrap" }}>
          <input
            style={{ ...ui.input, minWidth: 160 }}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Name"
            aria-label="Name"
          />
          <input
            style={{ ...ui.input, minWidth: 160 }}
            value={model}
            onChange={(e) => setModel(e.target.value)}
            placeholder="Modell (leer = Standard)"
            aria-label="Modell"
          />
        </div>
        <textarea
          style={{ ...ui.input, marginTop: "0.5rem", minHeight: 70, resize: "vertical" }}
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder="Systemprompt (wie soll der Agent sich verhalten?)"
          aria-label="Systemprompt"
        />
        <div style={{ ...ui.row, marginTop: "0.5rem" }}>
          <button type="button" style={ui.button} onClick={() => void save()}>
            {editing === null ? "Anlegen" : "Speichern"}
          </button>
          {editing !== null && (
            <button type="button" style={ui.buttonLight} onClick={reset}>
              Abbrechen
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
