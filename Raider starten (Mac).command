#!/bin/bash
# Doppelklick-Starter für macOS/Linux. Installiert beim ersten Mal die Bausteine
# und startet dann Raider (Core + Fenster). Voraussetzung: Node.js ist
# installiert (nodejs.org). Fenster offen lassen, solange du Raider nutzt.
cd "$(dirname "$0")" || exit 1

if ! command -v node >/dev/null 2>&1; then
  echo
  echo "Node.js ist nicht installiert. Bitte zuerst von https://nodejs.org die"
  echo "LTS-Version installieren und diese Datei danach erneut doppelklicken."
  echo
  read -r -p "Mit Enter schließen…" _
  exit 1
fi

if [ ! -d node_modules ]; then
  echo "Installiere die Bausteine (einmalig, dauert ein paar Minuten) …"
  npm install
fi

echo "Starte Raider …"
npm start
