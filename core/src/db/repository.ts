import type { ChatRole, SearchHit, Session, SessionChannel, StoredMessage } from "@raider/shared";
import type { Db } from "./index";

/** Rohe Zeilenformen (snake_case) — nur modulintern; nach außen camelCase. */
interface SessionRow {
  id: number;
  title: string | null;
  channel: string;
  status: string;
  agent_id: number | null;
  created_at: string;
  updated_at: string;
  message_count?: number;
}

interface MessageRow {
  id: number;
  session_id: number;
  role: string;
  content: string;
  tokens_in: number;
  tokens_out: number;
  created_at: string;
}

interface SearchRow {
  id: number;
  session_id: number;
  role: string;
  created_at: string;
  snippet: string;
}

export interface NewSession {
  title?: string | null;
  channel?: SessionChannel;
  agentId?: number | null;
}

export interface NewMessage {
  sessionId: number;
  role: ChatRole;
  content: string;
  tokensIn?: number;
  tokensOut?: number;
}

export function createSession(db: Db, input: NewSession = {}): Session {
  const info = db
    .prepare("INSERT INTO sessions (title, channel, agent_id) VALUES (?, ?, ?)")
    .run(input.title ?? null, input.channel ?? "cli", input.agentId ?? null);
  const session = getSession(db, Number(info.lastInsertRowid));
  if (!session) throw new Error("Session konnte nicht angelegt werden.");
  return session;
}

export function getSession(db: Db, id: number): Session | undefined {
  const row = db
    .prepare(
      "SELECT id, title, channel, status, agent_id, created_at, updated_at FROM sessions WHERE id = ?",
    )
    .get(id) as SessionRow | undefined;
  return row ? toSession(row) : undefined;
}

export function listSessions(db: Db): Session[] {
  const rows = db
    .prepare(
      `SELECT s.id, s.title, s.channel, s.status, s.agent_id, s.created_at, s.updated_at,
              COUNT(m.id) AS message_count
       FROM sessions s
       LEFT JOIN messages m ON m.session_id = s.id
       GROUP BY s.id
       ORDER BY s.updated_at DESC, s.id DESC`,
    )
    .all() as SessionRow[];
  return rows.map(toSession);
}

export function addMessage(db: Db, input: NewMessage): StoredMessage {
  const insert = db.transaction((): number => {
    const info = db
      .prepare(
        "INSERT INTO messages (session_id, role, content, tokens_in, tokens_out) VALUES (?, ?, ?, ?, ?)",
      )
      .run(input.sessionId, input.role, input.content, input.tokensIn ?? 0, input.tokensOut ?? 0);
    db.prepare("UPDATE sessions SET updated_at = datetime('now') WHERE id = ?").run(
      input.sessionId,
    );
    return Number(info.lastInsertRowid);
  });

  const message = getMessage(db, insert());
  if (!message) throw new Error("Nachricht konnte nicht gespeichert werden.");
  return message;
}

export function getMessages(db: Db, sessionId: number): StoredMessage[] {
  const rows = db
    .prepare(
      "SELECT id, session_id, role, content, tokens_in, tokens_out, created_at FROM messages WHERE session_id = ? ORDER BY id",
    )
    .all(sessionId) as MessageRow[];
  return rows.map(toMessage);
}

/** Volltextsuche über alle Nachrichten (Memory-Ebene 2). */
export function searchMessages(db: Db, query: string, limit = 20): SearchHit[] {
  const ftsQuery = toFtsQuery(query);
  if (ftsQuery === "") return [];

  const rows = db
    .prepare(
      `SELECT m.id, m.session_id, m.role, m.created_at,
              snippet(messages_fts, 0, '[', ']', '…', 12) AS snippet
       FROM messages_fts
       JOIN messages m ON m.id = messages_fts.rowid
       WHERE messages_fts MATCH ?
       ORDER BY rank
       LIMIT ?`,
    )
    .all(ftsQuery, limit) as SearchRow[];

  return rows.map((row) => ({
    messageId: row.id,
    sessionId: row.session_id,
    role: row.role as ChatRole,
    snippet: row.snippet,
    createdAt: row.created_at,
  }));
}

function getMessage(db: Db, id: number): StoredMessage | undefined {
  const row = db
    .prepare(
      "SELECT id, session_id, role, content, tokens_in, tokens_out, created_at FROM messages WHERE id = ?",
    )
    .get(id) as MessageRow | undefined;
  return row ? toMessage(row) : undefined;
}

/**
 * Macht aus der freien Nutzereingabe eine sichere FTS5-Abfrage: jedes Wort
 * wird als Phrase gequotet und mit UND verknüpft. Verhindert Syntaxfehler
 * durch Sonderzeichen in der Eingabe.
 */
function toFtsQuery(raw: string): string {
  return raw
    .trim()
    .split(/\s+/)
    .filter((token) => token.length > 0)
    .map((token) => `"${token.replace(/"/g, '""')}"`)
    .join(" ");
}

function toSession(row: SessionRow): Session {
  return {
    id: row.id,
    title: row.title,
    channel: row.channel as SessionChannel,
    status: row.status,
    agentId: row.agent_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    ...(row.message_count !== undefined ? { messageCount: row.message_count } : {}),
  };
}

function toMessage(row: MessageRow): StoredMessage {
  return {
    id: row.id,
    sessionId: row.session_id,
    role: row.role as ChatRole,
    content: row.content,
    tokensIn: row.tokens_in,
    tokensOut: row.tokens_out,
    createdAt: row.created_at,
  };
}

/**
 * Benennt eine Sitzung um. Ein leerer Titel setzt auf „ohne Titel" zurück,
 * damit die Liste wieder auf den Ersatznamen fällt.
 */
export function renameSession(db: Db, id: number, title: string): Session | undefined {
  const clean = title.trim();
  db.prepare("UPDATE sessions SET title = ?, updated_at = datetime('now') WHERE id = ?").run(
    clean === "" ? null : clean,
    id,
  );
  return getSession(db, id);
}

/**
 * Löscht eine Sitzung samt Nachrichten. Ohne diese Möglichkeit könnte niemand
 * ein versehentlich geschriebenes Gespräch wieder loswerden — bei einem
 * Programm, das mit „läuft lokal, gehört dir" wirbt, wäre das ein Widerspruch.
 */
export function deleteSession(db: Db, id: number): boolean {
  const result = db.prepare("DELETE FROM sessions WHERE id = ?").run(id);
  return result.changes > 0;
}
