/**
 * Ordnet häufigen HTTP-Status-Codes eine für Laien verständliche deutsche
 * Erklärung zu. Der Nutzer ist kein Entwickler — ein roher Anbietertext wie
 * "invalid x-api-key" oder "rate_limit_error" hilft ihm nicht weiter, eine
 * konkrete Handlungsanweisung schon.
 */
function describeStatus(status: number): string | undefined {
  if (status === 401 || status === 403) {
    return "Der hinterlegte Schlüssel wurde nicht akzeptiert. Prüf ihn in der Datei .env.";
  }
  if (status === 429) {
    return "Zu viele Anfragen in kurzer Zeit. Warte einen Moment und versuch es erneut.";
  }
  if (status >= 500 && status <= 504) {
    return "Der Anbieter hat gerade ein Problem. Das liegt nicht an dir — versuch es später noch einmal.";
  }
  return undefined;
}

/** Fehler eines Anbieteraufrufs mit HTTP-Status und laienverständlicher Meldung. */
export class ProviderError extends Error {
  readonly status: number;
  /**
   * Die rohe, technische Ursache (Anbietertext oder Ausnahme) — für Logs und
   * Diagnose gedacht, nicht zur Anzeige an den Nutzer. Die geht in `message`,
   * damit sie nicht verlorengeht, auch wenn `message` selbst laienverständlich
   * formuliert ist.
   */
  readonly technicalMessage: string;

  /**
   * `friendlyMessage` überschreibt die automatische Zuordnung nach Status —
   * für Fälle, in denen der Aufrufer bereits einen passenderen, verständlichen
   * Text kennt (z. B. Zeitüberschreitung oder „Ollama nicht erreichbar").
   */
  constructor(status: number, technicalMessage: string, friendlyMessage?: string) {
    super(friendlyMessage ?? describeStatus(status) ?? technicalMessage);
    this.name = "ProviderError";
    this.status = status;
    this.technicalMessage = technicalMessage;
  }
}

/** Wird geworfen, wenn ein Anbieter einen API-Key braucht, aber keiner gesetzt ist. */
export class MissingApiKeyError extends Error {
  constructor() {
    super("Kein API-Key gesetzt (ANTHROPIC_API_KEY).");
    this.name = "MissingApiKeyError";
  }
}

/**
 * Ob ein Status eindeutig vorübergehend ist und einen erneuten Versuch
 * rechtfertigt. Bewusst eng gefasst: Alles andere (insbesondere 4xx außer
 * 429) deutet auf ein Problem hin, das ein erneuter Versuch nicht behebt.
 */
export function isRetryableStatus(status: number): boolean {
  return status === 429 || (status >= 500 && status <= 504);
}

/**
 * Wartezeiten vor dem 1. bzw. 2. Wiederholungsversuch — kurz gehalten, damit
 * der Nutzer nicht unnötig lange auf eine Antwort wartet, aber lang genug,
 * damit ein kurzer Ausfall beim Anbieter Zeit zum Erholen hat.
 */
const RETRY_DELAYS_MS = [500, 1500];

/** Höchstzahl an Wiederholungen (nicht Versuche insgesamt) für nicht-streamende Aufrufe. */
export const MAX_RETRIES = RETRY_DELAYS_MS.length;

/**
 * Ermittelt die Wartezeit vor dem nächsten Versuch. Beachtet `Retry-After`,
 * wenn der Anbieter ihn mitschickt — der kennt seine eigene Erholzeit besser
 * als unsere pauschalen Vorgaben.
 */
export function retryDelayMs(attempt: number, retryAfterHeader?: string | null): number {
  const suggested = parseRetryAfter(retryAfterHeader);
  if (suggested !== undefined) return suggested;
  const last = RETRY_DELAYS_MS[RETRY_DELAYS_MS.length - 1] ?? 1500;
  return RETRY_DELAYS_MS[attempt] ?? last;
}

/** `Retry-After` ist laut HTTP entweder eine Sekundenzahl oder ein Datum. */
function parseRetryAfter(header?: string | null): number | undefined {
  if (!header) return undefined;
  const seconds = Number(header);
  if (Number.isFinite(seconds) && seconds >= 0) return seconds * 1000;
  const date = Date.parse(header);
  if (!Number.isNaN(date)) return Math.max(0, date - Date.now());
  return undefined;
}
