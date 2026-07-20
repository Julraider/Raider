# @raider/desktop

Electron-Fenster mit Chat gegen **denselben Core** wie alle anderen Clients.
Der Renderer (React) ist bewusst dumm: anzeigen und die lokale API rufen — die
Logik (Verlauf, Modellaufruf, Speicherung) steckt im Core.

## Aufbau

| Datei | Rolle |
|---|---|
| `electron/main.cjs` | Hauptprozess: öffnet das Fenster, lädt den Renderer |
| `electron/preload.cjs` | reicht dem Renderer nur die Core-Basis-URL herein |
| `src/` | React-Chat, nutzt den gemeinsamen Client aus `@raider/shared` |

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

> Hinweis: In der headless-Cloud-Umgebung, in der dieses Projekt gebaut wurde,
> lässt sich kein Fenster öffnen (kein Bildschirm, Electron-Binary gesperrt).
> Verifiziert wurden dort der Renderer-Build, Typecheck und der gemeinsame
> Client; das Fenster selbst startet auf einem Rechner mit Oberfläche.
