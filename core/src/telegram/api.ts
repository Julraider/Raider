/**
 * Dünner Client für die Telegram-Bot-API — nur die zwei Aufrufe, die das
 * Gateway braucht. Bewusst als Interface, damit Tests eine gefälschte API
 * einsetzen können (kein echter Bot, kein Netz). Der Token ist ein Geheimnis
 * und wird niemals geloggt oder nach außen gegeben.
 */

/** Eine eingehende Telegram-Aktualisierung (nur die genutzten Felder). */
export interface TelegramUpdate {
  update_id: number;
  message?: {
    chat: { id: number; username?: string; first_name?: string };
    text?: string;
  };
}

export interface TelegramApi {
  /** Holt neue Aktualisierungen ab `offset` (Long-Poll). */
  getUpdates(offset: number, timeoutSeconds: number): Promise<TelegramUpdate[]>;
  /** Schickt eine Textnachricht an einen Chat. */
  sendMessage(chatId: number, text: string): Promise<void>;
}

/** Baut den echten API-Client gegen api.telegram.org. */
export function createTelegramApi(token: string): TelegramApi {
  const base = `https://api.telegram.org/bot${token}`;
  return {
    async getUpdates(offset, timeoutSeconds) {
      const response = await fetch(`${base}/getUpdates`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ offset, timeout: timeoutSeconds }),
      });
      const data = (await response.json()) as { ok: boolean; result?: TelegramUpdate[] };
      if (!data.ok) throw new Error("Telegram getUpdates fehlgeschlagen.");
      return data.result ?? [];
    },
    async sendMessage(chatId, text) {
      const response = await fetch(`${base}/sendMessage`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ chat_id: chatId, text }),
      });
      if (!response.ok) throw new Error("Telegram sendMessage fehlgeschlagen.");
    },
  };
}
