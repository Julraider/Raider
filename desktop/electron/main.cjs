// Electron-Hauptprozess. Öffnet das Fenster und lädt den Renderer. Bewusst
// CommonJS (.cjs), damit es ohne Build-Schritt auf jedem Rechner läuft.
const { app, BrowserWindow } = require("electron");
const { existsSync, readFileSync } = require("node:fs");
const { homedir } = require("node:os");
const { join } = require("node:path");

/**
 * Liest das Zugriffstoken des Cores. Es liegt im Datenordner und schuetzt die
 * lokale API davor, dass andere Programme auf dem Rechner sie benutzen.
 * Der Renderer darf keine Dateien lesen — deshalb macht das der Hauptprozess
 * und reicht das Token als Startargument an das Preload weiter.
 */
function readAccessToken() {
  const dataDir = process.env.RAIDER_DATA_DIR || join(homedir(), "Raider");
  const path = join(dataDir, ".access-token");
  try {
    return existsSync(path) ? readFileSync(path, "utf8").trim() : "";
  } catch {
    return "";
  }
}

// Im Dev-Modus per Umgebungsvariable auf den Vite-Server zeigen, sonst das
// gebaute index.html laden.
const devServerUrl = process.env.VITE_DEV_SERVER_URL;

function createWindow() {
  const win = new BrowserWindow({
    width: 1000,
    height: 720,
    // Unterhalb dieser Größe drängeln sich Seitenleiste, Verlaufsliste und
    // Inhalt um denselben Platz und die Bedienelemente überlagern sich.
    minWidth: 860,
    minHeight: 560,
    webPreferences: {
      preload: join(__dirname, "preload.cjs"),
      additionalArguments: [`--raider-token=${readAccessToken()}`],
      // Ausdrücklich gesetzt statt auf die Vorgaben zu vertrauen: Die
      // Oberfläche braucht keinerlei Node-Zugriff, sie spricht nur über die
      // schmale Preload-Brücke mit dem Core.
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  if (devServerUrl) {
    win.loadURL(devServerUrl);
  } else {
    win.loadFile(join(__dirname, "..", "dist", "index.html"));
  }
}

app.whenReady().then(() => {
  createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
