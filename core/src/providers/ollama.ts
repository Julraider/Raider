import type { ChatRequest, ChatResponse } from "@raider/shared";
import { isRetryableStatus, MAX_RETRIES, ProviderError, retryDelayMs } from "./errors";
import { type Provider, readJsonLines, type StreamChunk } from "./provider";

/**
 * Adapter für lokale Modelle über Ollama (https://ollama.com). Läuft ohne
 * API-Key auf dem eigenen Rechner. Gibt wie jeder Adapter das interne
 * Nachrichtenformat zurück, nie das rohe Anbieterformat.
 */

export interface OllamaConfig {
  /** Basis-URL des lokalen Ollama-Servers. */
  baseUrl: string;
  defaultModel: string;
  /** Obergrenze der Antwort-Tokens (Ollama: options.num_predict). */
  defaultMaxTokens: number;
  /** Zeitlimit für eine nicht-streamende Antwort in ms (Vorgabe 120000). */
  requestTimeoutMs?: number;
  /** Zeitlimit bis zum ersten Streaming-Stück in ms (Vorgabe 60000). */
  streamConnectTimeoutMs?: number;
  /** Höchste erlaubte Pause zwischen zwei Streaming-Stücken in ms (Vorgabe 60000). */
  streamIdleTimeoutMs?: number;
}

/** Vorgabewerte für die Zeitlimits — überschreibbar über die Config. */
const DEFAULT_REQUEST_TIMEOUT_MS = 120_000;
const DEFAULT_STREAM_CONNECT_TIMEOUT_MS = 60_000;
const DEFAULT_STREAM_IDLE_TIMEOUT_MS = 60_000;

/** Rohe Antwortstruktur von Ollamas /api/chat — nur modulintern. */
interface RawOllamaResponse {
  model?: string;
  message?: { role: string; content: string };
  done_reason?: string;
  prompt_eval_count?: number;
  eval_count?: number;
}

export function createOllamaProvider(config: OllamaConfig): Provider {
  return {
    complete: (request) => complete(config, request),
    stream: (request) => stream(config, request),
  };
}

/** Nachrichtenliste im Ollama-Format (die Rolle „system" versteht es direkt). */
function buildMessages(request: ChatRequest): Array<{ role: string; content: string }> {
  return [
    ...(request.system ? [{ role: "system", content: request.system }] : []),
    ...request.messages.map((message) => ({ role: message.role, content: message.content })),
  ];
}

/** Node/Browser markieren einen abgebrochenen fetch/read so — modulintern geprüft. */
function isAbortError(err: unknown): boolean {
  return err instanceof Error && err.name === "AbortError";
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Rennt ein Promise gegen ein Zeitlimit. Läuft die Zeit ab, wird der zugehörige
 * AbortController ausgelöst — nicht nur, um das Promise „aufzugeben", sondern
 * damit die zugrunde liegende Verbindung wirklich geschlossen wird und nicht
 * als hängender Socket weiterlebt. In beiden Fällen (unser eigener Abbruch
 * oder ein zufällig gleichzeitiger AbortError aus dem Promise selbst) kommt
 * am Ende dieselbe laienverständliche Zeitüberschreitungs-Meldung heraus statt
 * einer rohen `AbortError`-Ausnahme.
 */
async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  controller: AbortController,
): Promise<T> {
  const timeoutError = new ProviderError(
    504,
    `Keine Antwort innerhalb von ${timeoutMs} ms erhalten.`,
    "Der Anbieter hat zu lange nicht geantwortet.",
  );
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      reject(timeoutError);
    }, timeoutMs);
  });
  try {
    return await Promise.race([promise, timeout]);
  } catch (err) {
    if (err === timeoutError || isAbortError(err)) throw timeoutError;
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Reicht die Stücke eines Async-Iterables durch, bricht aber ab, wenn zwischen
 * zwei Stücken zu viel Zeit vergeht. WICHTIG: Das Zeitlimit gilt je Stück, nie
 * für die Gesamtdauer — eine lange, aber stetig fließende Antwort ist legitim,
 * nur eine Pause ohne jedes Lebenszeichen deutet auf einen toten Anbieter hin.
 * Das erste Stück bekommt sein eigenes (meist großzügigeres) Zeitlimit, weil
 * Verbindungsaufbau und erste Modellausgabe länger dauern können als die Pause
 * zwischen zwei bereits laufenden Stücken.
 */
async function* withChunkTimeout<T>(
  source: AsyncIterable<T>,
  firstTimeoutMs: number,
  idleTimeoutMs: number,
  controller: AbortController,
): AsyncGenerator<T> {
  const iterator = source[Symbol.asyncIterator]();
  try {
    let timeoutMs = firstTimeoutMs;
    while (true) {
      const step = await withTimeout(iterator.next(), timeoutMs, controller);
      if (step.done) return;
      timeoutMs = idleTimeoutMs;
      yield step.value;
    }
  } finally {
    // for-await-of ruft bei break/throw automatisch .return() auf uns auf —
    // das müssen wir an den inneren Iterator weiterreichen, sonst bleibt der
    // Reader von readJsonLines gesperrt (siehe dessen eigenes finally).
    await iterator.return?.();
  }
}

/**
 * Streamt eine Antwort von Ollama. Ollama sendet zeilenweise JSON, jede Zeile
 * ein Stück Text; die letzte Zeile trägt `done: true` samt Verbrauch.
 *
 * Kein Wiederholungsversuch bei Fehlern: Ist der Stream erst einmal
 * angelaufen, hat der Nutzer bereits Text gesehen. Ein Neustart würde diesen
 * Text verdoppeln statt den Fehler zu beheben.
 */
async function* stream(config: OllamaConfig, request: ChatRequest): AsyncGenerator<StreamChunk> {
  const model = request.model ?? config.defaultModel;
  const connectTimeoutMs = config.streamConnectTimeoutMs ?? DEFAULT_STREAM_CONNECT_TIMEOUT_MS;
  const idleTimeoutMs = config.streamIdleTimeoutMs ?? DEFAULT_STREAM_IDLE_TIMEOUT_MS;
  const controller = new AbortController();

  let response: Response;
  try {
    response = await withTimeout(
      fetch(`${config.baseUrl}/api/chat`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          model,
          messages: buildMessages(request),
          stream: true,
          options: { num_predict: request.maxTokens ?? config.defaultMaxTokens },
        }),
        signal: controller.signal,
      }),
      connectTimeoutMs,
      controller,
    );
  } catch (err) {
    // ProviderError kommt bereits fertig aus withTimeout (Zeitüberschreitung).
    if (err instanceof ProviderError) throw err;
    throw new ProviderError(
      503,
      String(err),
      `Ollama nicht erreichbar unter ${config.baseUrl}. Läuft 'ollama serve'?`,
    );
  }

  if (!response.ok) throw new ProviderError(response.status, await readErrorMessage(response));
  if (!response.body) throw new ProviderError(502, "Antwort ohne Datenstrom erhalten.");

  let text = "";
  let last: RawOllamaResponse = {};
  for await (const line of withChunkTimeout(
    readJsonLines(response.body),
    connectTimeoutMs,
    idleTimeoutMs,
    controller,
  )) {
    let raw: RawOllamaResponse;
    try {
      raw = JSON.parse(line) as RawOllamaResponse;
    } catch {
      continue; // Unvollständige Zeile — überspringen statt abzubrechen.
    }
    last = raw;
    const piece = raw.message?.content;
    if (piece) {
      text += piece;
      yield { type: "text", text: piece };
    }
  }

  yield {
    type: "done",
    response: {
      role: "assistant",
      content: text,
      model: last.model ?? model,
      stopReason: last.done_reason ?? null,
      usage: {
        inputTokens: last.prompt_eval_count ?? 0,
        outputTokens: last.eval_count ?? 0,
      },
    },
  };
}

