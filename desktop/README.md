# @raider/desktop

Electron-Fenster gegen **denselben Core** wie alle anderen Clients. Der Renderer
(React) ist bewusst dumm: anzeigen und die lokale API rufen — die Logik (Verlauf,
Modellaufruf, Freigabe, Zeitplan, Betrieb) steckt im Core.

Reiter: **Chat · Agenten · Werkzeuge · Gedächtnis · Skills · Posteingang ·
Aufgaben · Suche · Telegram · Betrieb · Einstellungen.** Damit ist alles, was der
Core kann, auch im Fenster bedienbar. Ein Reiter lässt sich per `?tab=<Name>`
direkt vorwählen (Deep-Link).

Der Reiter **Einstellungen** zeigt die Konfiguration nur an und erklärt die
Umgebungsvariablen — der API-Key wird bewusst nie in der Oberfläche gespeichert
oder angezeigt.

## Aufbau

| Datei | Rolle |
|---|---|
| `electron/main.cjs` | Hauptprozess: öffnet das Fenster, lädt den Renderer |
| `electron/preload.cjs` | reicht dem Renderer nur die Core-Basis-URL herein |
| `src/App.tsx` | Reiter-Hülle |
| `src/panels/` | ein Panel je Reiter, nutzt den gemeinsamen Client aus `@raider/shared` |
| `src/ui.ts` | gemeinsame Stile und kleine Helfer |

## Starten (auf deinem Rechner mit Bildschirm)

```
# Terminal 1 — der Core
npm run dev

# Terminal 2 — Renderer bauen und Fenster öffnen
npm run build -w @raider/desktop
npm run start -w @raider/desktop
```

Für die Entwicklung mit Live-Reload:

```
npm run dev -w @raider/desktop           # Vite-Server auf :5173
VITE_DEV_SERVER_URL=http://localhost:5173 npm run start -w @raider/desktop
```

Für eine echte Modell-Antwort muss `ANTHROPIC_API_KEY` gesetzt sein.

> Hinweis: In der headless-Cloud-Umgebung lässt sich das Electron-Fenster nicht
> öffnen. Verifiziert wurden dort Build und Typecheck sowie die gerenderte
> Oberfläche selbst — der gebaute Renderer wurde in einem echten (headless)
> Chromium gegen einen laufenden Core geladen und alle Reiter geprüft. Das
> Electron-Fenster startet auf einem Rechner mit Oberfläche.
