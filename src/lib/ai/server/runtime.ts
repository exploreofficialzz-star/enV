/**
 * SERVER ONLY. Lazily builds the process-wide AI runtime from environment variables.
 * Route files import getAiRuntime(); nothing else should construct providers.
 */
import { createAiCore } from "./core/execute.ts";
import type { AiCore } from "./core/execute.ts";
import { loadAiConfig } from "./config.ts";
import { createAiHandlers } from "./handler.ts";
import type { AiHandlers } from "./handler.ts";
import { createConsoleLogger } from "./observability.ts";
import { createAdapters } from "./providers/index.ts";
import { createSessionLookup } from "./session.ts";

export interface AiRuntime {
  core: AiCore;
  handlers: AiHandlers;
}

let runtime: AiRuntime | null = null;

export function getAiRuntime(): AiRuntime {
  if (!runtime) {
    const config = loadAiConfig();
    const log = createConsoleLogger(config.debug);
    const core = createAiCore({ config, adapters: createAdapters(config), log });
    // In production the auth origin must come from BETTER_AUTH_URL; the request's own host is not trusted.
    const getUserId = createSessionLookup({ baseUrl: (request) => config.authBaseUrl ?? (config.production ? null : new URL(request.url).origin) });
    runtime = { core, handlers: createAiHandlers({ core, log, getUserId: config.authConfigured ? getUserId : undefined }) };
  }
  return runtime;
}
