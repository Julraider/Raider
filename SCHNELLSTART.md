# Raider — Schnellstart

Raider läuft komplett auf **deinem** Rechner. Deine Gespräche, dein Gedächtnis
und deine Skills bleiben lokal — nichts geht in die Cloud.

## In 3 Schritten loslegen

**1. Node.js installieren** (einmalig)
Von [nodejs.org](https://nodejs.org) die **LTS**-Version laden und installieren.
Das ist die Grundlage, auf der Raider läuft.

**2. Raider starten**
- **Windows:** Doppelklick auf **`Raider starten (Windows).bat`**
- **Mac:** Doppelklick auf **`Raider starten (Mac).command`**
  (falls es sich nicht öffnen lässt: Rechtsklick → „Öffnen".)

Beim ersten Mal installiert der Starter automatisch die Bausteine (dauert ein
paar Minuten) und öffnet danach das Raider-Fenster. Lass das Fenster offen,
solange du Raider nutzt.

**3. Einrichten — direkt im Fenster**
Beim allerersten Start meldet sich Raider selbst mit einer kurzen Einrichtung
und fragt, womit es antworten soll:
- **Ollama — lokal & kostenlos** (empfohlen, wenn du es dir einfach machen
  willst): [ollama.com](https://ollama.com) installieren, dann einmal im
  Terminal `ollama pull llama3.2` ausführen. Raider erkennt Ollama danach von
  selbst.
- **Oder Claude:** deinen Schlüssel (von console.anthropic.com) direkt in das
  Feld eintragen. Er wird nur auf deinem Rechner gespeichert und nirgendwo
  angezeigt.

Danach ist Raider einsatzbereit — kein Neustart nötig. Die Einrichtung lässt
sich später jederzeit über „Einstellungen" in der Seitenleiste ändern.

**Loslegen** — im Fenster über die Seitenleiste: Chat, Gedächtnis, Skills,
Aufgaben, Betrieb und mehr. Unten links kannst du auf Dunkelmodus umschalten.

## Für Fortgeschrittene: Einrichtung über eine Datei

Wer lieber mit einer Konfigurationsdatei arbeitet (oder Raider unbeaufsichtigt
auf einem Server betreiben will), kann `.env.example` zu `.env` kopieren und
dort z. B. `ANTHROPIC_API_KEY` eintragen. Das ist **nicht** der normale Weg für
den Einstieg — die Einrichtung im Fenster reicht für die allermeisten. Wichtig:
Ist ein Wert in `.env` gesetzt, hat er immer Vorrang vor dem, was im Fenster
eingestellt wurde, und das entsprechende Feld dort lässt sich dann nicht mehr
ändern.

## Ohne Doppelklick (im Terminal)

```bash
npm install        # einmalig
npm start          # Hintergrundprogramm + Fenster zusammen
```

Nur das Hintergrundprogramm, ohne Fenster (z. B. auf einem Server):
```bash
RAIDER_START_NO_WINDOW=1 npm start
```

Nützliche Einzelbefehle (das Hintergrundprogramm muss dafür schon laufen):
```bash
npm run chat       # Dialog direkt im Terminal
npm run health     # Zustand + Zählerstände
npm run backup     # Sicherung anlegen
```

## Wenn etwas klemmt

- **Fenster zeigt „Getrennt" oder eine Meldung, dass nichts erreichbar ist** →
  das Hintergrundprogramm läuft nicht (mehr). Starter erneut ausführen bzw.
  `npm start` im Projektordner.
- **Keine Modell-Antwort** → Ollama installiert und `ollama pull llama3.2`
  gemacht? Oder in der Einrichtung (bzw. in `.env`) einen gültigen Claude-
  Schlüssel eingetragen?
- **Port belegt** → in `.env` einen anderen `RAIDER_PORT` setzen (aber **nicht**
  4190 — den sperren Browser). Den Port stellt nur `.env` ein, nicht das
  Fenster.

## Rund um die Uhr laufen lassen

Wenn Raider dauerhaft im Hintergrund laufen soll (auch nach Neustart), gibt es
fertige Vorlagen unter [`deploy/`](deploy/) für Linux (systemd) und macOS
(launchd).
