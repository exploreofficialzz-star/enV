/** SERVER ONLY. OpenRouter adapter (OpenAI-compatible chat completions with routing preferences). */
import type { AdapterRequest, ProviderAdapter } from "../../types.ts";
import { createChatAdapter } from "./chat.ts";
import type { FetchLike } from "./http.ts";

export const OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1";

/**
 * OpenRouter `provider` preferences:
 * - require_parameters: only route to upstream providers that support every parameter we send
 *   (so a provider that ignores response_format is never silently chosen);
 * - data_collection: "deny" for privacy-sensitive tasks.
 */
export function openRouterExtras(request: AdapterRequest): Record<string, unknown> {
  const provider: Record<string, unknown> = {};
  if (request.jsonSchema) provider.require_parameters = true;
  if (request.privacy === "sensitive") provider.data_collection = "deny";
  return Object.keys(provider).length > 0 ? { provider } : {};
}

export function createOpenRouterAdapter(options: { apiKey: () => string | null; baseUrl?: string; fetchImpl?: FetchLike }): ProviderAdapter {
  return createChatAdapter({
    id: "openrouter",
    baseUrl: options.baseUrl ?? OPENROUTER_BASE_URL,
    apiKey: options.apiKey,
    tokenParam: "max_tokens",
    extras: openRouterExtras,
    fetchImpl: options.fetchImpl,
  });
}
