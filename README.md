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
| `npm run skills` | Skills verwalten (`-- new`, `-- show <id>`, `-- on/off <id>`, `-- assign <agentId> <skillId>`, `-- del <id>`) |
| `npm run telegram` | Telegram-Gateway (`-- pair` Code erzeugen, `-- unpair <chatId>`) |
| `npm run scheduler` | Geplante Aufgaben (`-- new`, `-- on/off <id>`, `-- run <id>`, `-- del <id>`) |
| `npm run stop` | Not-Stopp aktivieren (`-- release` lösen, `-- status` prüfen) |
| `npm run review` | Hintergrund-Review jetzt ausführen (`-- history` frühere Läufe) |
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
| `RAIDER_TELEGRAM_TOKEN` | — | Bot-Token von @BotFather; nur serverseitig gelesen, nie geloggt |
| `RAIDER_TELEGRAM_PAIRING_TTL` | `600` | Gültigkeitsdauer eines Kopplungs-Codes (Sekunden) |

| `RAIDER_REVIEW_INTERVAL` | `0` | Intervall des Hintergrund-Reviews in Sekunden; `0` = aus (manuell per `npm run review`) |

> Hinweis: `RAIDER_PORT` nicht auf einen vom Browser gesperrten „bad port"
> setzen (z. B. 4190) — das eingebaute `fetch` verweigert solche Ports. Der
> Standard 4179 ist frei.

## Anbieter

Zwei Anbieter hinter derselben internen Schnittstelle:
- **Anthropic (Claude)** — braucht `ANTHROPIC_API_KEY`.
- **Ollama** — lokale Modelle, kostenlos, kein Key. Ollama installieren
  (`ollama.com`), ein Modell laden (`ollama pull llama3.2`), dann startet der
  Core automatisch damit, solange kein Anthropic-Key gesetzt ist.

## Telegram

Raider vom Handy aus erreichen — abgesichert durch eine Kopplung, damit nicht
jeder Fremde, der den Bot findet, mitreden kann:

1. Bei Telegram bei **@BotFather** einen Bot anlegen und den Token als
   `RAIDER_TELEGRAM_TOKEN` in die `.env` schreiben. Der Token bleibt im Core und
   wird nie geloggt oder über die API ausgegeben.
2. `npm run telegram -- pair` erzeugt einen Einmal-Code (Standard 10 Min gültig).
3. Im Chat mit dem Bot `/pair <Code>` schicken → gekoppelt. Erst ab jetzt gehen
   Nachrichten ans Modell; ungekoppelte Chats werden höflich abgewiesen und
   **nie** weitergereicht. `npm run telegram -- unpair <chatId>` löst die
   Kopplung wieder.

Das Gateway nutzt die Telegram-Bot-API direkt (kein Zusatzpaket) und teilt sich
mit der HTTP-Route dieselbe Dialog-Logik (Agent-Prompt + Kerngedächtnis + Skills).

## Scheduler & Not-Stopp

Aufgaben laufen nach Zeitplan — drei einfache Arten statt Cron:
- **interval** — alle N Sekunden (`-- new interval 3600 "Name" "Prompt"`)
- **daily** — täglich um `HH:MM` (`-- new daily 07:00 "Morgenbrief" "Fasse zusammen"`)
- **once** — einmalig zu einem ISO-Zeitpunkt (danach automatisch deaktiviert)

Jeder Lauf startet eine frische Sitzung (Kanal `cron`) und schickt den Prompt
durch dieselbe Dialog-Logik wie Chat und Telegram. `npm run scheduler -- run <id>`
führt sofort aus.

Der **Not-Stopp** (`npm run stop`) ist der große rote Schalter: solange er aktiv
ist, laufen **keine** geplanten Aufgaben, das Telegram-Gateway antwortet nicht am
Modell, und Werkzeugaufrufe (MCP) werden mit `423` abgewiesen. Manuelles Tippen
am Rechner bleibt möglich, damit du prüfen und den Stopp wieder lösen kannst
(`npm run stop -- release`).

## Hintergrund-Review

Der Review (`npm run review`) sieht sich die jüngste Aktivität an — letzte
Gespräche, Kerngedächtnis, Skills — und **schlägt** daraus Merk-Einträge oder
Skills vor. Nichts wird angewendet: alle Vorschläge landen im
Freigabe-Posteingang (`npm run inbox`) und werden erst nach deiner Freigabe durch
die übliche Prüfung (Limit, Duplikat, Prompt-Injektion) übernommen. Duplikate zu
Vorhandenem werden übersprungen. Der automatische Hintergrund-Lauf ist
standardmäßig aus (`RAIDER_REVIEW_INTERVAL=0`) und respektiert den Not-Stopp;
manuell geht der Review jederzeit.

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
POST/GET /skills                            Skills anlegen/auflisten (Markdown-Dateien)
GET/PATCH/DELETE /skills/:id                Skill inkl. Inhalt lesen, ändern, löschen
GET  /skills/:id/export                     Skill als agentskills.io-Markdown exportieren
POST /skills/import                         Skill aus Markdown importieren
GET/POST/DELETE /agents/:id/skills[/:skillId]   Skills einem Agenten zuweisen/entziehen
GET  /telegram/status                       Gateway aktiv? + Anzahl gekoppelter Chats
POST /telegram/pairing-codes                Einmal-Code zum Koppeln erzeugen
GET/DELETE /telegram/chats[/:chatId]        Gekoppelte Chats auflisten / entkoppeln
POST/GET /scheduler/tasks                   Geplante Aufgaben anlegen/auflisten
GET/PATCH/DELETE /scheduler/tasks/:id       Aufgabe lesen, ändern, löschen
POST /scheduler/tasks/:id/run               Aufgabe jetzt ausführen (bei Not-Stopp gesperrt)
GET/POST/DELETE /emergency-stop             Not-Stopp lesen / aktivieren / lösen
POST /review/run                            Hintergrund-Review jetzt ausführen (schlägt vor)
GET  /review/runs                           Protokoll der Review-Läufe
POST /sessions/:id/messages      Dialog-Zug: Verlauf → Modell → beides speichern
GET  /sessions/:id/messages      Verlauf einer Sitzung
GET  /search?q=...               Volltextsuche über Nachrichten (FTS5)
```

Der Anbieter (aktuell Anthropic) sitzt hinter einem Adapter, der immer das
interne Nachrichtenformat zurückgibt — nie das rohe Anbieterformat. Gespräche
liegen in SQLite; `messages.content` ist per FTS5 durchsuchbar (Memory-Ebene 2).
