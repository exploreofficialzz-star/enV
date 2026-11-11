/** SERVER ONLY. Cloudflare Workers AI OpenAI-compatible Chat Completions adapter. */
import type { ProviderAdapter } from "../../types.ts";
import { createChatAdapter } from "./chat.ts";
import type { FetchLike } from "./http.ts";

export function createCloudflareAdapter(options: {
  apiKey: () => string | null;
  accountId: () => string | null;
  fetchImpl?: FetchLike;
}): ProviderAdapter {
  const accountId = options.accountId();
  const baseUrl = accountId
    ? "https://api.cloudflare.com/client/v4/accounts/" + encodeURIComponent(accountId) + "/ai/v1"
    : "https://api.cloudflare.com/client/v4/accounts/unconfigured/ai/v1";
  return createChatAdapter({
    id: "cloudflare",
    baseUrl,
    apiKey: options.apiKey,
    tokenParam: "max_tokens",
    // Cloudflare supports JSON Mode for this model but does not guarantee schema adherence.
    // The shared task validator remains authoritative and can trigger one repair attempt.
    extras: (request) => request.jsonSchema ? { response_format: { type: "json_object" } } : {},
    fetchImpl: options.fetchImpl,
  });
}
