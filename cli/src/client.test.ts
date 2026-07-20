import { afterEach, describe, expect, it, vi } from "vitest";
import { postChat, resolveBaseUrl } from "./client";

afterEach(() => {
  vi.unstubAllGlobals();
});

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
    const payload = {
      role: "assistant",
      content: "Hi",
      model: "test",
      stopReason: "end_turn",
      usage: { inputTokens: 1, outputTokens: 1 },
    };
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify(payload), { status: 200 })),
    );

    const res = await postChat("http://localhost:4179", {
      messages: [{ role: "user", content: "Hallo" }],
    });
    expect(res.content).toBe("Hi");
  });

  it("wirft ChatRequestError mit Status bei Fehler", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ error: "kein Key" }), { status: 503 })),
    );

    await expect(
      postChat("http://localhost:4179", { messages: [{ role: "user", content: "Hallo" }] }),
    ).rejects.toMatchObject({ name: "ChatRequestError", status: 503 });
  });
});
