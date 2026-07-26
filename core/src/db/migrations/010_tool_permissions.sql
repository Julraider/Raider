-- Dauerfreigaben für Werkzeuge, die Raider SELBST benutzen darf.
--
-- Grundhaltung: Was hier nicht eingetragen ist, bekommt das Modell gar nicht
-- erst zu sehen. Es gibt also keinen Weg, ein nicht freigegebenes Werkzeug
-- versehentlich auszulösen — der Nutzer erteilt die Freigabe vorher und
-- bewusst, pro Werkzeug, nicht pauschal pro Server.
CREATE TABLE mcp_tool_permissions (
  id         INTEGER PRIMARY KEY,
  server_id  INTEGER NOT NULL REFERENCES mcp_servers(id) ON DELETE CASCADE,
  tool_name  TEXT NOT NULL,
  /** Wer die Freigabe erteilt hat (für das Protokoll). */
  granted_by TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (server_id, tool_name)
);

CREATE INDEX idx_mcp_tool_permissions_server ON mcp_tool_permissions (server_id);
