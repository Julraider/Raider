import type { ChatRequest, ChatResponse } from "@raider/shared";

/**
 * Gemeinsame Schnittstelle aller Anbieter. Jeder Adapter gibt das interne
 * Nachrichtenformat zurück — nie das rohe Anbieterformat. Erst mit der zweiten
 * Implementierung (Ollama neben Anthropic) ist diese Abstraktion gerechtfertigt.
 */
export interface Provider {
  complete(request: ChatRequest): Promise<ChatResponse>;
  /**
   * Liefert die Antwort stückweise, während das Modell schreibt. Optional:
   * Adapter ohne Streaming bleiben nutzbar, der Core fällt dann auf `complete`
   * zurück.
   */
  stream?(request: ChatRequest): AsyncIterable<StreamChunk>;
}

/**
 * Ein Stück einer laufenden Antwort. `text` kommt häufig und in kleinen
 * Häppchen; `done` kommt genau einmal am Ende und trägt die vollständige
 * Antwort samt Verbrauch.
 */
export type StreamChunk = { type: "text"; text: string } | { type: "done"; response: ChatResponse };

/**
 * Liest einen SSE-Datenstrom (`data: …`-Zeilen) und gibt die Nutzlast jeder
 * Zeile einzeln zurück. Kümmert sich um über Paketgrenzen zerschnittene Zeilen.
 */
export async function* readSseLines(body: ReadableStream<Uint8Array>): AsyncGenerator<string> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let newline = buffer.indexOf("\n");
      while (newline !== -1) {
        const line = buffer.slice(0, newline).trim();
        buffer = buffer.slice(newline + 1);
        if (line.startsWith("data:")) yield line.slice(5).trim();
        newline = buffer.indexOf("\n");
      }
    }
  } finally {
    reader.releaseLock();
  }
}

/** Liest zeilenweise JSON (eine JSON-Nachricht pro Zeile), wie Ollama es sendet. */
export async function* readJsonLines(body: ReadableStream<Uint8Array>): AsyncGenerator<string> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let newline = buffer.indexOf("\n");
      while (newline !== -1) {
        const line = buffer.slice(0, newline).trim();
        buffer = buffer.slice(newline + 1);
        if (line !== "") yield line;
        newline = buffer.indexOf("\n");
      }
    }
    const rest = buffer.trim();
    if (rest !== "") yield rest;
  } finally {
    reader.releaseLock();
  }
}
