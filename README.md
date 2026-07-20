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
| `desktop/` | `@raider/desktop` | Platzhalter (Schritt 5) |

## Befehle

| Befehl | Wirkung |
|---|---|
| `npm run dev` | Core im Watch-Modus starten |
| `npm run ask -- "Frage"` | Eine Frage an den Core stellen (Core muss laufen) |
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
| `ANTHROPIC_API_KEY` | — | API-Key; nur serverseitig gelesen, nie geloggt |
| `ANTHROPIC_BASE_URL` | `https://api.anthropic.com` | Basis-URL des Anbieters |
| `RAIDER_MODEL` | `claude-opus-4-8` | Standardmodell |
| `RAIDER_MAX_TOKENS` | `2048` | Obergrenze der Antwort-Tokens |

## API

```
GET  /status  →  { status, version, database: { connected, migrations } }
POST /chat    →  { role, content, model, stopReason, usage }
     Body:       { messages: [{ role, content }], model?, maxTokens?, system? }
```

Der Anbieter (aktuell Anthropic) sitzt hinter einem Adapter, der immer das
interne Nachrichtenformat zurückgibt — nie das rohe Anbieterformat.
