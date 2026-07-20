import type { ChatRequest, ChatResponse } from "@raider/shared";

/**
 * Gemeinsame Schnittstelle aller Anbieter. Jeder Adapter gibt das interne
 * Nachrichtenformat zurück — nie das rohe Anbieterformat. Erst mit der zweiten
 * Implementierung (Ollama neben Anthropic) ist diese Abstraktion gerechtfertigt.
 */
export interface Provider {
  complete(request: ChatRequest): Promise<ChatResponse>;
}
