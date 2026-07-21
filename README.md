# Raider

Persönlicher AI-Assistent. Ein **headless Core** läuft als eigener Prozess; alle
Clients (Electron, CLI, Telegram-Gateway, Scheduler) reden ausschließlich über die
lokale API des Cores.

Dies ist **Schritt 1 der Baureihenfolge — das Skelett**: Repo, TypeScript,
SQLite-Anbindung mit Migrationsmechanismus, und ein Core, der auf `GET /status`
antwortet. Provider, Agenten, Oberfläche und MCP kommen in späteren Schritten.

## Struktur

Ein Monorepo mit npm-Workspaces — je ein Paket pro Baustein aus dem Spec:

| Ordner | Paket | Inhalt |
|---|---|---|
| `core/` | `@raider/core` | Datenbank, Migrationen, lokale API (`/status`) |
| `shared/` | `@raider/shared` | Gemeinsame Typen für alle Clients |
| `cli/` | `@raider/cli` | Platzhalter (Schritt 2/3) |
| `desktop/` | `@raider/desktop` | Electron-Fenster (React) gegen denselben Core |

## Befehle

| Befehl | Wirkung |
|---|---|
| `npm run dev` | Core im Watch-Modus starten |
| `npm run ask -- "Frage"` | Eine Frage an den Core stellen (Core muss laufen) |
| `npm run chat` | Interaktiver Dialog gegen den Core (Core muss laufen) |
| `npm run search -- "Begriff"` | Volltextsuche über gespeicherte Nachrichten |
| `npm run agents` | Agenten auflisten (oder `-- new "Name" "Prompt"`) |
| `npm run mcp` | MCP-Server verwalten/testen (`-- add`, `-- test <id>`, `-- call <id> <tool>`) |
| `npm run memory` | Kerngedächtnis ansehen/bearbeiten (`-- add`, `-- edit`, `-- del`) |
| `npm run inbox` | Freigabe-Posteingang (`-- propose`, `-- approve <id>`, `-- reject <id>`) |
| `npm run test` | Vitest |
| `npm run typecheck` | `tsc --noEmit` über das ganze Repo |
| `npm run lint` | Biome (Lint + Format-Check) |
| `npm run format` | Biome, Fehler automatisch korrigieren |

## Konfiguration (Umgebungsvariablen)

| Variable | Standard | Zweck |
|---|---|---|
| `RAIDER_DATA_DIR` | `~/Raider` | Datenordner |
| `RAIDER_DB_PATH` | `<DATA_DIR>/raider.db` | Pfad zur SQLite-Datei |
| `RAIDER_PORT` | `4179` | Port der lokalen API |
| `RAIDER_PROVIDER` | auto | `anthropic` oder `ollama`; ohne Wert: Anthropic wenn Key da, sonst Ollama |
| `ANTHROPIC_API_KEY` | — | API-Key; nur serverseitig gelesen, nie geloggt |
| `ANTHROPIC_BASE_URL` | `https://api.anthropic.com` | Basis-URL von Anthropic |
| `RAIDER_MODEL` | `claude-opus-4-8` | Anthropic-Standardmodell |
| `RAIDER_OLLAMA_URL` | `http://localhost:11434` | Basis-URL des lokalen Ollama-Servers |
| `RAIDER_OLLAMA_MODEL` | `llama3.2` | Ollama-Standardmodell |
| `RAIDER_MAX_TOKENS` | `2048` | Obergrenze der Antwort-Tokens |

## Anbieter

Zwei Anbieter hinter derselben internen Schnittstelle:
- **Anthropic (Claude)** — braucht `ANTHROPIC_API_KEY`.
- **Ollama** — lokale Modelle, kostenlos, kein Key. Ollama installieren
  (`ollama.com`), ein Modell laden (`ollama pull llama3.2`), dann startet der
  Core automatisch damit, solange kein Anthropic-Key gesetzt ist.

## API

```
GET  /status                     Version + Datenbankstatus
POST /chat                       Zustandsloser Einmal-Aufruf (messages im Body)
POST /sessions                   Neue Sitzung anlegen (optional agentId)
GET  /sessions                   Sitzungen auflisten
POST/GET/PATCH/DELETE /agents    Agenten anlegen, auflisten, ändern, löschen
POST /agents/:id/duplicate       Agent duplizieren
POST/GET/PATCH/DELETE /mcp/servers          MCP-Server verwalten (Secrets geschwärzt)
POST /mcp/servers/:id/test                  Verbindungstest (Werkzeuge auflisten)
POST /mcp/servers/:id/tools/:tool/call      Werkzeugaufruf — nur mit Freigabe
GET  /tool-calls                            Protokoll aller Werkzeugaufrufe
GET/POST /memory/:store                     Kerngedächtnis lesen/ergänzen (agent|user)
PATCH/DELETE /memory/entries/:id            Eintrag ändern/löschen
POST/GET /inbox                             Freigabe-Posteingang (Vorschläge)
POST /inbox/:id/approve | /reject           Vorschlag freigeben (anwenden) | ablehnen
POST /sessions/:id/messages      Dialog-Zug: Verlauf → Modell → beides speichern
GET  /sessions/:id/messages      Verlauf einer Sitzung
GET  /search?q=...               Volltextsuche über Nachrichten (FTS5)
```

Der Anbieter (aktuell Anthropic) sitzt hinter einem Adapter, der immer das
interne Nachrichtenformat zurückgibt — nie das rohe Anbieterformat. Gespräche
liegen in SQLite; `messages.content` ist per FTS5 durchsuchbar (Memory-Ebene 2).
