import type { ChatMessage, ChatRequest } from "@raider/shared";

/**
 * Gesprächsverlauf einer CLI-Sitzung, im Speicher gehalten. Der Core bleibt
 * zustandslos — die volle Historie wird bei jeder Runde mitgeschickt.
 * (Sitzungen in der Datenbank kommen erst in Schritt 4.)
 */
export class Conversation {
  private readonly messages: ChatMessage[] = [];

  addUser(content: string): void {
    this.messages.push({ role: "user", content });
  }

  addAssistant(content: string): void {
    this.messages.push({ role: "assistant", content });
  }

  /** Verwirft das letzte Element (z. B. die User-Nachricht nach einem Fehler). */
  dropLast(): void {
    this.messages.pop();
  }

  reset(): void {
    this.messages.length = 0;
  }

  get length(): number {
    return this.messages.length;
  }

  /** Baut eine Anfrage aus dem aktuellen Verlauf (Kopie, keine Referenz). */
  toRequest(overrides: Partial<ChatRequest> = {}): ChatRequest {
    return { messages: [...this.messages], ...overrides };
  }
}
