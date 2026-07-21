-- Scheduler (geplante Aufgaben) und Not-Stopp (globaler Schalter).

CREATE TABLE scheduled_tasks (
  id             INTEGER PRIMARY KEY,
  name           TEXT NOT NULL,
  schedule_kind  TEXT NOT NULL,                    -- interval | daily | once
  schedule_value TEXT NOT NULL,                    -- interval: Sekunden; daily: HH:MM; once: ISO
  agent_id       INTEGER REFERENCES agents(id) ON DELETE SET NULL,
  prompt         TEXT NOT NULL,
  enabled        INTEGER NOT NULL DEFAULT 1,
  last_run_at    TEXT,
  next_run_at    TEXT NOT NULL,
  created_at     TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_scheduled_next ON scheduled_tasks(enabled, next_run_at);

-- Genau eine Zeile: der Not-Stopp-Schalter.
CREATE TABLE emergency_stop (
  id         INTEGER PRIMARY KEY CHECK (id = 1),
  engaged    INTEGER NOT NULL DEFAULT 0,
  engaged_at TEXT,
  reason     TEXT
);

INSERT INTO emergency_stop (id, engaged) VALUES (1, 0);
