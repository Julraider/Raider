-- Telegram-Gateway: gekoppelte Chats und Einmal-Codes zum Koppeln.

CREATE TABLE telegram_chats (
  chat_id    INTEGER PRIMARY KEY,                          -- Telegram-Chat-ID
  session_id INTEGER NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  label      TEXT,                                         -- Anzeigename (z. B. @nutzer)
  paired_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE telegram_pairing_codes (
  code           TEXT PRIMARY KEY,                         -- Einmal-Code (Geheimnis)
  created_at     TEXT NOT NULL DEFAULT (datetime('now')),
  expires_at     TEXT NOT NULL,
  used_at        TEXT,
  used_by_chat_id INTEGER
);

CREATE INDEX idx_telegram_codes_expires ON telegram_pairing_codes(expires_at);
