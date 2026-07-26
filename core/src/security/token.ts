import { randomBytes } from "node:crypto";
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

/**
 * Zugriffstoken für die lokale API.
 *
 * Warum das nötig ist: Der Core lauscht ohne Passwort auf einem lokalen Port.
 * Dass er nur auf 127.0.0.1 hört, hält zwar fremde Geräte fern, aber nicht
 * anderes Programm auf demselben Rechner — und auch keine Webseite, die im
 * Browser des Nutzers heimlich Anfragen an localhost schickt. Ein Token, das
 * nur lokal lesbar in einer Datei liegt, schließt beide Lücken: Wer die Datei
 * nicht lesen darf, kommt nicht an die Gespräche.
 *
 * Bewusst NICHT in `.env` oder `~/Raider/.keys` abgelegt — diese Dateien
 * gehören dem Nutzer und werden vom Programm nie geschrieben.
 */

/** Dateiname im Datenordner. Der Punkt versteckt sie unter Unix. */
const TOKEN_FILE = ".access-token";

/** Pfad der Token-Datei zu einem Datenordner. */
export function tokenPath(dataDir: string): string {
  return join(dataDir, TOKEN_FILE);
}

/**
 * Liest das Token oder legt beim ersten Start eines an. Die Datei bekommt
 * Rechte 0600 (nur der eigene Benutzer darf lesen) — unter Windows ohne
 * Wirkung, dort schützt die Lage im Benutzerprofil.
 */
export function ensureAccessToken(dataDir: string): string {
  const path = tokenPath(dataDir);

  if (existsSync(path)) {
    const existing = readFileSync(path, "utf8").trim();
    if (existing !== "") return existing;
  }

  const token = randomBytes(32).toString("base64url");
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${token}\n`, { encoding: "utf8", mode: 0o600 });
  try {
    chmodSync(path, 0o600);
  } catch {
    // Auf Dateisystemen ohne Unix-Rechte (Windows) nicht weiter tragisch.
  }
  return token;
}

/**
 * Liest ein vorhandenes Token, ohne eines anzulegen — für Clients (CLI,
 * Electron), die sich beim laufenden Core anmelden wollen.
 */
export function readAccessToken(dataDir: string): string | undefined {
  const path = tokenPath(dataDir);
  if (!existsSync(path)) return undefined;
  const token = readFileSync(path, "utf8").trim();
  return token === "" ? undefined : token;
}

/**
 * Vergleicht zwei Token in konstanter Zeit, damit sich das richtige Token nicht
 * über Laufzeitunterschiede Zeichen für Zeichen erraten lässt.
 */
export function tokensMatch(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
