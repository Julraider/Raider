import { type Agent, ApiError, createRaiderClient, type StoredMessage } from "@raider/shared";
import { type CSSProperties, type FormEvent, useEffect, useMemo, useState } from "react";
import { coreBaseUrl } from "./coreUrl";

/**
 * Chat-Fenster mit Agentenwahl. Bewusst „dumm": es zeigt an und ruft die
 * Core-API — Logik (Verlauf, Agent, Modell, Speicherung) steckt im Core.
 */
export function App() {
  const client = useMemo(() => createRaiderClient(coreBaseUrl()), []);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [agentId, setAgentId] = useState<number | null>(null);
  const [sessionId, setSessionId] = useState<number | null>(null);
  const [messages, setMessages] = useState<StoredMessage[]>([]);
  const [input, setInput] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Agenten laden und eine erste Sitzung starten.
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
      setError(
        err instanceof ApiError ? `Fehler (${err.status}): ${err.message}` : "Netzwerkfehler.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={styles.app}>
      <header style={styles.header}>
        <strong>Raider</strong>
        <select
          style={styles.select}
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

      <main style={styles.messages}>
        {messages.length === 0 && <p style={styles.empty}>Noch keine Nachrichten.</p>}
        {messages.map((message) => (
          <div key={message.id} style={styles.message}>
            <div style={styles.role}>{message.role === "user" ? "Du" : "Raider"}</div>
            <div>{message.content}</div>
          </div>
        ))}
      </main>

      {error !== null && <div style={styles.error}>{error}</div>}

      <form onSubmit={onSubmit} style={styles.form}>
        <input
          style={styles.input}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Nachricht…"
          disabled={sessionId === null}
          aria-label="Nachricht"
        />
        <button type="submit" style={styles.button} disabled={sessionId === null || busy}>
          {busy ? "…" : "Senden"}
        </button>
      </form>
    </div>
  );
}

const styles: Record<string, CSSProperties> = {
  app: {
    display: "flex",
    flexDirection: "column",
    height: "100vh",
    fontFamily: "system-ui, sans-serif",
    color: "#1a1a1a",
  },
  header: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: "0.75rem 1rem",
    borderBottom: "1px solid #e5e5e5",
  },
  select: {
    padding: "0.35rem 0.5rem",
    fontSize: "0.9rem",
    borderRadius: 6,
    border: "1px solid #ccc",
  },
  messages: {
    flex: 1,
    overflowY: "auto",
    padding: "1rem",
    display: "flex",
    flexDirection: "column",
    gap: "0.75rem",
  },
  empty: { color: "#999" },
  message: { maxWidth: "80%" },
  role: { fontSize: "0.75rem", color: "#888", marginBottom: "0.15rem" },
  error: { padding: "0.5rem 1rem", background: "#fdecea", color: "#b3261e", fontSize: "0.9rem" },
  form: { display: "flex", gap: "0.5rem", padding: "0.75rem 1rem", borderTop: "1px solid #e5e5e5" },
  input: {
    flex: 1,
    padding: "0.5rem 0.75rem",
    fontSize: "1rem",
    border: "1px solid #ccc",
    borderRadius: 6,
  },
  button: {
    padding: "0.5rem 1rem",
    fontSize: "1rem",
    border: "none",
    borderRadius: 6,
    background: "#1a1a1a",
    color: "white",
    cursor: "pointer",
  },
};
