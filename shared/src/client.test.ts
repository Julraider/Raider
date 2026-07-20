import { afterEach, describe, expect, it, vi } from "vitest";
import { createRaiderClient } from "./client";

afterEach(() => {
  vi.unstubAllGlobals();
});

function stubJson(status: number, payload: unknown) {
  const fetchMock = vi.fn(
    async (_url: string, _init?: RequestInit) => new Response(JSON.stringify(payload), { status }),
  );
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

const client = () => createRaiderClient("http://localhost:4179");

describe("createRaiderClient", () => {
  it("schickt eine Chat-Anfrage und gibt die Antwort zurück", async () => {
    const fetchMock = stubJson(200, {
      role: "assistant",
      content: "Hi",
      model: "test",
      stopReason: "end_turn",
      usage: { inputTokens: 1, outputTokens: 1 },
    });

    const res = await client().chat({ messages: [{ role: "user", content: "Hallo" }] });
    expect(res.content).toBe("Hi");
    const [url] = fetchMock.mock.calls[0] as [string];
    expect(url).toBe("http://localhost:4179/chat");
  });

  it("kodiert die Such-Query in der URL", async () => {
    const fetchMock = stubJson(200, { query: "hallo welt", hits: [] });
    await client().search("hallo welt");
    const [url] = fetchMock.mock.calls[0] as [string];
    expect(url).toBe("http://localhost:4179/search?q=hallo%20welt");
  });

  it("wirft ApiError mit Status bei Fehler", async () => {
    stubJson(503, { error: "kein Key" });
    await expect(client().sendMessage(1, { content: "Hallo" })).rejects.toMatchObject({
      name: "ApiError",
      status: 503,
    });
  });
});
