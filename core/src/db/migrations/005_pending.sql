-- Freigabe-Posteingang: vorgeschlagene Schreibzugriffe warten hier auf Freigabe.

CREATE TABLE pending_writes (
  id                INTEGER PRIMARY KEY,
  kind              TEXT NOT NULL,                    -- memory | skill
  proposal          TEXT NOT NULL,                    -- JSON
  origin            TEXT NOT NULL DEFAULT 'auto',     -- auto | chat
  status            TEXT NOT NULL DEFAULT 'pending',  -- pending | approved | rejected
  source_session_id INTEGER REFERENCES sessions(id) ON DELETE SET NULL,
  created_at        TEXT NOT NULL DEFAULT (datetime('now')),
  resolved_at       TEXT
);

CREATE INDEX idx_pending_status ON pending_writes(status);
