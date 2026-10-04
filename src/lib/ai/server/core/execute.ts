/**
 * SERVER ONLY. The AI Core: validates a task request, routes it, calls providers with timeouts,
 * retries transient failures, falls back across providers, validates structured output (with one
 * repair attempt), records health/usage, and returns a normalized result or a typed error.
 *
 * Providers never appear in category code; everything goes through `run`.
 */
import { AiError, normalizeError } from "../../errors.ts";
import type {
  AdapterRequest,
  AiContentPart,
  AiResult,
  CostEstimate,
  ModelRecord,
  ProviderAdapter,
  ProviderId,
} from "../../types.ts";
import { PROVIDER_IDS } from "../../types.ts";
import { configuredProviders, describeConfig, isProviderConfigured, isTaskDisabledByFlag, validateAiConfig } from "../config.ts";
import type { AiConfig } from "../config.ts";
import { noopLogger } from "../observability.ts";
import type { AiLogger } from "../observability.ts";
import { capabilityMatrix } from "../registry/capabilities.ts";
import { MODEL_REGISTRY, modelKey, validateModelRegistry } from "../registry/models.ts";
import { routeTask } from "../routing/router.ts";
import type { RouteContext } from "../routing/router.ts";
import { TASKS } from "../tasks/index.ts";
import type { TaskRegistry } from "../tasks/index.ts";
import type { PreparedTask, RegisteredTask } from "../tasks/define.ts";
import { createInflight, createTtlCache } from "./cache.ts";
import { createHealthTracker } from "./health.ts";
import type { HealthTracker } from "./health.ts";
import { newBoundary, newRequestId, sha256Hex } from "./ids.ts";
import { createUsageLedger, estimateCost } from "./usage.ts";
import type { UsageLedger } from "./usage.ts";

export const MAX_ATTEMPTS = 4;

export interface AiCoreDeps {
  config: AiConfig;
  adapters: Partial<Record<ProviderId, ProviderAdapter>>;
  models?: readonly ModelRecord[];
  tasks?: TaskRegistry;
  health?: HealthTracker;
  usage?: UsageLedger;
  now?: () => number;
  sleep?: (ms: number, signal: AbortSignal) => Promise<void>;
  random?: () => number;
  log?: AiLogger;
  newId?: () => string;
  newBoundaryId?: () => string;
}

export interface AiRunOptions {
  taskId: string;
  input: unknown;
  signal?: AbortSignal;
  requestId?: string;
  /** Identical concurrent requests in the same scope share one provider call (double-click guard). */
  dedupeScope?: string;
}

export interface TaskAvailability {
  available: boolean;
  reason?: "disabled" | "unconfigured" | "unavailable";
}

export interface AiCore {
  readonly config: AiConfig;
  readonly health: HealthTracker;
  readonly usage: UsageLedger;
  getTask(id: string): RegisteredTask | undefined;
  run(options: AiRunOptions): Promise<AiResult<unknown>>;
  availability(): Record<string, TaskAvailability>;
  diagnostics(): Record<string, unknown>;
}

function defaultSleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (signal.aborted) return resolve();
    const timer = setTimeout(resolve, ms);
    signal.addEventListener("abort", () => {
      clearTimeout(timer);
      resolve();
    }, { once: true });
  });
}

function attemptSignal(caller: AbortSignal | undefined, ms: number): AbortSignal {
  const timeout = AbortSignal.timeout(ms);
  return caller ? AbortSignal.any([caller, timeout]) : timeout;
}

function repairInstruction(reason: string): string {
  return `Your previous reply was rejected: ${reason} Reply again with only the corrected JSON object.`;
}

