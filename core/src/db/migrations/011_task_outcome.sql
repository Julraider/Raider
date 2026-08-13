-- Ergebnis des letzten Laufs einer geplanten Aufgabe.
--
-- Bisher wurde nur `last_run_at` vermerkt: Der Nutzer sah, DASS etwas lief,
-- aber nie, ob es geklappt hat und schon gar nicht, was dabei herauskam. Ein
-- Fehlschlag (Anbieter nicht erreichbar, Werkzeug kaputt) verschwand
-- vollständig — die Aufgabe sah aus wie erfolgreich gelaufen.

ALTER TABLE scheduled_tasks ADD COLUMN last_status TEXT;
ALTER TABLE scheduled_tasks ADD COLUMN last_error TEXT;
-- Sitzung des letzten Laufs, damit das Ergebnis im Chat auffindbar ist.
-- Bewusst OHNE Fremdschlüssel: Löscht der Nutzer die Sitzung, soll die Aufgabe
-- bestehen bleiben (der Verweis läuft dann eben ins Leere).
ALTER TABLE scheduled_tasks ADD COLUMN last_session_id INTEGER;
