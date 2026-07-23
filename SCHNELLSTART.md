# Raider — Schnellstart

Raider läuft komplett auf **deinem** Rechner. Deine Gespräche, dein Gedächtnis
und deine Skills bleiben lokal — nichts geht in die Cloud.

## In 4 Schritten loslegen

**1. Node.js installieren** (einmalig)
Von [nodejs.org](https://nodejs.org) die **LTS**-Version laden und installieren.
Das ist die Grundlage, auf der Raider läuft.

**2. Ein Modell wählen** (eins von beiden)
- **Ollama — lokal & kostenlos** (empfohlen): [ollama.com](https://ollama.com)
  installieren, dann einmal im Terminal `ollama pull llama3.2`. Fertig.
- **Oder Claude:** die Datei `.env.example` zu `.env` kopieren und deinen
  `ANTHROPIC_API_KEY` eintragen.

**3. Raider starten**
- **Windows:** Doppelklick auf **`Raider starten (Windows).bat`**
- **Mac:** Doppelklick auf **`Raider starten (Mac).command`**
  (falls es sich nicht öffnen lässt: Rechtsklick → „Öffnen".)

Beim ersten Mal installiert der Starter automatisch die Bausteine (dauert ein
paar Minuten) und öffnet danach das Raider-Fenster. Lass das Fenster offen,
solange du Raider nutzt.

**4. Loslegen** — im Fenster über die Seitenleiste: Chat, Gedächtnis, Skills,
Aufgaben, Betrieb und mehr. Oben rechts kannst du einen Agenten wählen, unten
links auf Dunkelmodus umschalten.

## Ohne Doppelklick (im Terminal)

```bash
npm install        # einmalig
npm start          # Core + Fenster zusammen
```

Nur der Core, ohne Fenster (z. B. auf einem Server):
```bash
RAIDER_START_NO_WINDOW=1 npm start
```

Nützliche Einzelbefehle (Core muss laufen):
```bash
npm run chat       # Dialog direkt im Terminal
npm run health     # Zustand + Zählerstände
npm run backup     # Sicherung anlegen
```

## Wenn etwas klemmt

- **„Kein Core erreichbar"** im Fenster → der Core läuft nicht. Starter erneut
  ausführen bzw. `npm start` im Projektordner.
- **Keine Modell-Antwort** → Ollama installiert und `ollama pull llama3.2`
  gemacht? Oder einen gültigen `ANTHROPIC_API_KEY` in `.env`?
- **Port belegt** → in `.env` einen anderen `RAIDER_PORT` setzen (aber **nicht**
  4190 — den sperren Browser).

## Rund um die Uhr laufen lassen

Wenn Raider dauerhaft im Hintergrund laufen soll (auch nach Neustart), gibt es
fertige Vorlagen unter [`deploy/`](deploy/) für Linux (systemd) und macOS
(launchd).
