import type { Agent, RaiderClient, StoredMessage } from "@raider/shared";
import { type CSSProperties, type FormEvent, useEffect, useState } from "react";
import { Icon } from "../icons";
import { errorText, ui } from "../ui";

/** Chat mit Agentenwahl und Sprechblasen — die Logik steckt im Core. */
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
      <header style={styles.header}>
        <div>
          <div style={styles.title}>Chat</div>
          <div style={ui.brandSub}>
            {sessionId ? `Sitzung ${sessionId} · ${messages.length} Nachrichten` : "Verbinde…"}
          </div>
        </div>
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
      </header>

      <div style={styles.messages}>
        {messages.length === 0 && (
          <p style={ui.empty}>Noch keine Nachrichten. Schreib unten los.</p>
        )}
        {messages.map((message) => {
          const mine = message.role === "user";
          return (
            <div
              key={message.id}
              style={{ ...styles.line, alignItems: mine ? "flex-end" : "flex-start" }}
            >
              <div style={styles.role}>{mine ? "Du" : "Raider"}</div>
              <div style={mine ? styles.bubbleMine : styles.bubbleOther}>{message.content}</div>
            </div>
          );
        })}
      </div>

      {error !== null && <div style={{ ...ui.error, margin: "0 1.5rem 0.6rem" }}>{error}</div>}

      <form onSubmit={onSubmit} style={styles.form}>
        <input
          style={ui.input}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Nachricht…"
          disabled={sessionId === null}
          aria-label="Nachricht"
        />
        <button
          type="submit"
          style={{ ...ui.button, ...styles.send }}
          disabled={sessionId === null || busy}
        >
          <Icon name="send" size={16} />
          {busy ? "…" : "Senden"}
        </button>
      </form>
      <div style={styles.hint}>Läuft lokal · nichts verlässt deinen Rechner</div>
    </div>
  );
}

const styles: Record<string, CSSProperties> = {
  wrap: { display: "flex", flexDirection: "column", height: "100%" },
  header: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: "1rem 1.5rem",
    borderBottom: "1px solid var(--border)",
  },
  title: { fontWeight: 700, fontSize: "1.15rem", color: "var(--text-strong)" },
  messages: {
    flex: 1,
    overflowY: "auto",
    padding: "1.25rem 1.5rem",
    display: "flex",
    flexDirection: "column",
    gap: "1rem",
  },
  line: { display: "flex", flexDirection: "column", gap: "0.25rem" },
  role: { fontSize: "0.72rem", color: "var(--muted)", fontWeight: 600 },
  bubbleMine: {
    maxWidth: "72%",
    padding: "0.7rem 1rem",
    borderRadius: "16px 16px 4px 16px",
    background: "var(--accent)",
    color: "var(--accent-contrast)",
    whiteSpace: "pre-wrap",
    lineHeight: 1.5,
  },
  bubbleOther: {
    maxWidth: "72%",
    padding: "0.7rem 1rem",
    borderRadius: "16px 16px 16px 4px",
    background: "var(--card)",
    border: "1px solid var(--border)",
    color: "var(--text)",
    whiteSpace: "pre-wrap",
    lineHeight: 1.5,
    boxShadow: "var(--shadow)",
  },
  form: {
    display: "flex",
    gap: "0.6rem",
    padding: "0.75rem 1.5rem 0.4rem",
    borderTop: "1px solid var(--border)",
  },
  send: { display: "inline-flex", alignItems: "center", gap: "0.4rem" },
  hint: { padding: "0 1.5rem 0.9rem", fontSize: "0.75rem", color: "var(--muted)" },
};
