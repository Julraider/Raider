import { afterEach, describe, expect, it, vi } from "vitest";
import { postChat, resolveBaseUrl, searchMessages } from "./client";

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

describe("resolveBaseUrl", () => {
  it("nutzt 4179 als Standard", () => {
    expect(resolveBaseUrl({})).toBe("http://localhost:4179");
  });

  it("respektiert RAIDER_PORT", () => {
    expect(resolveBaseUrl({ RAIDER_PORT: "5000" })).toBe("http://localhost:5000");
  });
});

describe("postChat", () => {
  it("gibt die Antwort bei 200 zurück", async () => {
    stubJson(200, {
      role: "assistant",
      content: "Hi",
      model: "test",
      stopReason: "end_turn",
      usage: { inputTokens: 1, outputTokens: 1 },
    });

    const res = await postChat("http://localhost:4179", {
      messages: [{ role: "user", content: "Hallo" }],
    });
    expect(res.content).toBe("Hi");
  });

  it("wirft ApiError mit Status bei Fehler", async () => {
    stubJson(503, { error: "kein Key" });
    await expect(
      postChat("http://localhost:4179", { messages: [{ role: "user", content: "Hallo" }] }),
    ).rejects.toMatchObject({ name: "ApiError", status: 503 });
  });
});

describe("searchMessages", () => {
  it("kodiert die Query und gibt Treffer zurück", async () => {
    const fetchMock = stubJson(200, { query: "hallo welt", hits: [] });
    await searchMessages("http://localhost:4179", "hallo welt");
    const [url] = fetchMock.mock.calls[0] as [string];
    expect(url).toBe("http://localhost:4179/search?q=hallo%20welt");
  });
});
