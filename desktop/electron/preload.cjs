// Preload: reicht dem Renderer nur die Core-Basis-URL herein — sonst nichts.
// Der Renderer bleibt dumm und redet über die lokale API.
const { contextBridge } = require("electron");

const port = process.env.RAIDER_PORT || "4179";

contextBridge.exposeInMainWorld("raider", {
  coreBaseUrl: `http://localhost:${port}`,
});
