-- MCP-Server und protokollierte Werkzeugaufrufe.

CREATE TABLE mcp_servers (
  id         INTEGER PRIMARY KEY,
  name       TEXT NOT NULL,
  type       TEXT NOT NULL,                 -- stdio | http
  command    TEXT,                          -- stdio: Befehl
  args       TEXT NOT NULL DEFAULT '[]',    -- JSON-Array
  url        TEXT,                          -- http: URL
  env        TEXT NOT NULL DEFAULT '{}',    -- JSON-Objekt (Secrets)
  enabled    INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE tool_calls (
  id          INTEGER PRIMARY KEY,
  server_id   INTEGER REFERENCES mcp_servers(id) ON DELETE SET NULL,
  tool_name   TEXT NOT NULL,
  arguments   TEXT NOT NULL DEFAULT '{}',   -- JSON
  result      TEXT NOT NULL DEFAULT '',
  is_error    INTEGER NOT NULL DEFAULT 0,
  approved_by TEXT,                          -- wer freigegeben hat
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
