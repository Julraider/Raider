import type { ChatFn } from "../chat/turn";
import { runSessionTurn } from "../chat/turn";
import { isStopped } from "../db/emergency";
import type { Db } from "../db/index";
import { getSession } from "../db/repository";
import { getChat, redeemPairingCode } from "../db/telegram";
import type { TelegramApi, TelegramUpdate } from "./api";

export interface TelegramGatewayDeps {
  db: Db;
  api: TelegramApi;
  chat: ChatFn;
}

export interface TelegramGateway {
  /** Verarbeitet eine einzelne Aktualisierung (der testbare Kern). */
  handleUpdate(update: TelegramUpdate): Promise<void>;
  /** Startet den Long-Poll — läuft, bis stop() gerufen wird. */
  start(): void;
  stop(): void;
}

const POLL_TIMEOUT_SECONDS = 25;

/**
 * Verbindet Telegram mit dem Core. Fremde Chats müssen sich erst per Einmal-Code
 * koppeln; erst danach gehen Nachrichten an das Modell. Ein nicht gekoppelter
 * Chat wird höflich abgewiesen und niemals ans Modell weitergereicht.
 */
export function createTelegramGateway(deps: TelegramGatewayDeps): TelegramGateway {
  const { db, api, chat } = deps;
  let running = false;
  let offset = 0;

  async function handleUpdate(update: TelegramUpdate): Promise<void> {
    offset = Math.max(offset, update.update_id + 1);
    const message = update.message;
    const text = message?.text?.trim();
    if (!message || !text) return;

    const chatId = message.chat.id;
    const label = message.chat.username
      ? `@${message.chat.username}`
      : (message.chat.first_name ?? null);
    const paired = getChat(db, chatId);

    // Kopplungs-Befehl (auch als /start CODE per Deep-Link).
    const code = parsePairCommand(text);
    if (code !== null) {
      if (paired) {
        await api.sendMessage(chatId, "Dieser Chat ist bereits gekoppelt. Schreib einfach los.");
        return;
      }
      const result = redeemPairingCode(db, code, chatId, label);
      if (result.ok) {
        await api.sendMessage(chatId, "✅ Gekoppelt! Du kannst jetzt mit Raider schreiben.");
      } else {
        await api.sendMessage(chatId, pairingErrorText(result.reason));
      }
      return;
    }

    if (!paired) {
      // Sicherheitsgrenze: ungekoppelte Chats gehen NICHT ans Modell.
      await api.sendMessage(
        chatId,
        "🔒 Erst koppeln, dann reden. Erzeuge am Rechner einen Code (npm run telegram -- pair) und schick mir /pair <Code>.",
      );
      return;
    }

    // Not-Stopp: gekoppelte Chats bekommen eine Info, aber nichts geht ans Modell.
    if (isStopped(db)) {
      await api.sendMessage(chatId, "⛔ Not-Stopp ist aktiv. Raider antwortet gerade nicht.");
      return;
    }

    const session = getSession(db, paired.sessionId);
    if (!session) {
      await api.sendMessage(chatId, "Sitzung nicht gefunden. Bitte neu koppeln.");
      return;
    }

    try {
      const response = await runSessionTurn(db, chat, session, text);
      await api.sendMessage(chatId, response.content || "(leere Antwort)");
    } catch {
      // Kein Anbieterfehler-Detail an den Chat — nur ein Hinweis.
      await api.sendMessage(
        chatId,
        "⚠️ Das Modell hat gerade nicht geantwortet. Versuch es später nochmal.",
      );
    }
  }

  function start(): void {
    if (running) return;
    running = true;
    void loop();
  }

  function stop(): void {
    running = false;
  }

  async function loop(): Promise<void> {
    while (running) {
      try {
        const updates = await api.getUpdates(offset, POLL_TIMEOUT_SECONDS);
        for (const update of updates) await handleUpdate(update);
      } catch {
        // Netz-/API-Aussetzer nicht fatal — kurz warten und weiter pollen.
        await sleep(2000);
      }
    }
  }

  return { handleUpdate, start, stop };
}

/**
 * Liest einen Kopplungs-Code aus dem Text. Akzeptiert `/pair CODE`, `/start CODE`
 * (Telegram-Deep-Link) oder einen alleinstehenden 6-stelligen Code. Sonst null.
 */
function parsePairCommand(text: string): string | null {
  const match = text.match(/^\/(?:pair|start)\s+(\S+)/i);
  if (match?.[1]) return match[1];
  if (/^[A-Za-z0-9]{6}$/.test(text)) return text;
  return null;
}

function pairingErrorText(reason: "unknown" | "expired" | "used"): string {
  switch (reason) {
    case "expired":
      return "⌛ Dieser Code ist abgelaufen. Erzeuge am Rechner einen neuen.";
    case "used":
      return "Dieser Code wurde schon benutzt. Erzeuge am Rechner einen neuen.";
    default:
      return "❌ Unbekannter Code. Bitte prüfe die Eingabe.";
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
