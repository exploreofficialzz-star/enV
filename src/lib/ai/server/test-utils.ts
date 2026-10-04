/** Test helpers (server only, never imported by runtime code). No network, no real keys. */
import type { ProviderId } from "../types.ts";
import { loadAiConfig } from "./config.ts";
import { createAiCore } from "./core/execute.ts";
import type { AiCore } from "./core/execute.ts";
import type { AiLogEvent } from "./observability.ts";
import { createMockAdapter } from "./providers/mock.ts";
import type { MockAdapter, MockStep } from "./providers/mock.ts";
import type { TaskRegistry } from "./tasks/index.ts";

export const FAKE_KEYS = {
  GROQ_API_KEY: "test-groq-key-000000",
  OPENROUTER_API_KEY: "test-openrouter-key-000000",
  GEMINI_API_KEY: "test-gemini-key-000000",
} as const;

export function testConfig(env: Record<string, string> = {}) {
  return loadAiConfig({ NODE_ENV: "test", ...FAKE_KEYS, ...env });
}

export interface TestCoreOptions {
  env?: Record<string, string>;
  scripts?: Partial<Record<ProviderId, MockStep[]>>;
  tasks?: TaskRegistry;
  now?: () => number;
}

export function testCore(options: TestCoreOptions = {}) {
  const config = testConfig(options.env);
  const adapters = {
    groq: createMockAdapter({ id: "groq", script: options.scripts?.groq }),
    openrouter: createMockAdapter({ id: "openrouter", script: options.scripts?.openrouter }),
    gemini: createMockAdapter({ id: "gemini", script: options.scripts?.gemini }),
  } satisfies Record<string, MockAdapter>;
  const logs: AiLogEvent[] = [];
  const core: AiCore = createAiCore({
    config,
    adapters,
    tasks: options.tasks,
    now: options.now,
    log: (event) => logs.push(event),
    sleep: async () => {},
    random: () => 0,
    newBoundaryId: () => "bTESTBOUNDARY",
  });
  return { core, config, adapters, logs };
}
