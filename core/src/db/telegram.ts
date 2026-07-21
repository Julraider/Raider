import { randomInt } from "node:crypto";
import type { TelegramChat, TelegramPairingCode } from "@raider/shared";
import type { Db } from "./index";
import { createSession } from "./repository";

interface ChatRow {
  chat_id: number;
  session_id: number;
  label: string | null;
  paired_at: string;
}

interface CodeRow {
  code: string;
  created_at: string;
  expires_at: string;
  used_at: string | null;
}

/** Ergebnis des Einlösens eines Kopplungs-Codes. */
export type RedeemResult =
  | { ok: true; chat: TelegramChat; alreadyPaired: boolean }
  | { ok: false; reason: "unknown" | "expired" | "used" };

// Ohne verwechselbare Zeichen (0/O, 1/I/L), damit der Code am Handy leicht tippbar ist.
const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

/** Erzeugt einen Einmal-Code, gültig für `ttlSeconds` Sekunden. */
export function createPairingCode(db: Db, ttlSeconds: number): TelegramPairingCode {
  const code = generateCode();
  const row = db
    .prepare(
      `INSERT INTO telegram_pairing_codes (code, expires_at)
       VALUES (?, datetime('now', ?))
       RETURNING code, created_at, expires_at, used_at`,
    )
    .get(code, `+${Math.max(1, Math.floor(ttlSeconds))} seconds`) as CodeRow;
  return toCode(row);
}

/**
 * Löst einen Code ein: koppelt den Chat an eine neue Sitzung. Ist der Chat
 * schon gekoppelt, wird der bestehende zurückgegeben (und der Code nicht
 * verbraucht). Abgelaufene oder bereits benutzte Codes werden abgewiesen.
 */
export function redeemPairingCode(
  db: Db,
  rawCode: string,
  chatId: number,
  label: string | null,
): RedeemResult {
  const existing = getChat(db, chatId);
  if (existing) return { ok: true, chat: existing, alreadyPaired: true };

  const code = rawCode.trim().toUpperCase();
  const row = db
    .prepare(
      "SELECT code, created_at, expires_at, used_at FROM telegram_pairing_codes WHERE code = ?",
    )
    .get(code) as CodeRow | undefined;
  if (!row) return { ok: false, reason: "unknown" };
  if (row.used_at !== null) return { ok: false, reason: "used" };
  if (isExpired(db, code)) return { ok: false, reason: "expired" };

  const pair = db.transaction((): TelegramChat => {
    const session = createSession(db, {
      channel: "telegram",
      title: label ?? `Telegram ${chatId}`,
    });
    db.prepare("INSERT INTO telegram_chats (chat_id, session_id, label) VALUES (?, ?, ?)").run(
      chatId,
      session.id,
      label,
    );
    db.prepare(
      "UPDATE telegram_pairing_codes SET used_at = datetime('now'), used_by_chat_id = ? WHERE code = ?",
    ).run(chatId, code);
    const chat = getChat(db, chatId);
    if (!chat) throw new Error("Kopplung fehlgeschlagen.");
    return chat;
  });

  return { ok: true, chat: pair(), alreadyPaired: false };
}

export function getChat(db: Db, chatId: number): TelegramChat | undefined {
  const row = db
    .prepare("SELECT chat_id, session_id, label, paired_at FROM telegram_chats WHERE chat_id = ?")
    .get(chatId) as ChatRow | undefined;
  return row ? toChat(row) : undefined;
}

export function listChats(db: Db): TelegramChat[] {
  const rows = db
    .prepare(
      "SELECT chat_id, session_id, label, paired_at FROM telegram_chats ORDER BY paired_at DESC",
    )
    .all() as ChatRow[];
  return rows.map(toChat);
}

export function unpairChat(db: Db, chatId: number): boolean {
  return db.prepare("DELETE FROM telegram_chats WHERE chat_id = ?").run(chatId).changes > 0;
}

export function chatCount(db: Db): number {
  const row = db.prepare("SELECT COUNT(*) AS n FROM telegram_chats").get() as { n: number };
  return row.n;
}

function isExpired(db: Db, code: string): boolean {
  const row = db
    .prepare(
      "SELECT (expires_at <= datetime('now')) AS expired FROM telegram_pairing_codes WHERE code = ?",
    )
    .get(code) as { expired: number } | undefined;
  return !row || row.expired === 1;
}

function generateCode(): string {
  let code = "";
  for (let i = 0; i < 6; i++) code += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
  return code;
}

function toChat(row: ChatRow): TelegramChat {
  return {
    chatId: row.chat_id,
    sessionId: row.session_id,
    label: row.label,
    pairedAt: row.paired_at,
  };
}

function toCode(row: CodeRow): TelegramPairingCode {
  return {
    code: row.code,
    createdAt: row.created_at,
    expiresAt: row.expires_at,
    usedAt: row.used_at,
  };
}
