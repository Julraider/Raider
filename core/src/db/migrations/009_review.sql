-- Hintergrund-Review: Protokoll der Läufe (was hat der Review wann getan).

CREATE TABLE review_runs (
  id       INTEGER PRIMARY KEY,
  ran_at   TEXT NOT NULL DEFAULT (datetime('now')),
  created  INTEGER NOT NULL DEFAULT 0,   -- neu erzeugte Vorschläge
  skipped  INTEGER NOT NULL DEFAULT 0,   -- übersprungene (Duplikate etc.)
  note     TEXT
);