/**
 * Ruft ein Modell auf und gibt die Antwort im internen Format zurück.
 *
 * Vorübergehende Fehler (Netzfehler, 429, 500–504) werden bis zu `MAX_RETRIES`
 * mal automatisch wiederholt, mit steigender Wartezeit. Eine Zeitüberschreitung
 * zählt bewusst NICHT dazu: Sie kommt aus unserem eigenen `withTimeout` als
 * fertiger `ProviderError` zurück und wird hier unverändert weitergereicht,
 * ohne die Retry-Prüfung nach Status zu durchlaufen — ein hängender Anbieter
 * beim ersten Versuch hängt beim zweiten wahrscheinlich genauso.
 */
async function complete(config: OllamaConfig, request: ChatRequest): Promise<ChatResponse> {
  const model = request.model ?? config.defaultModel;
  const body = {
    model,
    messages: buildMessages(request),
    stream: false,
    options: { num_predict: request.maxTokens ?? config.defaultMaxTokens },
  };
  const timeoutMs = config.requestTimeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    const controller = new AbortController();
    let response: Response;
    try {
      response = await withTimeout(
        fetch(`${config.baseUrl}/api/chat`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body),
          signal: controller.signal,
        }),
        timeoutMs,
        controller,
      );
    } catch (err) {
      // ProviderError kommt bereits fertig aus withTimeout (Zeitüberschreitung)
      // und wird nicht wiederholt. Alles andere ist ein echter Netzfehler
      // (Server nicht erreichbar) — der ist vorübergehend.
      if (err instanceof ProviderError) throw err;
      if (attempt < MAX_RETRIES) {
        await sleep(retryDelayMs(attempt));
        continue;
      }
      throw new ProviderError(
        503,
        String(err),
        `Ollama nicht erreichbar unter ${config.baseUrl}. Läuft 'ollama serve'?`,
      );
    }

    if (!response.ok) {
      const message = await readErrorMessage(response);
      if (attempt < MAX_RETRIES && isRetryableStatus(response.status)) {
        await sleep(retryDelayMs(attempt, response.headers.get("retry-after")));
        continue;
      }
      throw new ProviderError(response.status, message);
    }

    const raw = (await response.json()) as RawOllamaResponse;
    return toInternal(raw, model);
  }

  // Unerreichbar: Jede Runde der Schleife gibt zurück, wiederholt oder wirft.
  throw new ProviderError(500, "Unerwarteter Zustand in der Wiederholungsschleife.");
}

function toInternal(raw: RawOllamaResponse, fallbackModel: string): ChatResponse {
  return {
    role: "assistant",
    content: raw.message?.content ?? "",
    model: raw.model ?? fallbackModel,
    stopReason: raw.done_reason ?? null,
    usage: {
      inputTokens: raw.prompt_eval_count ?? 0,
      outputTokens: raw.eval_count ?? 0,
    },
  };
}

async function readErrorMessage(response: Response): Promise<string> {
  try {
    const data = (await response.json()) as { error?: string };
    return data.error ?? response.statusText;
  } catch {
    return response.statusText;
  }
}
