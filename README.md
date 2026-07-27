# Raider

Persönlicher AI-Assistent. Ein **headless Core** läuft als eigener Prozess; alle
Clients (Electron-Fenster, CLI, Telegram-Gateway, Scheduler) reden ausschließlich
über die lokale API des Cores.

> **Neu hier? → [SCHNELLSTART.md](SCHNELLSTART.md).** Kurzfassung: Node.js
> installieren, dann Doppelklick auf `Raider starten (Windows).bat` bzw.
> `Raider starten (Mac).command` — oder `npm install && npm start`.

Der Core spricht wahlweise mit **Anthropic (Claude)** oder mit einem lokalen
**Ollama**-Modell, kann selbst freigegebene MCP-Werkzeuge aufrufen (die
„Werkzeugschleife", siehe unten), streamt Antworten wortweise und bietet eine
lokale API mit Zugriffstoken. Anbieter, Schlüssel und Telegram-Token lassen sich
entweder direkt im Fenster einrichten oder klassisch über `.env` — siehe
[Einrichtung](#einrichtung).

## Struktur

Ein Monorepo mit npm-Workspaces — je ein Paket pro Baustein:

| Ordner | Paket | Inhalt |
|---|---|---|
| `core/` | `@raider/core` | Datenbank, Migrationen, Anbieter, MCP-Werkzeugschleife, lokale API |
| `shared/` | `@raider/shared` | Gemeinsame Typen und der API-Client für alle Clients |
| `cli/` | `@raider/cli` | Kommandozeilen-Werkzeuge (Chat, Agenten, MCP, Gedächtnis, Posteingang, Skills, Telegram, Scheduler, Not-Stopp, Review, Health, Backup, Suche) — siehe Tabelle unten |
| `desktop/` | `@raider/desktop` | Electron-Fenster (React): Reiter Chat, Agenten, Werkzeuge, Gedächtnis, Skills, Posteingang, Aufgaben, Suche, Telegram, Betrieb, Einstellungen |

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
| `npm run health` | Gesundheit + Zählerstände anzeigen |
| `npm run backup` | Datenbank-Sicherung anlegen (`-- list` vorhandene zeigen) |
| `npm run test` | Vitest |
| `npm run typecheck` | `tsc --noEmit` über das ganze Repo |
| `npm run lint` | Biome (Lint + Format-Check) |
| `npm run format` | Biome, Fehler automatisch korrigieren |

## Konfiguration (Umgebungsvariablen)

Werte aus der Umgebung (`.env`) haben **immer Vorrang** vor allem, was in der
Oberfläche eingerichtet wurde — siehe [Einrichtung](#einrichtung). Alle Werte
sind optional; ohne `.env` läuft Raider mit den unten stehenden Standards.

| Variable | Standard | Zweck |
|---|---|---|
| `RAIDER_DATA_DIR` | `~/Raider` | Datenordner (Datenbank, Skills, Sicherungen, `.access-token`, `.secrets`) |
| `RAIDER_DB_PATH` | `<DATA_DIR>/raider.db` | Pfad zur SQLite-Datei |
| `RAIDER_SKILLS_DIR` | `<DATA_DIR>/skills` | Ordner, in dem Skills als Markdown-Dateien liegen |
| `RAIDER_PORT` | `4179` | Port der lokalen API |
| `RAIDER_HOST` | `127.0.0.1` | Adresse, auf der die API lauscht. Standard: nur der eigene Rechner. **Die API hat kein Passwort** — wer das auf `0.0.0.0` setzt, gibt Gespräche und Werkzeuge für jedes Gerät im Netz frei. |
| `RAIDER_PROVIDER` | auto | `anthropic` oder `ollama`; ohne Wert: Anthropic wenn Key da, sonst Ollama |
| `ANTHROPIC_API_KEY` | — | API-Key; nur serverseitig gelesen, nie geloggt |
| `ANTHROPIC_BASE_URL` | `https://api.anthropic.com` | Basis-URL von Anthropic |
| `RAIDER_MODEL` | `claude-opus-4-8` | Anthropic- **oder** Ollama-Standardmodell (je nach aktivem Anbieter) |
| `RAIDER_OLLAMA_URL` | `http://localhost:11434` | Basis-URL des lokalen Ollama-Servers |
| `RAIDER_OLLAMA_MODEL` | `llama3.2` | Ollama-Standardmodell |
| `RAIDER_MAX_TOKENS` | `2048` | Obergrenze der Antwort-Tokens (gilt für beide Anbieter) |
| `RAIDER_MEMORY_USER_LIMIT` | `1375` | Zeichenlimit des Nutzerprofil-Gedächtnisses |
| `RAIDER_MEMORY_AGENT_LIMIT` | `2200` | Zeichenlimit des Agenten-Gedächtnisses (Notizen) |
| `RAIDER_TELEGRAM_TOKEN` | — | Bot-Token von @BotFather; nur serverseitig gelesen, nie geloggt |
| `RAIDER_TELEGRAM_PAIRING_TTL` | `600` | Gültigkeitsdauer eines Kopplungs-Codes (Sekunden) |
| `RAIDER_REVIEW_INTERVAL` | `0` | Intervall des Hintergrund-Reviews in Sekunden; `0` = aus (manuell per `npm run review`) |
| `RAIDER_BACKUP_DIR` | `<DATA_DIR>/backups` | Ordner für Datenbank-Sicherungen |
| `RAIDER_BACKUP_KEEP` | `10` | Wie viele Sicherungen aufbewahrt werden |
| `RAIDER_BACKUP_INTERVAL` | `0` | Intervall automatischer Sicherungen in Sekunden; `0` = aus |
| `RAIDER_LOG_REQUESTS` | `1` | HTTP-Anfragen loggen (`0` = aus); nie werden Inhalte geloggt |

> Hinweis: `RAIDER_PORT` nicht auf einen vom Browser gesperrten „bad port"
> setzen (z. B. 4190) — das eingebaute `fetch` verweigert solche Ports. Der
> Standard 4179 ist frei.

## Einrichtung

Anbieter, Claude-Schlüssel, Modell und Telegram-Token lassen sich auf zwei Wegen
setzen:

1. **Im Fenster** (empfohlen für die meisten): Reiter „Einstellungen" bzw. die
   geführte Ersteinrichtung beim ersten Start. Die Werte landen in
   `<Datenordner>/.secrets` (Rechte `0600`) — einer Datei, die ausschließlich der
   Core selbst anlegt und verwaltet. Es greift sofort, ganz ohne Neustart.
2. **Klassisch über `.env`** (siehe oben) — für Fortgeschrittene, oder wenn
   Raider unbeaufsichtigt/als Dienst läuft.

**Vorrangregel:** Ein in der Umgebung gesetzter Wert gewinnt immer gegen
`.secrets`. Wer schon eine `.env` mit `ANTHROPIC_API_KEY` pflegt, merkt vom
Einrichtungsdialog im Fenster nichts — der Wert aus `.env` bleibt aktiv, und die
Oberfläche zeigt das entsprechende Feld als gesperrt an. `.env` und
`~/Raider/.keys` liest bzw. schreibt die Einrichtung nie.

API dazu (nie wird ein Geheimnis wieder herausgegeben, nur ob es gesetzt ist):

```
GET  /setup           Status: aktiver Anbieter, Modell, ob Key/Token gesetzt sind, was aus .env kommt
POST /setup           Anbieter/Key/Modell/Telegram-Token setzen (leerer String löscht den Wert)
GET  /setup/ollama     Prüft, ob ein lokaler Ollama-Server läuft, und listet seine Modelle
```

## Werkzeugschleife (MCP)

Raider kann angebundene MCP-Server selbst benutzen, statt nur auf Anfrage einen
einzelnen Aufruf auszuführen — das Modell entscheidet im Gespräch, ob und welches
Werkzeug es braucht.

- **Freigabe pro Werkzeug:** Ein MCP-Server kann viele Werkzeuge anbieten; frei
  ist immer nur ein einzelnes, ausdrücklich zugelassenes Werkzeug
  (`mcp_tool_permissions` in der Datenbank, verwaltet über
  `POST/DELETE /mcp/servers/:id/permissions[/:tool]` bzw. `GET /mcp/permissions`).
  Was nicht freigegeben ist, sieht das Modell gar nicht — es taucht nicht einmal
  im Werkzeugkatalog auf, den der Anbieter bekommt (`core/src/mcp/registry.ts`).
- **Obergrenze:** Höchstens **5 Werkzeugrunden** pro Antwort
  (`MAX_TOOL_ROUNDS` in `core/src/chat/turn.ts`). Will das Modell danach immer
  noch ein Werkzeug aufrufen, bricht Raider ehrlich ab und sagt das auch in der
  Antwort.
- **Sicherheitsnetz:** Jeder angeforderte Werkzeugname wird noch einmal gegen den
  Katalog der freigegebenen Werkzeuge geprüft — ein vom Modell erfundener Name
  läuft ins Leere statt ausgeführt zu werden.
- Jeder Aufruf (ob über die Werkzeugschleife oder manuell per
  `POST /mcp/servers/:id/tools/:tool/call`) landet im Protokoll
  (`GET /tool-calls`). Der Not-Stopp sperrt beide Wege (`423`).
- Gilt für Chat, Telegram und geplante Aufgaben gleichermaßen — alle drei laufen
  über dieselbe Zug-Logik (`runSessionTurn` / `runSessionTurnStreamed`).

## Zugriffsschutz

Die lokale API ist durch ein **Zugriffstoken** geschützt. Der Core legt es beim
ersten Start selbst an:

    <Datenordner>/.access-token       (Rechte 0600 — nur du darfst es lesen)

Warum: Dass der Core nur auf `127.0.0.1` lauscht, hält fremde Geräte fern —
aber nicht andere Programme auf demselben Rechner und auch keine Webseite, die
im Browser heimlich Anfragen an `localhost` schickt. Ohne gültiges Token
antwortet die API mit `401`. Ausgenommen ist nur `GET /status`, damit
Startskripte prüfen können, ob der Core schon läuft.

Fenster und CLI holen sich das Token selbst aus dem Datenordner — du musst
nichts eintragen. Für eigene Aufrufe:

    curl -H "Authorization: Bearer $(cat ~/Raider/.access-token)" \
      http://localhost:4179/sessions

Zusätzlich nimmt die API nur Anfragen von deinem eigenen Rechner an: CORS ist
auf `localhost`/`127.0.0.1` und Aufrufe ohne Origin beschränkt. Vorher wurde
jeder Origin zurückgespiegelt.


## Anbieter

Zwei Anbieter hinter derselben internen Schnittstelle (`core/src/providers/`),
beide streamingfähig:
- **Anthropic (Claude)** — braucht einen API-Key, entweder über die Einrichtung
  im Fenster oder `ANTHROPIC_API_KEY` in `.env`.
- **Ollama** — lokale Modelle, kostenlos, kein Key. Ollama installieren
  (`ollama.com`), ein Modell laden (`ollama pull llama3.2`), dann startet der
  Core automatisch damit, solange kein Anthropic-Key gesetzt ist. Die
  Einrichtung im Fenster erkennt einen laufenden lokalen Ollama-Server und seine
  geladenen Modelle automatisch (`GET /setup/ollama`).

## Telegram

Raider vom Handy aus erreichen — abgesichert durch eine Kopplung, damit nicht
jeder Fremde, der den Bot findet, mitreden kann:

1. Bei Telegram bei **@BotFather** einen Bot anlegen und den Token entweder in
   der Einrichtung im Fenster eintragen oder als `RAIDER_TELEGRAM_TOKEN` in die
   `.env` schreiben (Letzteres hat Vorrang). Der Token bleibt im Core und wird
   nie geloggt oder über die API ausgegeben.
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

## Betrieb

Damit Raider unbeaufsichtigt laufen kann:
- **`npm run health`** zeigt den Herzschlag (DB verbunden, Anbieter, laufende
  Dienste, Not-Stopp, Laufzeit) plus Zählerstände. `GET /health` liefert `200`
  wenn gesund, sonst `503` — geeignet für einen Überwachungsdienst.
- **`npm run backup`** legt eine Sicherung der Datenbank an (better-sqlite3-
  Online-Backup, konsistent im Betrieb) und behält die letzten
  `RAIDER_BACKUP_KEEP`. `RAIDER_BACKUP_INTERVAL` schaltet automatische
  Sicherungen frei.
- Der Core loggt jede Anfrage knapp (Methode, Pfad, Status, Dauer — **nie**
  Inhalte); ein globaler Fehler-Guard macht aus einem unerwarteten Fehler eine
  saubere `500` statt eines Absturzes.
- Auf `SIGINT`/`SIGTERM` fährt der Core sauber herunter: Hintergrund-Dienste
  stoppen, WAL-Checkpoint, Datenbank schließen — wichtig als Systemdienst
  (systemd/launchd).

## API

```
GET  /status                     Version + Datenbankstatus
GET  /health                     Herzschlag (DB, Anbieter, Dienste, Not-Stopp, Laufzeit)
GET  /stats                      Zählerstände über das ganze System
POST /backup                     Datenbank-Sicherung anlegen (behält die letzten N)
GET  /backups                    Vorhandene Sicherungen auflisten
POST /chat                       Zustandsloser Einmal-Aufruf (messages im Body)
POST /sessions                   Neue Sitzung anlegen (optional agentId)
GET  /sessions                   Sitzungen auflisten
PATCH /sessions/:id              Sitzung umbenennen
DELETE /sessions/:id              Sitzung samt Nachrichten löschen
POST /sessions/:id/messages      Dialog-Zug: Verlauf → Modell (+ Werkzeugschleife) → beides speichern
GET  /sessions/:id/messages      Verlauf einer Sitzung
POST /sessions/:id/messages/stream   Wie oben, Antwort aber als Server-Sent Events (Wort für Wort)
GET  /setup                      Einrichtungsstatus (Anbieter, Modell, Key/Token gesetzt? was aus .env?)
POST /setup                      Anbieter/Key/Modell/Telegram-Token setzen (siehe Einrichtung)
GET  /setup/ollama                Lokalen Ollama-Server + Modelle erkennen
POST/GET/PATCH/DELETE /agents    Agenten anlegen, auflisten, ändern, löschen
POST /agents/:id/duplicate       Agent duplizieren
POST/GET/PATCH/DELETE /mcp/servers          MCP-Server verwalten (Secrets geschwärzt)
POST /mcp/servers/:id/test                  Verbindungstest (Werkzeuge auflisten)
GET  /mcp/permissions                       Alle Dauerfreigaben (welches Werkzeug welches Servers)
POST /mcp/servers/:id/permissions           Werkzeug dauerhaft freigeben (toolName im Body)
DELETE /mcp/servers/:id/permissions/:tool   Freigabe zurückziehen
POST /mcp/servers/:id/tools/:tool/call      Werkzeugaufruf — nur mit Freigabe (manuell, per approvedBy)
GET  /tool-calls                            Protokoll aller Werkzeugaufrufe (auch aus der Werkzeugschleife)
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
GET  /search?q=...               Volltextsuche über Nachrichten (FTS5)
```

Beide Anbieter (Anthropic und Ollama) sitzen hinter demselben Adapter, der immer
das interne Nachrichtenformat zurückgibt — nie das rohe Anbieterformat — und
beide können sowohl normal antworten als auch streamen. Gespräche liegen in
SQLite; `messages.content` ist per FTS5 durchsuchbar (Memory-Ebene 2).
