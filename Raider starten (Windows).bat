@echo off
REM Doppelklick-Starter fuer Windows. Installiert beim ersten Mal die Bausteine
REM und startet dann Raider (Core + Fenster). Voraussetzung: Node.js ist
REM installiert (nodejs.org). Fenster offen lassen, solange du Raider nutzt.
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo Node.js ist nicht installiert. Bitte zuerst von https://nodejs.org die
  echo LTS-Version installieren und diese Datei danach erneut doppelklicken.
  echo.
  pause
  exit /b 1
)

if not exist "node_modules" (
  echo Installiere die Bausteine ^(einmalig, dauert ein paar Minuten^) ...
  call npm install
)

echo Starte Raider ...
call npm start
echo.
echo Raider wurde beendet.
pause
