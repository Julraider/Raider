# @raider/cli

Client am Core, redet ausschließlich über die lokale API — nie direkt mit
Datenbank oder Anbieter.

```
npm run dev                  # Terminal 1: Core starten
npm run ask -- "deine Frage" # Terminal 2: einmalige Frage (Schritt 2)
npm run chat                 # Terminal 2: fortlaufender Dialog (Schritt 3)
```

Im Chat: `/help`, `/reset`, `/model <id>`, `/exit`. Der Verlauf lebt im
Speicher der Sitzung; der Core bleibt zustandslos (DB-Sitzungen kommen in
Schritt 4).

Voraussetzung für eine echte Antwort: `ANTHROPIC_API_KEY` in der Umgebung.
