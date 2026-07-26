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
import { IconButton, Input } from "../kit";
import { Markdown } from "../Markdown";
import { useToast } from "../Toast";
import { errorText, ui } from "../ui";

/** Nutzersichtbare Meldung, wenn der Hintergrunddienst nicht antwortet. */
const OFFLINE_MESSAGE =
  "Raider konnte sich nicht mit seinem Hintergrundprogramm verbinden. Starte Raider einmal neu — hilft das nicht, notiere dir diese Meldung.";

/** Merkt, ob die Verlaufsliste eingeklappt ist, über Fenster-Neustarts hinweg. */
const HIST_COLLAPSED_KEY = "raider.chat.histCollapsed";

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

/**
 * Macht aus dem technischen Werkzeugnamen (`Server__werkzeug`) etwas Lesbares.
 */
function toolLabel(flatName: string): string {
  const [server, tool] = flatName.split("__");
  return tool ? `${tool} (${server})` : flatName;
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
  /** Text der Antwort, während sie noch entsteht. */
  const [live, setLive] = useState("");
  /** Kurzer Hinweis, welches Werkzeug Raider gerade benutzt. */
  const [toolNote, setToolNote] = useState<string | null>(null);
  /** Welches Gespräch gerade auf die Löschbestätigung wartet. */
  const [confirmId, setConfirmId] = useState<number | null>(null);
  /** Sitzung, deren Titel gerade bearbeitet wird (Eingabefeld an Ort und Stelle). */
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editValue, setEditValue] = useState("");
  /** Verlaufsliste eingeklappt — bei schmalem Fenster Platz für den Chat schaffen. */
  const [histCollapsed, setHistCollapsed] = useState(
    () => window.localStorage.getItem(HIST_COLLAPSED_KEY) === "1",
  );

  const toast = useToast();
  const scrollRef = useRef<HTMLDivElement>(null);
  const composerRef = useRef<HTMLTextAreaElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  const loadSessions = useCallback(async (): Promise<Session[]> => {
    const result = await client.listSessions();
    const desktop = result.sessions.filter((s) => s.channel === "desktop");
    setSessions(desktop);
    return desktop;
  }, [client]);

  const openSession = useCallback(
    async (session: Session): Promise<void> => {
      setError(null);
      setEditingId(null); // laufende Umbenennung nicht über Sitzungen hinweg mitschleppen
      setSessionId(session.id);
      setAgentId(session.agentId);
      try {
        const result = await client.getMessages(session.id);
        setMessages(result.messages);
      } catch {
        setMessages([]);
        setError(OFFLINE_MESSAGE);
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
        if (!cancelled) setError(OFFLINE_MESSAGE);
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

  // Während geschrieben wird, mitscrollen.
  useEffect(() => {
    if (live === "") return;
    const box = scrollRef.current;
    box?.scrollTo({ top: box.scrollHeight });
  }, [live]);

  /** Neuer Chat mit dem aktuell gewählten Agenten — löscht nichts, der alte Chat bleibt im Verlauf. */
  async function newChat(): Promise<void> {
    setError(null);
    setEditingId(null);
    try {
      const session = await client.createSession({ channel: "desktop", agentId });
      setSessions((prev) => [session, ...prev]);
      setSessionId(session.id);
      setMessages([]);
      composerRef.current?.focus();
    } catch {
      setError(OFFLINE_MESSAGE);
    }
  }

  async function refresh(id: number): Promise<void> {
    const result = await client.getMessages(id);
    setMessages(result.messages);
  }

  /** Öffnet das Eingabefeld zum Umbenennen einer Sitzung an Ort und Stelle. */
  function startRename(session: Session): void {
    setEditingId(session.id);
    setEditValue(session.title ?? "");
  }

  /** Speichert den neuen Titel. Leerer Text lässt den Core einen Ersatznamen vergeben. */
  async function saveTitle(session: Session): Promise<void> {
    const title = editValue.trim();
    setEditingId(null);
    try {
      const updated = await client.renameSession(session.id, title);
      setSessions((prev) => prev.map((s) => (s.id === updated.id ? updated : s)));
      toast.show("Umbenannt.");
    } catch {
      toast.showError("Umbenennen hat nicht geklappt.");
    }
  }

  /**
   * Löscht eine Sitzung endgültig. War sie gerade geöffnet, wird eine andere
   * Sitzung geöffnet oder — falls keine mehr übrig ist — ein neuer Chat
   * angelegt, damit die Ansicht nie leer stehen bleibt.
   */
  async function removeSession(session: Session): Promise<void> {
    try {
      await client.deleteSession(session.id);
    } catch {
      toast.showError("Löschen hat nicht geklappt.");
      return;
    }
    const remaining = sessions.filter((s) => s.id !== session.id);
    setSessions(remaining);
    if (editingId === session.id) setEditingId(null);
    toast.show("Gespräch gelöscht.");

    if (sessionId !== session.id) return; // war nicht offen, Ansicht bleibt wie sie ist

    const next = remaining[0];
    if (next) {
      await openSession(next);
      return;
    }
    try {
      const created = await client.createSession({ channel: "desktop", agentId });
      setSessions([created]);
      setSessionId(created.id);
      setMessages([]);
    } catch {
      setError(OFFLINE_MESSAGE);
    }
  }

  /** Ein-/Ausklappen der Verlaufsliste merken, damit die Wahl über Neustarts hinweg bleibt. */
  function toggleHistCollapsed(): void {
    setHistCollapsed((prev) => {
      const next = !prev;
      window.localStorage.setItem(HIST_COLLAPSED_KEY, next ? "1" : "0");
      return next;
    });
  }

  /**
   * Sendet eine Nachricht und zeigt die Antwort, während sie entsteht.
   *
   * Der Core streamt; kann er das nicht (Anbieter ohne Streaming, Statuscode
   * 501), fällt diese Funktion still auf die normale Antwort am Stück zurück —
   * der Nutzer merkt davon nichts außer der längeren Wartezeit.
   */
  async function send(text: string): Promise<void> {
    const content = text.trim();
    if (content === "" || sessionId === null || busy) return;
    const id = sessionId;

    setInput("");
    setError(null);
    setBusy(true);
    setLive("");
    setToolNote(null);

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      let streamed = false;
      for await (const event of client.streamMessage(id, { content }, controller.signal)) {
        streamed = true;
        if (event.type === "text") {
          setLive((current) => current + event.text);
        } else if (event.type === "tool") {
          setToolNote(
            event.phase === "start"
              ? `Benutzt gerade „${toolLabel(event.name)}“…`
              : event.isError
                ? `„${toolLabel(event.name)}“ hat einen Fehler gemeldet.`
                : null,
          );
        } else if (event.type === "error") {
          setError(event.message);
        }
      }
      if (!streamed) throw new Error("Kein Datenstrom erhalten.");
    } catch (err) {
      // Abbruch durch den Nutzer ist kein Fehler.
      if (!controller.signal.aborted) {
        const status = (err as { status?: number } | undefined)?.status;
        if (status === 501) {
          // Anbieter kann nicht streamen — normaler Weg.
          try {
            await client.sendMessage(id, { content });
          } catch (fallbackError) {
            setError(errorText(fallbackError));
          }
        } else {
          setError(errorText(err));
        }
      }
    } finally {
      abortRef.current = null;
      setLive("");
      setToolNote(null);
      setBusy(false);
      await refresh(id).catch(() => undefined);
      await loadSessions().catch(() => undefined); // Titel/Reihenfolge aktualisieren.
    }
  }

  /** Bricht die laufende Antwort ab. Das bereits Geschriebene bleibt gespeichert. */
  function stop(): void {
    abortRef.current?.abort();
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
      // Läuft gerade eine Antwort, ist Esc der schnellste Weg zum Abbruch.
      if (busy) stop();
      else setInput("");
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
      {/* Verlaufsleiste — bei schmalem Fenster einklappbar, damit mehr Platz für den Chat bleibt. */}
      <aside style={histCollapsed ? styles.histNarrow : styles.hist}>
        <div style={styles.histTopRow}>
          {!histCollapsed && (
            <button
              type="button"
              style={{ ...styles.newBtn, flex: 1 }}
              onClick={() => void newChat()}
            >
              <Icon name="plus" size={16} />
              Neuer Chat
            </button>
          )}
          <IconButton
            icon="chevron"
            label={histCollapsed ? "Verlauf einblenden" : "Verlauf ausblenden"}
            onClick={toggleHistCollapsed}
            style={{ transform: histCollapsed ? "rotate(-90deg)" : "rotate(90deg)" }}
          />
        </div>
        {histCollapsed ? (
          <button
            type="button"
            aria-label="Neuer Chat"
            title="Neuer Chat"
            style={styles.newBtnNarrow}
            onClick={() => void newChat()}
          >
            <Icon name="plus" size={16} />
          </button>
        ) : (
          <div style={styles.histList}>
            {sessions.length === 0 && (
              <div style={{ ...ui.muted, padding: "0.5rem 0.6rem" }}>Noch kein Verlauf.</div>
            )}
            {sessions.map((s) =>
              editingId === s.id ? (
                <div key={s.id} className="rd-hist-row" style={styles.histRow}>
                  <Input
                    autoFocus
                    value={editValue}
                    onChange={(e) => setEditValue(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        void saveTitle(s);
                      } else if (e.key === "Escape") {
                        e.preventDefault();
                        setEditingId(null);
                      }
                    }}
                    placeholder={`Chat ${s.id}`}
                    aria-label="Titel des Gesprächs"
                    style={styles.histEditInput}
                  />
                  <IconButton
                    icon="check"
                    label="Speichern"
                    onClick={() => void saveTitle(s)}
                    style={styles.histIconBtn}
                  />
                  <IconButton
                    icon="x"
                    label="Abbrechen"
                    onClick={() => setEditingId(null)}
                    style={styles.histIconBtn}
                  />
                </div>
              ) : (
                <div key={s.id} className="rd-hist-row" style={styles.histRow}>
                  <button
                    type="button"
                    className="rd-hist-item"
                    style={styles.histItemBtn}
                    aria-current={s.id === sessionId}
                    onClick={() => void openSession(s)}
                    onDoubleClick={() => startRename(s)}
                    title={sessionLabel(s)}
                  >
                    {sessionLabel(s)}
                  </button>
                  {/*
                   * Die Aktionen erscheinen erst beim Überfahren: Ein
                   * ausgeschriebener „Löschen"-Knopf in jeder Zeile drückte den
                   * Titel auf „Vektor-I…" zusammen — und der Titel ist das
                   * Einzige, wonach man ein Gespräch wiederfindet.
                   */}
                  <span className="rd-hist-actions">
                    <IconButton
                      icon="edit"
                      label="Umbenennen"
                      onClick={() => startRename(s)}
                      style={styles.histIconBtn}
                    />
                    {confirmId === s.id ? (
                      <>
                        <IconButton
                          icon="check"
                          label="Wirklich löschen"
                          variant="danger"
                          onClick={() => {
                            setConfirmId(null);
                            void removeSession(s);
                          }}
                          style={styles.histIconBtn}
                        />
                        <IconButton
                          icon="x"
                          label="Abbrechen"
                          onClick={() => setConfirmId(null)}
                          style={styles.histIconBtn}
                        />
                      </>
                    ) : (
                      <IconButton
                        icon="trash"
                        label="Gespräch löschen"
                        onClick={() => setConfirmId(s.id)}
                        style={styles.histIconBtn}
                      />
                    )}
                  </span>
                </div>
              ),
            )}
          </div>
        )}
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
                      title="Stellt die vorausgehende Frage erneut — der bisherige Verlauf bleibt erhalten."
                    >
                      <Icon name="refresh" size={14} />
                      Nochmal fragen
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
                {toolNote !== null && <span style={styles.time}>{toolNote}</span>}
              </div>
              <div style={styles.answer}>
                {live === "" ? (
                  <span style={ui.muted}>{toolNote ?? "Schreibt…"}</span>
                ) : (
                  <>
                    <Markdown content={live} />
                    <span className="rd-caret" aria-hidden="true" />
                  </>
                )}
              </div>
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
            {/*
             * Waehrend geschrieben wird, bricht dieser Knopf die Antwort
             * wirklich ab (AbortController) — frueher war das Stopp-Symbol nur
             * Zierde an einem abgeschalteten Knopf.
             */}
            {busy ? (
              <button
                type="button"
                style={styles.send}
                onClick={stop}
                aria-label="Antwort abbrechen"
                title="Antwort abbrechen"
              >
                <Icon name="stop" size={16} />
              </button>
            ) : (
              <button
                type="button"
                style={{ ...styles.send, ...(canSend ? {} : styles.sendOff) }}
                onClick={() => void send(input)}
                disabled={!canSend}
                aria-label="Senden"
              >
                <Icon name="send" size={16} />
              </button>
            )}
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
  // Eingeklappter Zustand: schmaler Streifen mit nur Umschalt- und Neu-Knopf,
  // damit die Verlaufsliste bei schmalen Fenstern nicht die Hälfte frisst.
  histNarrow: {
    width: 52,
    flexShrink: 0,
    borderRight: "1px solid var(--border)",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    padding: "0.75rem 0.5rem",
    gap: "0.6rem",
    background: "var(--bg)",
  },
  histTopRow: { display: "flex", alignItems: "center", gap: "0.4rem", width: "100%" },
  newBtnNarrow: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    width: 32,
    height: 32,
    border: "1px solid var(--border)",
    borderRadius: "var(--radius-sm)",
    background: "var(--card)",
    color: "var(--text)",
    cursor: "pointer",
  },
  histRow: { display: "flex", alignItems: "center", gap: "0.25rem" },
  histItemBtn: { flex: 1, minWidth: 0 },
  histIconBtn: { width: 28, height: 28, flexShrink: 0 },
  histEditInput: { flex: 1, minWidth: 0, padding: "0.35rem 0.5rem", fontSize: "0.85rem" },
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
