-- Memory Ebene 1: Kerngedächtnis (Nutzerprofil + Agenten-Notizen).
-- Zeichenlimit pro Speicher wird in der Anwendung erzwungen.

CREATE TABLE memory_entries (
  id                INTEGER PRIMARY KEY,
  store             TEXT NOT NULL,             -- agent | user
  content           TEXT NOT NULL,
  source_session_id INTEGER REFERENCES sessions(id) ON DELETE SET NULL,
  created_at        TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at        TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_memory_store ON memory_entries(store);
