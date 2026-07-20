# @raider/cli

Client am Core, redet ausschließlich über die lokale API — nie direkt mit
Datenbank oder Anbieter.

Aktuell (Schritt 2) kann er genau eine Frage stellen:

```
npm run dev                 # Terminal 1: Core starten
npm run ask -- "deine Frage" # Terminal 2: fragen
```

Voraussetzung für eine echte Antwort: `ANTHROPIC_API_KEY` in der Umgebung.
Der interaktive CLI-Chat kommt in Schritt 3.
