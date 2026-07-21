-- Skills: Markdown-Dateien mit Metadaten in der DB; Zuordnung zu Agenten.

CREATE TABLE skills (
  id          INTEGER PRIMARY KEY,
  name        TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  category    TEXT,
  file_path   TEXT NOT NULL,
  active      INTEGER NOT NULL DEFAULT 1,
  source      TEXT NOT NULL DEFAULT 'manual',  -- manual | auto
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE agent_skills (
  agent_id INTEGER NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  skill_id INTEGER NOT NULL REFERENCES skills(id) ON DELETE CASCADE,
  PRIMARY KEY (agent_id, skill_id)
);
