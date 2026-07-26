/** Vom Preload bereitgestellte Brücke (Core-URL und Zugriffstoken). */
interface RaiderBridge {
  coreBaseUrl: string;
  accessToken?: string;
}

declare global {
  interface Window {
    raider?: RaiderBridge;
  }
}

/**
 * Basis-URL des Cores. In Electron reicht das Preload sie herein; im Browser
 * (Dev/Test) fällt sie auf den Standard-Port zurück.
 */
export function coreBaseUrl(): string {
  return window.raider?.coreBaseUrl ?? "http://localhost:4179";
}

/**
 * Zugriffstoken für die lokale API. In Electron kommt es aus dem Preload (der
 * Hauptprozess liest es aus dem Datenordner).
 *
 * Der Rückfall auf `?token=` gilt nur für die Entwicklung und für automatische
 * Bildschirmfotos im Browser — dort gibt es kein Preload. Im ausgelieferten
 * Programm läuft die Oberfläche über `file://`, wo niemand von außen eine
 * Adresse setzen kann.
 */
export function coreAccessToken(): string | undefined {
  const fromBridge = window.raider?.accessToken;
  if (fromBridge) return fromBridge;
  const fromUrl = new URLSearchParams(window.location.search).get("token");
  return fromUrl ?? undefined;
}
