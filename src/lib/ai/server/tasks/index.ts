/** SERVER ONLY. The task registry: the only way to reach a task is through its id. */
import type { AiTaskId } from "../../contracts.ts";
import { AI_TASK_IDS } from "../../contracts.ts";
import { captionTask, titleTask } from "./creators.ts";
import type { RegisteredTask } from "./define.ts";
import { jsonExplainTask, regexExplainTask, sqlExplainTask } from "./developer.ts";
import { altTextTask, transcribeTask } from "./media.ts";

export type TaskRegistry = ReadonlyMap<string, RegisteredTask>;

export const ALL_TASKS: readonly RegisteredTask[] = [captionTask, titleTask, regexExplainTask, sqlExplainTask, jsonExplainTask, altTextTask, transcribeTask];

export function buildTaskRegistry(tasks: readonly RegisteredTask[] = ALL_TASKS): TaskRegistry {
  return new Map(tasks.map((task) => [task.id, task]));
}

export const TASKS: TaskRegistry = buildTaskRegistry();

export function getTask(id: string, registry: TaskRegistry = TASKS): RegisteredTask | undefined {
  return registry.get(id);
}

/** Ids declared in contracts.ts that have no implementation (and vice versa). */
export function taskRegistryProblems(registry: TaskRegistry = TASKS): string[] {
  const problems: string[] = [];
  for (const id of AI_TASK_IDS as readonly AiTaskId[]) if (!registry.has(id)) problems.push(`contract task ${id} has no implementation`);
  for (const id of registry.keys()) if (!(AI_TASK_IDS as readonly string[]).includes(id)) problems.push(`task ${id} is missing from contracts.ts`);
  return problems;
}
