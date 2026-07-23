import type { RaiderClient, ScheduledTask, ScheduleKind } from "@raider/shared";
import { useCallback, useEffect, useState } from "react";
import { errorText, ui } from "../ui";

const KINDS: ScheduleKind[] = ["interval", "daily", "once"];
const HINT: Record<ScheduleKind, string> = {
  interval: "Sekunden, z. B. 3600",
  daily: "HH:MM, z. B. 07:00",
  once: "ISO-Zeit, z. B. 2026-07-24T09:00:00Z",
};

/** Geplante Aufgaben: anlegen, an-/abschalten, jetzt ausführen, löschen. */
export function TasksPanel({ client }: { client: RaiderClient }) {
  const [tasks, setTasks] = useState<ScheduledTask[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [kind, setKind] = useState<ScheduleKind>("daily");
  const [value, setValue] = useState("");
  const [prompt, setPrompt] = useState("");

  const load = useCallback(async () => {
    try {
      const { tasks: list } = await client.listScheduledTasks();
      setTasks(list);
      setError(null);
    } catch (err) {
      setError(errorText(err));
    }
  }, [client]);

  useEffect(() => {
    void load();
  }, [load]);

  async function create(): Promise<void> {
    if (!name.trim() || !value.trim() || !prompt.trim()) return;
    try {
      await client.createScheduledTask({
        name: name.trim(),
        scheduleKind: kind,
        scheduleValue: value.trim(),
        prompt: prompt.trim(),
      });
      setName("");
      setValue("");
      setPrompt("");
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
      <h2 style={ui.h2}>Aufgaben</h2>
      {error !== null && <div style={ui.error}>{error}</div>}

      {tasks.length === 0 && <p style={ui.empty}>Keine geplanten Aufgaben.</p>}
      {tasks.map((task) => (
        <div key={task.id} style={ui.card}>
          <div style={ui.spread}>
            <div>
              <strong>{task.name}</strong>{" "}
              <span style={ui.badge}>
                {task.scheduleKind}={task.scheduleValue}
              </span>
              <div style={ui.muted}>
                {task.enabled ? "aktiv" : "aus"} · nächster Lauf: {task.nextRunAt}
              </div>
            </div>
            <div style={ui.row}>
              <button
                type="button"
                style={ui.buttonLight}
                onClick={() => void act(() => client.runScheduledTask(task.id))}
              >
                Jetzt
              </button>
              <button
                type="button"
                style={ui.buttonLight}
                onClick={() =>
                  void act(() => client.updateScheduledTask(task.id, { enabled: !task.enabled }))
                }
              >
                {task.enabled ? "Aus" : "An"}
              </button>
              <button
                type="button"
                style={ui.buttonDanger}
                onClick={() => void act(() => client.deleteScheduledTask(task.id))}
              >
                Löschen
              </button>
            </div>
          </div>
        </div>
      ))}

      <div style={{ ...ui.card, marginTop: "1rem" }}>
        <strong>Neue Aufgabe</strong>
        <div style={{ ...ui.row, marginTop: "0.5rem", flexWrap: "wrap" }}>
          <input
            style={{ ...ui.input, minWidth: 140 }}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Name"
            aria-label="Name"
          />
          <select
            style={ui.select}
            value={kind}
            onChange={(e) => setKind(e.target.value as ScheduleKind)}
            aria-label="Zeitplan-Art"
          >
            {KINDS.map((k) => (
              <option key={k} value={k}>
                {k}
              </option>
            ))}
          </select>
          <input
            style={{ ...ui.input, minWidth: 140 }}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder={HINT[kind]}
            aria-label="Zeitplan-Wert"
          />
        </div>
        <div style={{ ...ui.row, marginTop: "0.5rem" }}>
          <input
            style={ui.input}
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="Prompt an Raider…"
            aria-label="Prompt"
          />
          <button type="button" style={ui.button} onClick={() => void create()}>
            Anlegen
          </button>
        </div>
      </div>
    </div>
  );
}
