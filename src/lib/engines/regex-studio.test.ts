import test from "node:test";
import assert from "node:assert/strict";
import { runRegexStudio } from "./regex-studio.ts";
import { developerStudioGolden } from "./developer-studio-golden.ts";

const fixture = developerStudioGolden.regex;

test("Regex Studio formats regex source without changing any code points", async () => {
  const source = "^(?<name>[A-Z]+)-(\\d{2,6})$";
  const result = JSON.parse(await runRegexStudio(source, "", "g", "", "format"));
  assert.equal(result.original, source);
  assert.equal(result.roundTripExact, true);
  assert.ok(result.source.includes(".join(\"\")"));
});

test("Regex flavor scanner explains Python named groups without claiming multi-engine execution", async () => {
  const result = JSON.parse(await runRegexStudio("(?P<name>foo)\\K", "", "", "", "flavors"));
  assert.equal(result.defaultEngine, "JavaScript RegExp");
  assert.ok(result.findings.some((finding: { feature: string }) => finding.feature === "Python named group"));
  assert.match(result.note, /does not run regexes under every flavor/);
});

test("shared golden regex batch validates positives, negative samples, and numbered/named captures", async () => {
  const result = JSON.parse(await runRegexStudio(fixture.pattern, fixture.samplesJson, fixture.flags, "", "test"));
  assert.equal(result.sampleCount, 3);
  assert.equal(result.matchCount, 2);
  assert.deepEqual(result.results.map((row: { assertionPassed: boolean }) => row.assertionPassed), [true, true, true]);
  assert.equal(result.results[0].matches[0].namedGroups.kind, "ORD");
  assert.equal(result.results[0].matches[0].groups[1], "0187");
});

test("Regex Studio refuses large risky workloads when a terminable Worker is absent", async () => {
  const sample = fixture.highRiskSample;
  const output = JSON.parse(await runRegexStudio(fixture.highRiskPattern, JSON.stringify([{ label: "near miss", text: sample }]), "g", "", "test"));
  assert.equal(output.workerIsolated, false);
  assert.equal(output.results[0].executionSkipped, true);
  assert.match(output.performanceRisk, /high-backtracking-risk|backtracking-risk/i);
});

test("benchmark mode never claims hard-deadline isolation without Worker support", async () => {
  const output = JSON.parse(await runRegexStudio("\\w+", JSON.stringify(["small fixture"]), "g", "", "benchmark"));
  assert.equal(output.executionSkipped, true);
  assert.equal(output.workerIsolated, false);
  assert.match(output.note, /No benchmark iterations executed/);
});

test("pipeline refuses to run in a context without a killable Worker", async () => {
  await assert.rejects(
    runRegexStudio(".*", fixture.pipelineJson, "g", "", "pipeline"),
    /killable Web Worker/,
  );
});

test("Regex Studio abort state returns without executing the supplied pattern", async () => {
  const abort = new AbortController(); abort.abort();
  const output = JSON.parse(await runRegexStudio("(a+)+$", fixture.highRiskSample, "g", "", "test", abort.signal));
  assert.equal(output.cancelled, true);
  assert.equal(output.executionSkipped, true);
});

test("terminable Web Worker response is accepted and worker is always terminated", async () => {
  const original = globalThis.Worker;
  let terminated = false;
  class ReplyingWorker {
    onmessage: ((event: MessageEvent) => void) | null = null;
    onerror: ((event: ErrorEvent) => void) | null = null;
    postMessage(request: { id: string }) {
      queueMicrotask(() => this.onmessage?.({ data: { id: request.id, ok: true, result: { mode: "test", workerIsolated: true, sampleCount: 1, results: [] } } } as MessageEvent));
    }
    terminate() { terminated = true; }
  }
  Object.defineProperty(globalThis, "Worker", { configurable: true, writable: true, value: ReplyingWorker as unknown as typeof Worker });
  try {
    const output = JSON.parse(await runRegexStudio("x+", "xxx", "g", "", "test"));
    assert.equal(output.workerIsolated, true);
    assert.equal(terminated, true);
  } finally {
    if (original === undefined) Reflect.deleteProperty(globalThis, "Worker");
    else Object.defineProperty(globalThis, "Worker", { configurable: true, writable: true, value: original });
  }
});

test("in-flight cancellation terminates the Worker and never presents a partial success", async () => {
  const original = globalThis.Worker;
  let terminated = false;
  class HangingWorker {
    onmessage: ((event: MessageEvent) => void) | null = null;
    onerror: ((event: ErrorEvent) => void) | null = null;
    postMessage(_request: unknown) { /* Simulate a computation that does not yield a message. */ }
    terminate() { terminated = true; }
  }
  Object.defineProperty(globalThis, "Worker", { configurable: true, writable: true, value: HangingWorker as unknown as typeof Worker });
  const controller = new AbortController();
  try {
    const pending = runRegexStudio("x+", "xxx", "g", "", "test", controller.signal);
    controller.abort();
    const output = JSON.parse(await pending);
    assert.equal(output.cancelled, true);
    assert.equal(output.executionSkipped, true);
    assert.equal(terminated, true);
  } finally {
    if (original === undefined) Reflect.deleteProperty(globalThis, "Worker");
    else Object.defineProperty(globalThis, "Worker", { configurable: true, writable: true, value: original });
  }
});

test("Worker deadline reports a hard stop and cleans up the Worker", async () => {
  const original = globalThis.Worker;
  let terminated = false;
  class HangingWorker {
    onmessage: ((event: MessageEvent) => void) | null = null;
    onerror: ((event: ErrorEvent) => void) | null = null;
    postMessage(_request: unknown) { /* Simulate a stuck synchronous match inside a worker. */ }
    terminate() { terminated = true; }
  }
  Object.defineProperty(globalThis, "Worker", { configurable: true, writable: true, value: HangingWorker as unknown as typeof Worker });
  try {
    const output = JSON.parse(await runRegexStudio("x+", "xxx", "g", "", "test"));
    assert.equal(output.timedOut, true);
    assert.equal(output.timeBudgetMs, 750);
    assert.equal(output.executionSkipped, true);
    assert.equal(terminated, true);
  } finally {
    if (original === undefined) Reflect.deleteProperty(globalThis, "Worker");
    else Object.defineProperty(globalThis, "Worker", { configurable: true, writable: true, value: original });
  }
});

test("no-Worker fallback marks capped match lists as truncated instead of silently reporting complete results", async () => {
  const original = globalThis.Worker;
  if (original !== undefined) Reflect.deleteProperty(globalThis, "Worker");
  try {
    const output = JSON.parse(await runRegexStudio("a", "a".repeat(501), "g", "", "test"));
    assert.equal(output.workerIsolated, false);
    assert.equal(output.results[0].matchCount, 500);
    assert.equal(output.results[0].truncated, true);
  } finally {
    if (original !== undefined) Object.defineProperty(globalThis, "Worker", { configurable: true, writable: true, value: original });
  }
});
