import { afterEach, describe, expect, it, vi } from "vitest";
import { createOllamaProvider, type OllamaConfig } from "./ollama";

const config: OllamaConfig = {
  baseUrl: "http://localhost:11434",
  defaultModel: "llama3.2",
  defaultMaxTokens: 512,
};

const raw = {
  model: "llama3.2",
  message: { role: "assistant", content: "Hallo zurück!" },
  done_reason: "stop",
  prompt_eval_count: 7,
  eval_count: 4,
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("Ollama-Adapter", () => {
  it("mappt die rohe Antwort ins interne Format", async () => {
    const fetchMock = vi.fn(
      async (_url: string, _init?: RequestInit) =>
        new Response(JSON.stringify(raw), { status: 200 }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const res = await createOllamaProvider(config).complete({
      messages: [{ role: "user", content: "Hallo" }],
    });

    expect(res.role).toBe("assistant");
    expect(res.content).toBe("Hallo zurück!");
    expect(res.model).toBe("llama3.2");
    expect(res.stopReason).toBe("stop");
    expect(res.usage).toEqual({ inputTokens: 7, outputTokens: 4 });

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("http://localhost:11434/api/chat");
    const body = JSON.parse(init.body as string);
    expect(body.model).toBe("llama3.2");
    expect(body.stream).toBe(false);
    expect(body.messages).toEqual([{ role: "user", content: "Hallo" }]);
  });

  it("stellt einen Systemprompt als system-Nachricht voran", async () => {
    const fetchMock = vi.fn(
      async (_url: string, _init?: RequestInit) =>
        new Response(JSON.stringify(raw), { status: 200 }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await createOllamaProvider(config).complete({
      system: "Sei knapp.",
      messages: [{ role: "user", content: "Hi" }],
    });

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(init.body as string);
    expect(body.messages).toEqual([
      { role: "system", content: "Sei knapp." },
      { role: "user", content: "Hi" },
    ]);
  });

  it("wirft ProviderError 503, wenn Ollama nicht erreichbar ist", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("ECONNREFUSED");
      }),
    );

    await expect(
      createOllamaProvider(config).complete({ messages: [{ role: "user", content: "Hi" }] }),
    ).rejects.toMatchObject({ name: "ProviderError", status: 503 });
  });
});
