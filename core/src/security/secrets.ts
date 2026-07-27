import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

/**
 * Geheimnisse, die der Nutzer in der Oberfläche eingibt (API-Schlüssel,
 * Telegram-Token).
 *
 * Warum es diese Datei gibt: Bisher liessen sich Schlüssel nur in `.env`
 * eintragen — also mit einem Texteditor im Programmordner und anschliessendem
 * Neustart. Für jemanden, der kein Entwickler ist, endet die Einrichtung damit
 * vor der ersten Nachricht.
 *
 * Bewusste Abgrenzung: Diese Datei gehört dem Programm. `.env` und
 * `~/Raider/.keys` gehören dem Nutzer und werden von Raider niemals gelesen
 * oder geschrieben. Ein in der Umgebung gesetzter Wert hat immer Vorrang —
 * wer schon eine `.env` pflegt, merkt von dieser Datei nichts.
 *
 * Die Werte stehen im Klartext, geschützt durch Dateirechte 0600 (nur der
 * eigene Benutzer darf lesen) — dasselbe Schutzniveau wie `.env` heute. Eine
 * echte Verschlüsselung bräuchte den Schlüsselbund des Betriebssystems; das ist
 * hier ausdrücklich nicht angefasst.
 */

/** Dateiname im Datenordner. Der Punkt versteckt sie unter Unix. */
const SECRETS_FILE = ".secrets";

/** Was in der Datei stehen darf. Alles optional. */
export interface StoredSecrets {
  /** API-Schlüssel für Claude. */
  anthropicApiKey?: string;
  /** Bot-Token für Telegram. */
  telegramToken?: string;
  /** Welcher Anbieter antworten soll. */
  provider?: "anthropic" | "ollama";
  /** Abweichendes Modell, falls der Nutzer eines gewählt hat. */
  model?: string;
}

/** Pfad der Geheimnis-Datei zu einem Datenordner. */
export function secretsPath(dataDir: string): string {
  return join(dataDir, SECRETS_FILE);
}

/** Liest die gespeicherten Geheimnisse; fehlt die Datei, ist alles leer. */
export function readSecrets(dataDir: string): StoredSecrets {
  const path = secretsPath(dataDir);
  if (!existsSync(path)) return {};
  try {
    const parsed = JSON.parse(readFileSync(path, "utf8")) as unknown;
    if (!parsed || typeof parsed !== "object") return {};
    return parsed as StoredSecrets;
  } catch {
    // Kaputte Datei darf den Start nicht verhindern.
    return {};
  }
}

/**
 * Schreibt geänderte Werte und lässt alles andere stehen. Ein leerer String
 * löscht den jeweiligen Eintrag — so kann der Nutzer einen Schlüssel auch
 * wieder entfernen.
 */
export function writeSecrets(dataDir: string, patch: StoredSecrets): StoredSecrets {
  const merged: StoredSecrets = { ...readSecrets(dataDir) };
  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined) continue;
    if (value === "") delete merged[key as keyof StoredSecrets];
    else Object.assign(merged, { [key]: value });
  }

  const path = secretsPath(dataDir);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(merged, null, 2)}\n`, {
    encoding: "utf8",
    mode: 0o600,
  });
  try {
    chmodSync(path, 0o600);
  } catch {
    // Ohne Unix-Rechte (Windows) schützt die Lage im Benutzerprofil.
  }
  return merged;
}

/**
 * Löst einen Wert auf: Umgebung zuerst, dann die gespeicherte Datei.
 *
 * Diese Reihenfolge ist wichtig — wer `.env` pflegt, soll dadurch nicht
 * plötzlich einen anderen Schlüssel benutzen, nur weil in der Oberfläche einmal
 * etwas eingetragen wurde.
 */
export function resolveSecret(
  fromEnv: string | undefined,
  fromFile: string | undefined,
): string | undefined {
  const env = fromEnv?.trim();
  if (env) return env;
  const file = fromFile?.trim();
  return file ? file : undefined;
}
