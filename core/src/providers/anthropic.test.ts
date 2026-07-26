import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it, vi } from "vitest";
import { type AnthropicConfig, complete, createAnthropicProvider } from "./anthropic";

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

  it("wirft ProviderError bei HTTP-Fehler mit laienverständlicher Meldung", async () => {
    const fetchMock = stubFetch(401, {
      type: "error",
      error: { type: "authentication_error", message: "invalid x-api-key" },
    });

    await expect(
      complete(config, { messages: [{ role: "user", content: "Hi" }] }),
    ).rejects.toMatchObject({
      name: "ProviderError",
      status: 401,
      message: "Der hinterlegte Schlüssel wurde nicht akzeptiert. Prüf ihn in der Datei .env.",
    });

    // 401 ist kein vorübergehender Fehler — kein Wiederholungsversuch.
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("bricht bei Zeitüberschreitung mit verständlicher Meldung ab, statt endlos zu hängen", async () => {
    // fetch, das nie antwortet — simuliert einen toten Anbieter.
    vi.stubGlobal(
      "fetch",
      vi.fn(() => new Promise<Response>(() => {})),
    );

    await expect(
      complete(
        { ...config, requestTimeoutMs: 30 },
        { messages: [{ role: "user", content: "Hi" }] },
      ),
    ).rejects.toMatchObject({
      name: "ProviderError",
      status: 504,
      message: "Der Anbieter hat zu lange nicht geantwortet.",
    });
  });

  it("wiederholt bei 503 automatisch und übernimmt den zweiten, erfolgreichen Versuch", async () => {
    let calls = 0;
    const fetchMock = vi.fn(async () => {
      calls++;
      if (calls === 1) {
        return new Response(JSON.stringify({ error: { message: "overloaded_error" } }), {
          status: 503,
        });
      }
      return new Response(JSON.stringify(fixture), { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock);

    const res = await complete(config, { messages: [{ role: "user", content: "Hi" }] });

    expect(res.content).toBe("Hallo! Wie kann ich dir helfen?");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("wiederholt einen bereits laufenden Stream nicht, auch bei einem vorübergehenden Fehler", async () => {
    // 503 wäre bei complete() ein Kandidat für eine Wiederholung — beim Stream
    // NIE, weil dem Nutzer sonst schon gesendeter Text doppelt ankäme.
    const fetchMock = vi.fn(
      async () =>
        new Response(JSON.stringify({ error: { message: "overloaded_error" } }), { status: 503 }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const provider = createAnthropicProvider({
      apiKey: config.apiKey,
      baseUrl: config.baseUrl,
      defaultModel: config.defaultModel,
      defaultMaxTokens: config.defaultMaxTokens,
    });

    await expect(
      (async () => {
        for await (const _chunk of provider.stream?.({
          messages: [{ role: "user", content: "Hi" }],
        }) ?? []) {
          // nichts zu tun — wir wollen nur wissen, ob es wiederholt wird
        }
      })(),
    ).rejects.toMatchObject({ name: "ProviderError", status: 503 });

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("bricht einen Stream vor dem ersten Stück bei Zeitüberschreitung ab", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => new Promise<Response>(() => {})),
    );

    const provider = createAnthropicProvider({
      apiKey: config.apiKey,
      baseUrl: config.baseUrl,
      defaultModel: config.defaultModel,
      defaultMaxTokens: config.defaultMaxTokens,
      streamConnectTimeoutMs: 30,
    });

    await expect(
      (async () => {
        for await (const _chunk of provider.stream?.({
          messages: [{ role: "user", content: "Hi" }],
        }) ?? []) {
          // nichts zu tun
        }
      })(),
    ).rejects.toMatchObject({
      name: "ProviderError",
      status: 504,
      message: "Der Anbieter hat zu lange nicht geantwortet.",
    });
  });
});
