import type {
  RaiderClient,
  TelegramChat,
  TelegramPairingCode,
  TelegramStatusResponse,
} from "@raider/shared";
import { useCallback, useEffect, useState } from "react";
import { errorText, ui } from "../ui";

/** Telegram-Gateway: Status, Kopplungs-Code erzeugen, Chats verwalten. */
export function TelegramPanel({ client }: { client: RaiderClient }) {
  const [status, setStatus] = useState<TelegramStatusResponse | null>(null);
  const [chats, setChats] = useState<TelegramChat[]>([]);
  const [code, setCode] = useState<TelegramPairingCode | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [s, c] = await Promise.all([client.telegramStatus(), client.listTelegramChats()]);
      setStatus(s);
      setChats(c.chats);
      setError(null);
    } catch (err) {
      setError(errorText(err));
    }
  }, [client]);

  useEffect(() => {
    void load();
  }, [load]);

  async function makeCode(): Promise<void> {
    try {
      setCode(await client.createPairingCode());
    } catch (err) {
      setError(errorText(err));
    }
  }

  async function unpair(chatId: number): Promise<void> {
    try {
      await client.unpairTelegramChat(chatId);
      await load();
    } catch (err) {
      setError(errorText(err));
    }
  }

  return (
    <div style={ui.panel}>
      <h2 style={ui.h2}>Telegram</h2>
      {error !== null && <div style={ui.error}>{error}</div>}

      <div style={ui.card}>
        <div style={ui.spread}>
          <div>
            <strong>Gateway</strong>
            <div style={ui.muted}>
              {status?.enabled
                ? "aktiv — Bot-Token ist gesetzt."
                : "aus — kein RAIDER_TELEGRAM_TOKEN gesetzt (siehe Einstellungen)."}
            </div>
          </div>
          <button type="button" style={ui.button} onClick={() => void makeCode()}>
            Kopplungs-Code erzeugen
          </button>
        </div>
        {code && (
          <div style={{ ...ui.muted, marginTop: "0.5rem" }}>
            Code:{" "}
            <strong style={{ fontSize: "1.1rem", letterSpacing: "0.1em" }}>{code.code}</strong> —
            gültig bis {code.expiresAt} (UTC). Schick deinem Bot: <code>/pair {code.code}</code>
          </div>
        )}
      </div>

      <h2 style={{ ...ui.h2, marginTop: "1rem" }}>Gekoppelte Chats</h2>
      {chats.length === 0 && <p style={ui.empty}>Noch keine gekoppelten Chats.</p>}
      {chats.map((chat) => (
        <div key={chat.chatId} style={ui.card}>
          <div style={ui.spread}>
            <div>
              <strong>{chat.label ?? `Chat ${chat.chatId}`}</strong>
              <div style={ui.muted}>
                Chat-ID {chat.chatId} · Sitzung #{chat.sessionId} · seit {chat.pairedAt}
              </div>
            </div>
            <button type="button" style={ui.buttonDanger} onClick={() => void unpair(chat.chatId)}>
              Entkoppeln
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
