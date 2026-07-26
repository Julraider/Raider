// Electron-Hauptprozess. Öffnet das Fenster und lädt den Renderer. Bewusst
// CommonJS (.cjs), damit es ohne Build-Schritt auf jedem Rechner läuft.
const { app, BrowserWindow } = require("electron");
const { join } = require("node:path");

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