export function createAiCore(deps: AiCoreDeps): AiCore {
  const { config, adapters } = deps;
  const models = deps.models ?? MODEL_REGISTRY;
  const tasks = deps.tasks ?? TASKS;
  const now = deps.now ?? Date.now;
  const health = deps.health ?? createHealthTracker({ now });
  const usage = deps.usage ?? createUsageLedger(now);
  const sleep = deps.sleep ?? defaultSleep;
  const random = deps.random ?? Math.random;
  const log = deps.log ?? noopLogger;
  const newId = deps.newId ?? newRequestId;
  const makeBoundary = deps.newBoundaryId ?? newBoundary;
  const cache = createTtlCache<AiResult<unknown>>({ now });
  const inflight = createInflight<AiResult<unknown>>();

  const routeContext: RouteContext = { config, models, adapters, health, usage };

  /** Why no model could even be tried. Open circuits are temporary; budgets and quotas are limits. */
  function unavailableError(reasons: string[]): AiError {
    if (configuredProviders(config).length === 0) return new AiError("AI_CONFIGURATION_ERROR");
    if (reasons.includes("circuit-open")) return new AiError("AI_ALL_PROVIDERS_FAILED");
    if (reasons.includes("budget-paid-models-blocked") || reasons.includes("model-quota-exhausted")) return new AiError("AI_QUOTA_EXCEEDED");
    return new AiError("AI_UNSUPPORTED_CAPABILITY");
  }

  async function execute(task: RegisteredTask, prepared: PreparedTask, boundary: string, requestId: string, started: number, signal: AbortSignal | undefined): Promise<AiResult<unknown>> {
    usage.startRequest();
    if (usage.requestsToday() > config.limits.dailyRequests) throw new AiError("AI_QUOTA_EXCEEDED");

    const decision = routeTask(task, routeContext, { inputBytes: prepared.inputBytes });
    if (decision.candidates.length === 0) throw unavailableError(decision.rejected.map((r) => r.reason));

    const deadline = started + task.timeoutMs;
    const errors: AiError[] = [];
    let attempts = 0;

    candidates: for (let index = 0; index < decision.candidates.length; index += 1) {
      const model = decision.candidates[index]!;
      const adapter = adapters[model.provider]!;
      const key = modelKey(model);
      const moreModels = index < decision.candidates.length - 1;
      let repairs = 0;
      let transientRetries = 0;
      let repairNote: string | undefined;

      for (;;) {
        if (signal?.aborted) throw new AiError("AI_REQUEST_CANCELLED");
        const remaining = deadline - now();
        if (attempts >= MAX_ATTEMPTS || remaining <= 0) break candidates;
        attempts += 1;
        usage.recordAttempt(key);

        const user: AiContentPart[] = repairNote ? [...prepared.user, { type: "text", text: repairInstruction(repairNote) }] : prepared.user;
        const request: AdapterRequest = {
          capability: task.capability,
          model: model.modelId,
          system: prepared.system,
          user,
          jsonSchema: task.jsonSchema,
          structuredSupport: model.structuredOutput,
          schemaName: task.schemaName ?? task.id.replace(/[^A-Za-z0-9_]/g, "_"),
          maxOutputTokens: Math.min(model.maxOutputTokens, task.maxOutputTokens + (model.reasoning ? model.outputHeadroomTokens : 0)),
          temperature: task.temperature,
          privacy: task.privacy,
          language: prepared.language,
          signal: attemptSignal(signal, Math.min(remaining, task.attemptTimeoutMs)),
        };
        const attemptStarted = now();

        try {
          const result = await adapter.execute(request);
          const accepted = prepared.accept(result, boundary);
          if (!accepted.ok) {
            health.recordFailure(key, new AiError("AI_OUTPUT_VALIDATION_FAILED", { provider: model.provider, model: model.modelId }));
            log({ event: "ai.attempt", requestId, taskId: task.id, provider: model.provider, model: model.modelId, status: "error", errorCode: "AI_OUTPUT_VALIDATION_FAILED", attempt: attempts, latencyMs: now() - attemptStarted });
            if (repairs < 1 && task.structured) {
              repairs += 1;
              repairNote = accepted.reason;
              continue;
            }
            errors.push(new AiError("AI_OUTPUT_VALIDATION_FAILED", { provider: model.provider, model: model.modelId }));
            continue candidates;
          }

          health.recordSuccess(key);
          const cost: CostEstimate = estimateCost(model, result.usage, now());
          usage.recordSuccess({ taskId: task.id, modelKey: key, cost, usage: result.usage });
          const latencyMs = now() - started;
          log({ event: "ai.attempt", requestId, taskId: task.id, provider: model.provider, model: model.modelId, status: "ok", attempt: attempts, latencyMs: now() - attemptStarted });
          return {
            requestId,
            taskId: task.id,
            promptVersion: task.version,
            provider: model.provider,
            model: model.modelId,
            capability: task.capability,
            status: "ok",
            result: accepted.value,
            usage: result.usage,
            cost,
            latencyMs,
            finishReason: result.finishReason,
            fallbackUsed: index > 0,
            attempts,
            cached: false,
            warnings: accepted.warnings,
          };
        } catch (raw) {
          const error = normalizeError(raw);
          if (error.code === "AI_REQUEST_CANCELLED" || signal?.aborted) throw new AiError("AI_REQUEST_CANCELLED");
          health.recordFailure(key, error);
          errors.push(error);
          log({ event: "ai.attempt", requestId, taskId: task.id, provider: model.provider, model: model.modelId, status: "error", errorCode: error.code, upstreamStatus: error.upstreamStatus, attempt: attempts, latencyMs: now() - attemptStarted });

          if (error.retryable && !moreModels && transientRetries < 1) {
            transientRetries += 1;
            const backoff = Math.min(250 + Math.floor(random() * 350), Math.max(0, deadline - now()) / 4);
            await sleep(backoff, signal ?? new AbortController().signal);
            continue;
          }
          if (error.fallbackable) continue candidates;
          throw error;
        }
      }
    }

    const retryAfters = errors.map((e) => e.retryAfterSeconds).filter((v): v is number => v !== undefined);
    throw new AiError("AI_ALL_PROVIDERS_FAILED", retryAfters.length > 0 ? { retryAfterSeconds: Math.min(...retryAfters) } : {});
  }

  async function run(options: AiRunOptions): Promise<AiResult<unknown>> {
    const requestId = options.requestId ?? newId();
    const started = now();
    const task = tasks.get(options.taskId);
    try {
      if (!task) throw new AiError("AI_TASK_UNKNOWN");
      if (!config.enabled || !task.remoteProcessingAllowed || isTaskDisabledByFlag(config, task.id)) throw new AiError("AI_DISABLED");
      if (options.signal?.aborted) throw new AiError("AI_REQUEST_CANCELLED");

      const boundary = makeBoundary();
      const plan = task.plan(options.input, { boundary });
      if (!plan.ok) throw new AiError("AI_INVALID_INPUT", { detail: plan.message });

      const fingerprint = sha256Hex(`${task.id}|${task.version}|${plan.prepared.fingerprint}`);
      const cacheable = task.cacheTtlSeconds !== null && task.privacy === "standard" && config.cacheEnabled;
      if (cacheable) {
        const hit = cache.get(fingerprint);
        if (hit) {
          const served: AiResult<unknown> = { ...structuredClone(hit), requestId, cached: true, attempts: 0, fallbackUsed: false, latencyMs: now() - started, cost: { usd: 0, basis: "estimated" } };
          log({ event: "ai.request", requestId, taskId: task.id, provider: hit.provider, model: hit.model, status: "ok", cached: true, latencyMs: served.latencyMs });
          return served;
        }
      }

      const shared = await inflight.run(`${options.dedupeScope ?? ""}|${fingerprint}`, () => execute(task, plan.prepared, boundary, requestId, started, options.signal));
      const result: AiResult<unknown> = { ...shared, requestId };
      if (cacheable && !shared.cached) cache.set(fingerprint, structuredClone(result), (task.cacheTtlSeconds ?? 0) * 1000);
      log({
        event: "ai.request",
        requestId,
        taskId: task.id,
        provider: result.provider,
        model: result.model,
        status: "ok",
        latencyMs: result.latencyMs,
        attempts: result.attempts,
        fallbackUsed: result.fallbackUsed,
        cached: false,
        inputTokens: result.usage.inputTokens,
        outputTokens: result.usage.outputTokens,
        estimatedCostUsd: result.cost.usd,
      });
      return result;
    } catch (raw) {
      const error = normalizeError(raw);
      log({ event: "ai.request", requestId, taskId: task?.id ?? String(options.taskId).slice(0, 80), status: "error", errorCode: error.code, latencyMs: now() - started });
      throw error;
    }
  }

  function availability(): Record<string, TaskAvailability> {
    const out: Record<string, TaskAvailability> = {};
    const overDailyLimit = usage.requestsToday() >= config.limits.dailyRequests;
    for (const task of tasks.values()) {
      if (!config.enabled || !task.remoteProcessingAllowed || isTaskDisabledByFlag(config, task.id)) {
        out[task.id] = { available: false, reason: "disabled" };
        continue;
      }
      const { candidates } = routeTask(task, routeContext);
      if (candidates.length > 0 && !overDailyLimit) out[task.id] = { available: true };
      else out[task.id] = { available: false, reason: configuredProviders(config).length === 0 ? "unconfigured" : "unavailable" };
    }
    return out;
  }

  function diagnostics(): Record<string, unknown> {
    return {
      config: describeConfig(config),
      validation: validateAiConfig(config),
      modelRegistryProblems: validateModelRegistry(models),
      capabilities: capabilityMatrix(models, config, adapters),
      providers: PROVIDER_IDS.map((id) => ({ id, inOrder: config.providerOrder.includes(id), configured: isProviderConfigured(config, id), adapterLoaded: Boolean(adapters[id]), adapterReady: adapters[id]?.isConfigured() ?? false })),
      routing: Object.fromEntries(
        [...tasks.values()].map((task) => {
          const decision = routeTask(task, routeContext);
          return [task.id, { candidates: decision.candidates.map(modelKey), rejected: decision.rejected }];
        }),
      ),
      health: health.snapshot(),
      usage: usage.snapshot(),
      caches: { results: cache.size(), inflight: inflight.size() },
    };
  }

  return { config, health, usage, getTask: (id) => tasks.get(id), run, availability, diagnostics };
}
