#!/usr/bin/env node
/*
 * Ein-Befehl-Start: fährt den Core hoch, wartet bis er bereit ist, baut bei
 * Bedarf die Oberfläche und öffnet das Fenster. Nur Node-Bordmittel, keine
 * Zusatzpakete. Mit RAIDER_START_NO_WINDOW=1 wird nur der Core gestartet
 * (praktisch für einen Server ohne Bildschirm).
 */
import { spawn, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const port = process.env.RAIDER_PORT ? Number(process.env.RAIDER_PORT) : 4179;
const withWindow = process.env.RAIDER_START_NO_WINDOW !== "1";
const children = [];

function run(command, args, opts = {}) {
  const child = spawn(command, args, { cwd: root, stdio: "inherit", shell: true, ...opts });
  children.push(child);
  return child;
}

function stopAll() {
  for (const child of children) {
    try {
      child.kill();
    } catch {
      // schon beendet
    }
  }
}
process.on("SIGINT", () => {
  stopAll();
  process.exit(0);
});
process.on("SIGTERM", () => {
  stopAll();
  process.exit(0);
});

async function waitForCore(timeoutMs = 40_000) {
  const until = Date.now() + timeoutMs;
  while (Date.now() < until) {
    try {
      const res = await fetch(`http://localhost:${port}/status`);
      if (res.ok) return true;
    } catch {
      // noch nicht bereit
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  return false;
}

async function main() {
  console.log("Raider startet den Core …");
  const core = run("npm", ["run", "dev"]);
  core.on("exit", (code) => {
    console.log(`Core beendet (${code}).`);
    stopAll();
    process.exit(code ?? 0);
  });

  if (!withWindow) {
    console.log(`Core läuft auf http://localhost:${port} (ohne Fenster).`);
    return;
  }

  const ready = await waitForCore();
  if (!ready) {
    console.error("Core nicht erreichbar — breche den Fensterstart ab.");
    return;
  }

  if (!existsSync(join(root, "desktop", "dist", "index.html"))) {
    console.log("Baue die Oberfläche …");
    const build = spawnSync("npm", ["run", "build", "-w", "@raider/desktop"], {
      cwd: root,
      stdio: "inherit",
      shell: true,
    });
    if (build.status !== 0) {
      console.error("Bau der Oberfläche fehlgeschlagen.");
      return;
    }
  }

  console.log("Öffne das Raider-Fenster …");
  const win = run("npm", ["run", "start", "-w", "@raider/desktop"]);
  win.on("exit", () => {
    stopAll();
    process.exit(0);
  });
}

void main();
