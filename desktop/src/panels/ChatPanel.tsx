import type { Agent, RaiderClient, Session, StoredMessage } from "@raider/shared";
import {
  type CSSProperties,
  type KeyboardEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { Icon } from "../icons";
import { Markdown } from "../Markdown";
import { errorText, ui } from "../ui";

const EXAMPLES = [
  "Fasse mir meine offenen Aufgaben zusammen.",
  "Schreib eine freundliche Absage auf Deutsch.",
  "Erklär mir kurz, was ein Vektor-Index ist.",
  "Plane meine Woche in drei Blöcke.",
];

/** Uhrzeit (HH:MM) aus einem ISO-Zeitstempel. */
function clock(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? ""
    : d.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" });
}

/** Titel einer Sitzung für die Verlaufsliste. */
function sessionLabel(session: Session): string {
  if (session.title && session.title.trim() !== "") return session.title;
  return `Chat ${session.id}`;
}

/**
 * Chat mit Verlaufsliste, echtem Editor, Markdown-Antworten und
 * Nachrichten-Aktionen. Die gesamte Logik (Agent, Verlauf, Modelle) liegt im
 * Core; dieser Bereich zeigt sie nur an.
 */
export function ChatPanel({ client }: { client: RaiderClient }) {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [agentId, setAgentId] = useState<number | null>(null);
  const [sessionId, setSessionId] = useState<number | null>(null);
  const [messages, setMessages] = useState<StoredMessage[]>([]);
  const [input, setInput] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [copiedId, setCopiedId] = useState<number | null>(null);

  const scrollRef = useRef<HTMLDivElement>(null);
  const composerRef = useRef<HTMLTextAreaElement>(null);

  const loadSessions = useCallback(async (): Promise<Session[]> => {
    const result = await client.listSessions();
    const desktop = result.sessions.filter((s) => s.channel === "desktop");
    setSessions(desktop);
    return desktop;
  }, [client]);

  const openSession = useCallback(
    async (session: Session): Promise<void> => {
      setError(null);
      setSessionId(session.id);
      setAgentId(session.agentId);
      try {
        const result = await client.getMessages(session.id);
        setMessages(result.messages);
      } catch {
        setMessages([]);
        setError("Kein Core erreichbar. Läuft der Core?");
      }
    },
    [client],
  );

  // Erststart: Agenten + Verlauf laden, jüngste Sitzung öffnen oder neue anlegen.
  useEffect(() => {
    let cancelled = false;
    async function init(): Promise<void> {
      try {
        const list = await client.listAgents();
        if (!cancelled) setAgents(list.agents);
      } catch {
        // Agentenliste ist optional.
      }
      try {
        const existing = await loadSessions();
        if (cancelled) return;
        const first = existing[0];
        if (first) {
          await openSession(first);
        } else {
          const session = await client.createSession({ channel: "desktop", agentId: null });
          if (cancelled) return;
          setSessions([session]);
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
  }, [client, loadSessions, openSession]);

  // Nach neuen Nachrichten nach unten scrollen.
  useEffect(() => {
    if (messages.length === 0) return;
    const box = scrollRef.current;
    box?.scrollTo({ top: box.scrollHeight });
  }, [messages]);

  /** Neuer Chat mit dem aktuell gewählten Agenten — löscht nichts, der alte Chat bleibt im Verlauf. */
  async function newChat(): Promise<void> {
    setError(null);
    try {
      const session = await client.createSession({ channel: "desktop", agentId });
      setSessions((prev) => [session, ...prev]);
      setSessionId(session.id);
      setMessages([]);
      composerRef.current?.focus();
    } catch {
      setError("Kein Core erreichbar. Läuft der Core?");
    }
  }

  async function refresh(id: number): Promise<void> {
    const result = await client.getMessages(id);
    setMessages(result.messages);
  }

  async function send(text: string): Promise<void> {
    const content = text.trim();
    if (content === "" || sessionId === null || busy) return;
    setInput("");
    setError(null);
    setBusy(true);
    try {
      await client.sendMessage(sessionId, { content });
      await refresh(sessionId);
      await loadSessions().catch(() => undefined); // Titel/Reihenfolge aktualisieren.
    } catch (err) {
      await refresh(sessionId).catch(() => undefined);
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  }

  /** Antwort neu erzeugen: die vorausgehende Nutzerfrage erneut senden. */
  async function regenerate(assistant: StoredMessage): Promise<void> {
    const index = messages.findIndex((m) => m.id === assistant.id);
    for (let i = index - 1; i >= 0; i--) {
      const prior = messages[i];
      if (prior && prior.role === "user") {
        await send(prior.content);
        return;
      }
    }
  }

  async function copyMessage(message: StoredMessage): Promise<void> {
    try {
      await navigator.clipboard.writeText(message.content);
      setCopiedId(message.id);
      window.setTimeout(() => setCopiedId((c) => (c === message.id ? null : c)), 1200);
    } catch {
      // Zwischenablage nicht verfügbar.
    }
  }

  function onComposerKey(event: KeyboardEvent<HTMLTextAreaElement>): void {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      void send(input);
    } else if (event.key === "Escape") {
      setInput("");
    }
  }

  function autogrow(el: HTMLTextAreaElement | null): void {
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
  }

  const canSend = input.trim() !== "" && sessionId !== null && !busy;

  return (
    <div style={styles.wrap}>
      {/* Verlaufsleiste */}
      <aside style={styles.hist}>
        <button type="button" style={styles.newBtn} onClick={() => void newChat()}>
          <Icon name="plus" size={16} />
          Neuer Chat
        </button>
        <div style={styles.histList}>
          {sessions.length === 0 && (
            <div style={{ ...ui.muted, padding: "0.5rem 0.6rem" }}>Noch kein Verlauf.</div>
          )}
          {sessions.map((s) => (
            <button
              key={s.id}
              type="button"
              className="rd-hist-item"
              aria-current={s.id === sessionId}
              onClick={() => void openSession(s)}
              title={sessionLabel(s)}
            >
              {sessionLabel(s)}
            </button>
          ))}
        </div>
      </aside>

      {/* Gespräch */}
      <div style={styles.main}>
        <header style={styles.header}>
          <div>
            <div style={styles.title}>Chat</div>
            <div style={ui.brandSub}>
              {sessionId ? `${messages.length} Nachrichten` : "Verbinde…"}
            </div>
          </div>
          <label style={styles.agentPick}>
            <span style={ui.brandSub}>Agent für neue Chats</span>
            <select
              style={ui.select}
              value={agentId === null ? "" : String(agentId)}
              onChange={(e) => setAgentId(e.target.value === "" ? null : Number(e.target.value))}
              aria-label="Agent für neue Chats"
            >
              <option value="">Ohne Agent</option>
              {agents.map((agent) => (
                <option key={agent.id} value={String(agent.id)}>
                  {agent.name}
                </option>
              ))}
            </select>
          </label>
        </header>

        <div style={styles.messages} ref={scrollRef}>
          {messages.length === 0 && (
            <div style={styles.emptyWrap}>
              <div style={styles.emptyTitle}>Womit kann ich helfen?</div>
              <div style={{ ...ui.muted, marginBottom: "1rem" }}>
                Läuft lokal auf deinem Rechner. Schreib los oder wähl eine Anregung:
              </div>
              <div style={styles.suggestGrid}>
                {EXAMPLES.map((ex) => (
                  <button
                    key={ex}
                    type="button"
                    className="rd-suggest"
                    onClick={() => {
                      setInput(ex);
                      composerRef.current?.focus();
                    }}
                  >
                    {ex}
                  </button>
                ))}
              </div>
            </div>
          )}

          {messages.map((message) => {
            const mine = message.role === "user";
            return (
              <div key={message.id} className="rd-msg rd-rise" style={styles.msg}>
                <div style={styles.msgHead}>
                  <span style={styles.role}>{mine ? "Du" : "Raider"}</span>
                  <span style={styles.time}>{clock(message.createdAt)}</span>
                </div>
                {mine ? (
                  <div style={styles.bubbleMine}>{message.content}</div>
                ) : (
                  <div style={styles.answer}>
                    <Markdown content={message.content} />
                  </div>
                )}
                <div className="rd-msg-actions" style={styles.actions}>
                  <button
                    type="button"
                    className="rd-msg-btn"
                    onClick={() => void copyMessage(message)}
                  >
                    <Icon name={copiedId === message.id ? "check" : "copy"} size={14} />
                    {copiedId === message.id ? "Kopiert" : "Kopieren"}
                  </button>
                  {!mine && (
                    <button
                      type="button"
                      className="rd-msg-btn"
                      onClick={() => void regenerate(message)}
                      disabled={busy}
                    >
                      <Icon name="refresh" size={14} />
                      Neu erzeugen
                    </button>
                  )}
                </div>
              </div>
            );
          })}

          {busy && (
            <div style={styles.msg}>
              <div style={styles.msgHead}>
                <span style={styles.role}>Raider</span>
              </div>
              <div style={{ ...styles.answer, ...ui.muted }}>Denkt nach…</div>
            </div>
          )}
        </div>

        {error !== null && <div style={{ ...ui.error, margin: "0 1.5rem 0.6rem" }}>{error}</div>}

        <div style={styles.composerWrap}>
          <div style={styles.composerBox}>
            <textarea
              ref={composerRef}
              className="rd-composer"
              value={input}
              rows={1}
              onChange={(e) => {
                setInput(e.target.value);
                autogrow(e.target);
              }}
              onKeyDown={onComposerKey}
              placeholder="Nachricht an Raider… (Enter senden, Umschalt+Enter neue Zeile)"
              disabled={sessionId === null}
              aria-label="Nachricht"
            />
            <button
              type="button"
              style={{ ...styles.send, ...(canSend ? {} : styles.sendOff) }}
              onClick={() => (busy ? undefined : void send(input))}
              disabled={busy ? true : !canSend}
              aria-label={busy ? "Wartet auf Antwort" : "Senden"}
            >
              <Icon name={busy ? "stop" : "send"} size={16} />
            </button>
          </div>
          <div style={styles.hint}>Läuft lokal · nichts verlässt deinen Rechner</div>
        </div>
      </div>
    </div>
  );
}

const styles: Record<string, CSSProperties> = {
  wrap: { display: "flex", height: "100%", minWidth: 0 },
  hist: {
    width: 232,
    flexShrink: 0,
    borderRight: "1px solid var(--border)",
    display: "flex",
    flexDirection: "column",
    padding: "0.75rem",
    gap: "0.6rem",
    background: "var(--bg)",
  },
  newBtn: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    gap: "0.45rem",
    padding: "0.55rem 0.75rem",
    fontSize: "0.9rem",
    fontWeight: 600,
    border: "1px solid var(--border)",
    borderRadius: "var(--radius-sm)",
    background: "var(--card)",
    color: "var(--text)",
    cursor: "pointer",
  },
  histList: { flex: 1, overflowY: "auto", display: "flex", flexDirection: "column", gap: 2 },
  main: { flex: 1, minWidth: 0, display: "flex", flexDirection: "column" },
  header: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-end",
    padding: "1rem 1.5rem",
    borderBottom: "1px solid var(--border)",
  },
  title: { fontWeight: 700, fontSize: "1.15rem", color: "var(--text-strong)" },
  agentPick: { display: "flex", flexDirection: "column", gap: "0.25rem", alignItems: "flex-end" },
  messages: { flex: 1, overflowY: "auto", padding: "1.5rem" },
  emptyWrap: { maxWidth: "var(--measure)", margin: "2.5rem auto 0" },
  emptyTitle: {
    fontSize: "1.4rem",
    fontWeight: 700,
    color: "var(--text-strong)",
    marginBottom: "0.35rem",
  },
  suggestGrid: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.6rem" },
  msg: { maxWidth: "var(--measure)", margin: "0 auto 1.5rem" },
  msgHead: { display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.35rem" },
  role: { fontSize: "0.75rem", color: "var(--muted)", fontWeight: 700 },
  time: { fontSize: "0.72rem", color: "var(--muted)" },
  bubbleMine: {
    display: "inline-block",
    maxWidth: "100%",
    padding: "0.6rem 0.9rem",
    borderRadius: "4px 14px 14px 14px",
    background: "var(--accent-soft)",
    color: "var(--text-strong)",
    whiteSpace: "pre-wrap",
    lineHeight: 1.5,
  },
  answer: { color: "var(--text)" },
  actions: { display: "flex", gap: "0.25rem", marginTop: "0.4rem", marginLeft: "-0.45rem" },
  composerWrap: { padding: "0.75rem 1.5rem 1rem", borderTop: "1px solid var(--border)" },
  composerBox: {
    display: "flex",
    alignItems: "flex-end",
    gap: "0.6rem",
    maxWidth: "var(--measure)",
    margin: "0 auto",
    padding: "0.6rem 0.6rem 0.6rem 0.9rem",
    border: "1px solid var(--border)",
    borderRadius: "var(--radius)",
    background: "var(--card)",
    boxShadow: "var(--shadow)",
  },
  send: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    width: 36,
    height: 36,
    flexShrink: 0,
    border: "none",
    borderRadius: "var(--radius-sm)",
    background: "var(--accent)",
    color: "var(--accent-contrast)",
    cursor: "pointer",
  },
  sendOff: { opacity: 0.4, cursor: "default" },
  hint: {
    maxWidth: "var(--measure)",
    margin: "0.5rem auto 0",
    fontSize: "0.75rem",
    color: "var(--muted)",
    textAlign: "center",
  },
};
