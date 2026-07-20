import type { CoreConfig } from "../config";
import { createAnthropicProvider } from "./anthropic";
import { createOllamaProvider } from "./ollama";
import type { Provider } from "./provider";

export { MissingApiKeyError, ProviderError } from "./errors";
export type { Provider } from "./provider";

/**
 * Wählt den Anbieter anhand der Konfiguration. Der API-Key wird separat
 * hereingereicht, damit er nie im Config-Objekt liegt.
 */
export function createProvider(config: CoreConfig, anthropicApiKey?: string): Provider {
  if (config.provider === "ollama") {
    return createOllamaProvider(config.ollama);
  }
  return createAnthropicProvider({
    apiKey: anthropicApiKey,
    baseUrl: config.anthropic.baseUrl,
    defaultModel: config.anthropic.defaultModel,
    defaultMaxTokens: config.anthropic.defaultMaxTokens,
  });
}
