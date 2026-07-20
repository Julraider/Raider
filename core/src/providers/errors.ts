/** Fehler eines Anbieteraufrufs mit HTTP-Status. */
export class ProviderError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "ProviderError";
    this.status = status;
  }
}

/** Wird geworfen, wenn ein Anbieter einen API-Key braucht, aber keiner gesetzt ist. */
export class MissingApiKeyError extends Error {
  constructor() {
    super("Kein API-Key gesetzt (ANTHROPIC_API_KEY).");
    this.name = "MissingApiKeyError";
  }
}
