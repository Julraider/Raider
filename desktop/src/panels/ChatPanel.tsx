import type { Agent, RaiderClient, StoredMessage } from "@raider/shared";
import { type CSSProperties, type FormEvent, useEffect, useState } from "react";
import { errorText, ui } from "../ui";

/** Chat-Fenster mit Agentenwahl — die Logik steckt im Core. */
export function ChatPanel({ client }: { client: RaiderClient }) {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [agentId, setAgentId] = useState<number | null>(null);
  const [sessionId, setSessionId] = useState<number | null>(null);
  const [messages, setMessages] = useState<StoredMessage[]>([]);
  const [input, setInput] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function init(): Promise<void> {
      try {
        const list = await client.listAgents();
        if (!cancelled) setAgents(list.agents);
      } catch {
        // Agentenliste ist optional beim Start.
      }
      try {
        const session = await client.createSession({ channel: "desktop", agentId: null });
        if (!cancelled) {
          setSessionId(session.id);
          setMessages([]);
        }
      } catch {
        if (!cancelled) setError("Kein Core erreichbar. Läuft der Core?");
      }
    }
    void init();
    return () => {
      cancelled = true;
    };
  }, [client]);

  async function startSession(nextAgentId: number | null): Promise<void> {
    setError(null);
    try {
      const session = await client.createSession({ channel: "desktop", agentId: nextAgentId });
      setSessionId(session.id);
      setMessages([]);
    } catch {
      setError("Kein Core erreichbar. Läuft der Core?");
    }
  }

  function onSelectAgent(value: string): void {
    const next = value === "" ? null : Number(value);
    setAgentId(next);
    void startSession(next);
  }

  async function refresh(id: number): Promise<void> {
    const result = await client.getMessages(id);
    setMessages(result.messages);
  }

  async function onSubmit(event: FormEvent): Promise<void> {
    event.preventDefault();
    const content = input.trim();
    if (content === "" || sessionId === null || busy) return;

    setInput("");
    setError(null);
    setBusy(true);
    try {
      await client.sendMessage(sessionId, { content });
      await refresh(sessionId);
    } catch (err) {
      if (sessionId !== null) await refresh(sessionId).catch(() => undefined);
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={styles.wrap}>
      <div style={{ ...ui.spread, padding: "0.75rem 1.25rem", borderBottom: "1px solid #e5e5e5" }}>
        <span style={ui.muted}>Sitzung {sessionId ?? "—"}</span>
        <select
          style={ui.select}
          value={agentId === null ? "" : String(agentId)}
          onChange={(e) => onSelectAgent(e.target.value)}
          aria-label="Agent"
        >
          <option value="">Ohne Agent</option>
          {agents.map((agent) => (
            <option key={agent.id} value={String(agent.id)}>
              {agent.name}
            </option>
          ))}
        </select>
      </div>

      <div style={styles.messages}>
        {messages.length === 0 && <p style={ui.empty}>Noch keine Nachrichten.</p>}
        {messages.map((message) => (
          <div key={message.id} style={styles.message}>
            <div style={styles.role}>{message.role === "user" ? "Du" : "Raider"}</div>
            <div style={{ whiteSpace: "pre-wrap" }}>{message.content}</div>
          </div>
        ))}
      </div>

      {error !== null && <div style={{ ...ui.error, margin: "0 1.25rem 0.6rem" }}>{error}</div>}

      <form onSubmit={onSubmit} style={styles.form}>
        <input
          style={ui.input}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Nachricht…"
          disabled={sessionId === null}
          aria-label="Nachricht"
        />
        <button type="submit" style={ui.button} disabled={sessionId === null || busy}>
          {busy ? "…" : "Senden"}
        </button>
      </form>
    </div>
  );
}

const styles: Record<string, CSSProperties> = {
  wrap: { display: "flex", flexDirection: "column", height: "100%" },
  messages: {
    flex: 1,
    overflowY: "auto",
    padding: "1rem 1.25rem",
    display: "flex",
    flexDirection: "column",
    gap: "0.75rem",
  },
  message: { maxWidth: "80%" },
  role: { fontSize: "0.75rem", color: "#888", marginBottom: "0.15rem" },
  form: {
    display: "flex",
    gap: "0.5rem",
    padding: "0.75rem 1.25rem",
    borderTop: "1px solid #e5e5e5",
  },
};
