import { useCallback, useEffect, useRef, useState } from "react";
import type { AiTaskId, AiTaskResultMap } from "../contracts.ts";
import { AiClientError, fetchAiAvailability, runAiTask } from "./ai-client.ts";
import type { AiRunMeta } from "./ai-client.ts";

export type AiTaskState<T> =
  | { phase: "idle" }
  | { phase: "running" }
  | { phase: "done"; result: T; meta: AiRunMeta }
  | { phase: "error"; error: AiClientError };

/** Run one AI task with cancellation. Each call supersedes the previous one; unmounting cancels it. */
export function useAiTask<T extends AiTaskId>(taskId: T) {
  const [state, setState] = useState<AiTaskState<AiTaskResultMap[T]>>({ phase: "idle" });
  const active = useRef<AbortController | null>(null);

  const run = useCallback(
    async (input: unknown) => {
      active.current?.abort();
      const controller = new AbortController();
      active.current = controller;
      setState({ phase: "running" });
      try {
        const { result, meta } = await runAiTask(taskId, input, { signal: controller.signal });
        if (active.current === controller) setState({ phase: "done", result, meta });
      } catch (error) {
        if (active.current !== controller) return;
        const failure = error instanceof AiClientError ? error : new AiClientError("AI_UNAVAILABLE", "Something went wrong. The local tool still works.", { retryable: true });
        setState(failure.code === "AI_REQUEST_CANCELLED" ? { phase: "idle" } : { phase: "error", error: failure });
      }
    },
    [taskId],
  );

  const cancel = useCallback(() => active.current?.abort(), []);
  const reset = useCallback(() => {
    active.current?.abort();
    active.current = null;
    setState({ phase: "idle" });
  }, []);

  useEffect(() => {
    const holder = active; // read .current at cleanup time, not at effect time
    return () => holder.current?.abort();
  }, []);

  return { state, run, cancel, reset };
}

/** True once the server reports this task as usable. False while checking or when AI is off. */
export function useAiAvailable(taskId: AiTaskId): boolean {
  const [available, setAvailable] = useState(false);
  useEffect(() => {
    let cancelled = false;
    void fetchAiAvailability().then((map) => {
      if (!cancelled) setAvailable(map[taskId] === true);
    });
    return () => {
      cancelled = true;
    };
  }, [taskId]);
  return available;
}
