-- Agenten: Systemprompt + Modell (Werkzeuge & Skills folgen in späteren Schritten).
-- sessions.agent_id (aus Migration 001) verweist hierauf — bewusst als weiche
-- Referenz ohne harten Fremdschlüssel, damit Agenten löschbar bleiben.

CREATE TABLE agents (
  id             INTEGER PRIMARY KEY,
  name           TEXT NOT NULL,
  icon           TEXT,
  system_prompt  TEXT NOT NULL DEFAULT '',
  model          TEXT,
  fallback_model TEXT,
  created_at     TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at     TEXT NOT NULL DEFAULT (datetime('now'))
);
