import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it, vi } from "vitest";
import { type AnthropicConfig, complete } from "./anthropic";

const here = dirname(fileURLToPath(import.meta.url));
const fixture = JSON.parse(
  readFileSync(join(here, "__fixtures__", "anthropic-message.json"), "utf8"),
);

const config: AnthropicConfig = {
  apiKey: "test-key",
  baseUrl: "https://api.anthropic.test",
  defaultModel: "claude-opus-4-8",
  defaultMaxTokens: 1024,
};

function stubFetch(status: number, payload: unknown) {
  const fetchMock = vi.fn(
    async (_url: string, _init: RequestInit) => new Response(JSON.stringify(payload), { status }),
  );
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("Anthropic-Adapter", () => {
  it("mappt die rohe Antwort ins interne Format", async () => {
    const fetchMock = stubFetch(200, fixture);

    const res = await complete(config, { messages: [{ role: "user", content: "Hallo" }] });

    expect(res.role).toBe("assistant");
    expect(res.content).toBe("Hallo! Wie kann ich dir helfen?");
    expect(res.model).toBe("claude-opus-4-8");
    expect(res.stopReason).toBe("end_turn");
    expect(res.usage).toEqual({ inputTokens: 12, outputTokens: 9 });

    // Richtiger Endpoint, richtige Header, kein Rohformat nach außen.
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.anthropic.test/v1/messages");
    const headers = init.headers as Record<string, string>;
    expect(headers["x-api-key"]).toBe("test-key");
    expect(headers["anthropic-version"]).toBe("2023-06-01");
    const body = JSON.parse(init.body as string);
    expect(body.model).toBe("claude-opus-4-8");
    expect(body.max_tokens).toBe(1024);
    expect(body.messages).toEqual([{ role: "user", content: "Hallo" }]);
  });

  it("zieht System-Nachrichten ins system-Feld", async () => {
    const fetchMock = stubFetch(200, fixture);

    await complete(config, {
      messages: [
        { role: "system", content: "Sei knapp." },
        { role: "user", content: "Hi" },
      ],
    });

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(init.body as string);
    expect(body.system).toBe("Sei knapp.");
    expect(body.messages).toEqual([{ role: "user", content: "Hi" }]);
  });

  it("wirft ProviderError bei HTTP-Fehler", async () => {
    stubFetch(401, {
      type: "error",
      error: { type: "authentication_error", message: "invalid x-api-key" },
    });

    await expect(
      complete(config, { messages: [{ role: "user", content: "Hi" }] }),
    ).rejects.toMatchObject({ name: "ProviderError", status: 401 });
  });
});
