/** Vom Preload bereitgestellte Brücke (nur die Core-URL). */
interface RaiderBridge {
  coreBaseUrl: string;
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
