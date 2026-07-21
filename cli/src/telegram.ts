import { ApiError, coreClient, resolveBaseUrl } from "./client";

/**
 * Telegram-Gateway verwalten (Schritt 11).
 *
 * Nutzung (Core muss laufen: npm run dev):
 *   npm run telegram                 Status + gekoppelte Chats anzeigen
 *   npm run telegram -- pair         Einmal-Code erzeugen (im Telegram: /pair <Code>)
 *   npm run telegram -- unpair <id>  Chat wieder entkoppeln
 *
 * Voraussetzung fürs Handy: einen Bot bei @BotFather anlegen und den Token als
 * RAIDER_TELEGRAM_TOKEN in die .env setzen. Der Token bleibt im Core.
 */

async function main(): Promise<void> {
  const client = coreClient();
  const [command, ...rest] = process.argv.slice(2);

  try {
    if (command === "pair") {
      const status = await client.telegramStatus();
      const code = await client.createPairingCode();
      console.log(`Kopplungs-Code: ${code.code}`);
      console.log(`Gültig bis: ${code.expiresAt} (UTC)`);
      console.log(`\nSchick deinem Bot in Telegram:  /pair ${code.code}`);
      if (!status.enabled) {
        console.log(
          "\nHinweis: Es ist kein RAIDER_TELEGRAM_TOKEN gesetzt — der Bot antwortet erst,",
        );
        console.log(
          "wenn du bei @BotFather einen Bot anlegst und den Token in die .env schreibst.",
        );
      }
      return;
    }

    if (command === "unpair") {
      const chatId = Number(rest[0]);
      if (!Number.isInteger(chatId)) {
        console.error("Nutzung: npm run telegram -- unpair <chatId>");
        process.exit(1);
      }
      await client.unpairTelegramChat(chatId);
      console.log(`Chat ${chatId} entkoppelt.`);
      return;
    }

    // Standard: Status + Chats.
    const status = await client.telegramStatus();
    console.log(`Gateway: ${status.enabled ? "aktiv" : "aus (kein RAIDER_TELEGRAM_TOKEN)"}`);
    const { chats } = await client.listTelegramChats();
    if (chats.length === 0) {
      console.log("Noch keine gekoppelten Chats. Code erzeugen: npm run telegram -- pair");
      return;
    }
    console.log(`Gekoppelte Chats (${chats.length}):`);
    for (const chat of chats) {
      const label = chat.label ? ` ${chat.label}` : "";
      console.log(
        `  ${chat.chatId}${label}  → Sitzung #${chat.sessionId}  (seit ${chat.pairedAt})`,
      );
    }
  } catch (error) {
    if (error instanceof ApiError) {
      console.error(`Fehler (${error.status}): ${error.message}`);
    } else {
      console.error(`Kein Core erreichbar unter ${resolveBaseUrl()}. Läuft 'npm run dev'?`);
    }
    process.exit(1);
  }
}

void main();
