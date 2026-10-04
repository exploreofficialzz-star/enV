/** SERVER ONLY. Builds the adapter set for a configuration. Only this folder knows provider APIs. */
import type { ProviderAdapter, ProviderId } from "../../types.ts";
import type { AiConfig } from "../config.ts";
import { createGeminiAdapter } from "./gemini.ts";
import { createGroqAdapter } from "./groq.ts";
import type { FetchLike } from "./http.ts";
import { createMockAdapter } from "./mock.ts";
import { createOpenRouterAdapter } from "./openrouter.ts";

export type AdapterSet = Partial<Record<ProviderId, ProviderAdapter>>;

export function createAdapters(config: AiConfig, fetchImpl?: FetchLike): AdapterSet {
  const adapters: AdapterSet = {};
  const key = (provider: "openrouter" | "groq" | "gemini") => () => config.keys[provider]?.reveal() ?? null;
  if (config.keys.openrouter) adapters.openrouter = createOpenRouterAdapter({ apiKey: key("openrouter"), fetchImpl });
  if (config.keys.groq) adapters.groq = createGroqAdapter({ apiKey: key("groq"), fetchImpl });
  if (config.keys.gemini) adapters.gemini = createGeminiAdapter({ apiKey: key("gemini"), fetchImpl });
  if (!config.production && config.providerOrder.includes("mock")) adapters.mock = createMockAdapter();
  return adapters;
}
