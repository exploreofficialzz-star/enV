/** SERVER ONLY. Builds a connection-scoped adapter set for configured provider accounts. */
import type { ProviderAdapter, ProviderAdapterMap, ProviderId } from "../../types.ts";
import type { AiConfig, ProviderConnectionConfig } from "../config.ts";
import { createGeminiAdapter } from "./gemini.ts";
import { createGroqAdapter } from "./groq.ts";
import { createCloudflareAdapter } from "./cloudflare.ts";
import { createMockAdapter } from "./mock.ts";
import { createMossMusicAdapter } from "./moss_music.ts";
import { createOpenRouterAdapter } from "./openrouter.ts";
import type { FetchLike } from "./http.ts";

export type AdapterSet = ProviderAdapterMap;

function adapterFor(connection: ProviderConnectionConfig, config: AiConfig, fetchImpl?: FetchLike): ProviderAdapter {
  const apiKey = () => connection.apiKey.reveal();
  let adapter: ProviderAdapter;
  switch (connection.provider) {
    case "openrouter":
      adapter = createOpenRouterAdapter({ apiKey, fetchImpl });
      break;
    case "groq":
      adapter = createGroqAdapter({ apiKey, fetchImpl });
      break;
    case "gemini":
      adapter = createGeminiAdapter({ apiKey, fetchImpl });
      break;
    case "moss_music":
      adapter = createMossMusicAdapter({ endpoint: () => config.mossMusicEndpoint, token: apiKey, fetchImpl });
      break;
    case "cloudflare":
      adapter = createCloudflareAdapter({ apiKey, accountId: () => connection.accountId ?? null, fetchImpl });
      break;
    default:
      throw new Error("Unsupported AI provider connection");
  }
  return {
    ...adapter,
    connectionId: connection.id,
    quotaScope: connection.provider + ":" + connection.quotaScope,
    ...(connection.requestQuota ? { requestQuota: connection.requestQuota } : {}),
  };
}

export function createAdapters(config: AiConfig, fetchImpl?: FetchLike): AdapterSet {
  const grouped: Partial<Record<ProviderId, ProviderAdapter[]>> = {};
  for (const connection of config.connections) {
    const adapter = adapterFor(connection, config, fetchImpl);
    (grouped[connection.provider] ??= []).push(adapter);
  }
  const adapters: AdapterSet = {};
  for (const [provider, list] of Object.entries(grouped) as [ProviderId, ProviderAdapter[]][]) {
    adapters[provider] = list.length === 1 ? list[0] : list;
  }
  if (!config.production && config.providerOrder.includes("mock")) adapters.mock = createMockAdapter();
  return adapters;
}
