// Preload: reicht dem Renderer nur die Core-Basis-URL und das Zugriffstoken
// herein — sonst nichts. Der Renderer bleibt dumm und redet über die lokale API.
const { contextBridge } = require("electron");

const port = process.env.RAIDER_PORT || "4179";

// Das Token kommt als Startargument aus dem Hauptprozess (der darf Dateien
// lesen, der Renderer nicht). Ohne Token laeuft die Oberflaeche weiter, bekommt
// vom Core dann aber eine klare 401 statt stiller Fehler.
const tokenArg = process.argv.find((arg) => arg.startsWith("--raider-token="));
const accessToken = tokenArg ? tokenArg.slice("--raider-token=".length) : "";

contextBridge.exposeInMainWorld("raider", {
  coreBaseUrl: `http://localhost:${port}`,
  accessToken,
});
