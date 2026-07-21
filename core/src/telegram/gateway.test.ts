import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { ChatRequest } from "@raider/shared";
import { beforeEach, describe, expect, it } from "vitest";
import type { ChatFn } from "../chat/turn";
import { createAgent } from "../db/agents";
import { type Db, openDatabase } from "../db/index";
import { runMigrations } from "../db/migrate";
import { createPairingCode, getChat, listChats } from "../db/telegram";
import type { TelegramApi, TelegramUpdate } from "./api";
import { createTelegramGateway } from "./gateway";

const migrationsDir = join(dirname(fileURLToPath(import.meta.url)), "..", "db", "migrations");

/** Gefälschte Bot-API: merkt sich gesendete Nachrichten, braucht kein Netz. */
function fakeApi() {
  const sent: Array<{ chatId: number; text: string }> = [];
  const api: TelegramApi = {
    getUpdates: async () => [],
    sendMessage: async (chatId, text) => {
      sent.push({ chatId, text });
    },
  };
  return { api, sent };
}

/** Baut eine Aktualisierung mit Text von einem Chat. */
function update(id: number, chatId: number, text: string, username?: string): TelegramUpdate {
  return { update_id: id, message: { chat: { id: chatId, username }, text } };
}

let db: Db;
let captured: ChatRequest | undefined;

const capturingChat: ChatFn = async (request) => {
  captured = request;
  return {
    role: "assistant",
    content: "Arrr, Antwort vom Modell",
    model: "test-model",
    stopReason: "end_turn",
    usage: { inputTokens: 4, outputTokens: 6 },
  };
};

beforeEach(() => {
  db = openDatabase(":memory:");
  runMigrations(db, migrationsDir);
  captured = undefined;
});

describe("Telegram-Gateway", () => {
  it("weist einen ungekoppelten Chat ab und ruft NICHT das Modell", async () => {
    const { api, sent } = fakeApi();
    const gateway = createTelegramGateway({ db, api, chat: capturingChat });

    await gateway.handleUpdate(update(1, 555, "Hallo Raider"));

    expect(captured).toBeUndefined();
    expect(getChat(db, 555)).toBeUndefined();
    expect(sent[0]?.text).toContain("Erst koppeln");
  });

  it("koppelt mit gültigem Code und legt eine Telegram-Sitzung an", async () => {
    const { api, sent } = fakeApi();
    const code = createPairingCode(db, 600).code;
    const gateway = createTelegramGateway({ db, api, chat: capturingChat });

    await gateway.handleUpdate(update(1, 555, `/pair ${code}`, "jul"));

    expect(sent[0]?.text).toContain("Gekoppelt");
    const chat = getChat(db, 555);
    expect(chat).toBeDefined();
    expect(chat?.label).toBe("@jul");
  });

  it("lehnt einen unbekannten Code ab", async () => {
    const { api, sent } = fakeApi();
    const gateway = createTelegramGateway({ db, api, chat: capturingChat });

    await gateway.handleUpdate(update(1, 555, "/pair ZZZZZZ"));

    expect(sent[0]?.text).toContain("Unbekannter Code");
    expect(getChat(db, 555)).toBeUndefined();
  });

  it("leitet Nachrichten eines gekoppelten Chats ans Modell und antwortet zurück", async () => {
    const { api, sent } = fakeApi();
    const agent = createAgent(db, {
      name: "Klaus",
      icon: null,
      systemPrompt: "Du bist Klaus.",
      model: null,
      fallbackModel: null,
    });
    const code = createPairingCode(db, 600).code;
    const gateway = createTelegramGateway({ db, api, chat: capturingChat });

    await gateway.handleUpdate(update(1, 555, `/pair ${code}`));
    // Die frische Sitzung dem Agenten zuordnen, um Prompt-Injektion zu prüfen.
    const chat = getChat(db, 555);
    db.prepare("UPDATE sessions SET agent_id = ? WHERE id = ?").run(agent.id, chat?.sessionId);

    await gateway.handleUpdate(update(2, 555, "Wie geht's?"));

    expect(captured?.system).toContain("Du bist Klaus.");
    expect(captured?.messages.at(-1)?.content).toBe("Wie geht's?");
    expect(sent.at(-1)?.text).toBe("Arrr, Antwort vom Modell");
  });

  it("meldet, wenn ein bereits gekoppelter Chat erneut koppeln will", async () => {
    const { api, sent } = fakeApi();
    const code = createPairingCode(db, 600).code;
    const gateway = createTelegramGateway({ db, api, chat: capturingChat });

    await gateway.handleUpdate(update(1, 555, `/pair ${code}`));
    const secondCode = createPairingCode(db, 600).code;
    await gateway.handleUpdate(update(2, 555, `/pair ${secondCode}`));

    expect(sent.at(-1)?.text).toContain("bereits gekoppelt");
    expect(listChats(db)).toHaveLength(1);
  });
});
