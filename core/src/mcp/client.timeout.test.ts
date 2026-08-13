import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { createMcpRunner } from "./client";
import type { McpServerConfig } from "./types";

/*
 * Ein MCP-Server, der einfach nichts sagt. Genau das ist der Fall, der Raider
 * vorher zum Stillstand gebracht hat: Der Prozess startet, das Fenster zeigt
 * „Schreibt…", und niemand antwortet je. Diese Tests belegen, dass daraus
 * jetzt ein Fehler nach wenigen Hundert Millisekunden wird statt einer Ewigkeit.
 *
 * Der Testserver beendet sich, sobald seine Eingabe geschlossen wird — so wie
 * ein gutmütiger echter Server auch. Nur der bösartige Fall (Test ganz unten)
 * ignoriert das und muss abgeschossen werden.
 */
function stummerServer(name: string, hartnaeckig = false): McpServerConfig {
  const skript = hartnaeckig
    ? // Ignoriert das Ende der Eingabe UND SIGTERM — nur SIGKILL hilft noch.
      "process.stdin.resume(); process.on('SIGTERM', () => {}); setInterval(() => {}, 1000);"
    : "process.stdin.resume(); process.stdin.on('end', () => process.exit(0)); setInterval(() => {}, 1000);";
  return {
    id: 1,
    name,
    type: "stdio",
    command: process.execPath,
    args: ["-e", skript],
    url: null,
    env: {},
    enabled: true,
  };
}

/** Läuft der Prozess mit dieser PID noch? */
function laeuftNoch(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

describe("Zeitgrenzen für MCP-Server", () => {
  it("bricht ab, wenn ein Server die Verbindung nie bestätigt", async () => {
    const runner = createMcpRunner({ connectMs: 300 });
    const started = Date.now();

    await expect(runner.listTools(stummerServer("Stummer Server"))).rejects.toThrow(
      /Stummer Server/,
    );

    // Der entscheidende Teil: Es geht schnell. Ohne Zeitgrenze liefe der Aufruf
    // hier bis zum Ende des Programms — und mit ihm der ganze Dialog-Zug.
    expect(Date.now() - started).toBeLessThan(5_000);
  });

  it("bricht einen Werkzeugaufruf ab, statt den Zug hängen zu lassen", async () => {
    const runner = createMcpRunner({ connectMs: 300, callMs: 300 });
    const started = Date.now();

    await expect(
      runner.callTool(stummerServer("Stummer Server"), "lies_datei", {}),
    ).rejects.toThrow();

    expect(Date.now() - started).toBeLessThan(5_000);
  });

  it("nennt in der Fehlermeldung den Server und die Wartezeit", async () => {
    const runner = createMcpRunner({ connectMs: 250 });

    // Die Meldung landet als Werkzeugergebnis im Gespräch — sie muss für einen
    // Menschen lesbar sein, nicht nur für ein Protokoll.
    await expect(runner.listTools(stummerServer("Dateien"))).rejects.toThrow(
      /Dateien.*nicht angenommen.*Sekunden/s,
    );
  });

  it("lässt keinen Server-Prozess zurück, auch wenn der sich wehrt", async () => {
    // Ohne diesen Schutz sammelt sich bei jedem misslungenen Verbindungsversuch
    // ein Prozess auf dem Rechner des Nutzers an, den niemand je wieder aufräumt.
    // Der Testserver ignoriert sowohl das Ende der Eingabe als auch SIGTERM.
    const vorher = new Set(kinderPids());
    const runner = createMcpRunner({ connectMs: 400 });

    const lauf = runner.listTools(stummerServer("Sturkopf", true));

    // Während noch verbunden wird: Der Prozess muss jetzt wirklich laufen,
    // sonst prüft der Rest des Tests nichts.
    await warte(200);
    const neue = kinderPids().filter((pid) => !vorher.has(pid));
    expect(neue.length).toBeGreaterThan(0);

    await expect(lauf).rejects.toThrow();

    // Dem SDK seine Eskalation (SIGTERM → SIGKILL) zu Ende gehen lassen.
    await warte(5_000);
    expect(neue.filter(laeuftNoch)).toEqual([]);
  }, 30_000);
});

function warte(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** PIDs der eigenen Kindprozesse (nur unter Linux; sonst leere Liste). */
function kinderPids(): number[] {
  try {
    return readdirSync("/proc")
      .filter((entry) => /^\d+$/.test(entry))
      .filter((entry) => {
        try {
          return readFileSync(`/proc/${entry}/status`, "utf8").includes(`PPid:\t${process.pid}\n`);
        } catch {
          return false;
        }
      })
      .map(Number);
  } catch {
    return [];
  }
}
