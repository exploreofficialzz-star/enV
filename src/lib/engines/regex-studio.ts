/** Client-side Regex Studio orchestration, with bounded isolated execution in browsers. */
export type RegexStudioMode = "test" | "benchmark" | "pipeline" | "format" | "flavors";
type Sample = { label: string; text: string; expectMatch?: boolean; expectMatches?: number };
type Layer = { name?: string; pattern: string; flags?: string; replacement: string };
type WorkerRequest = { id: string; mode: "test" | "benchmark" | "pipeline"; pattern: string; flags: string; samples: Sample[]; replacement: string; iterations?: number; pipelineInput?: string; layers?: Layer[] };

const MAX_SAMPLES = 100;
const MAX_BYTES = 1_000_000;
const MAX_PATTERN = 5_000;
const WORKER_DEADLINE_MS: Record<WorkerRequest["mode"], number> = { test: 750, benchmark: 1_500, pipeline: 1_000 };
const MAX_LAYER_INPUT = 100_000;
const MAX_LAYER_OUTPUT = 250_000;
const RISK_HEURISTIC = /\([^)]*[+*][^)]*\)[+*{]|(?:\.\*|\.\+).*(?:\.\*|\.\+)|\([^)]*\|[^)]*\)[+*{]|(?:\\[1-9])[+*{]/;

function looksRisky(pattern: string): boolean { return RISK_HEURISTIC.test(pattern); }
function utf8Bytes(value: string): number { return new TextEncoder().encode(value).byteLength; }
function normalizeFlags(flags: string): string {
  const valid = new Set(["d", "g", "i", "m", "s", "u", "v", "y"]);
  const unique = [...new Set(flags)];
  const invalid = unique.filter((flag) => !valid.has(flag));
  if (invalid.length) throw new Error(`Unsupported JavaScript RegExp flag(s): ${invalid.join("")}. Supported flags are d, g, i, m, s, u, v, y (subject to browser support).`);
  if (unique.includes("u") && unique.includes("v")) throw new Error("The JavaScript RegExp flags 'u' and 'v' cannot be used together.");
  if (!unique.includes("g")) unique.push("g");
  return unique.join("");
}

function parseSamples(raw: string): { samples: Sample[]; config?: Record<string, unknown> } {
  const trimmed = raw.trim();
  if (!trimmed.startsWith("[") && !trimmed.startsWith("{")) return { samples: [{ label: "Sample 1", text: raw }] };
  let parsed: unknown;
  try { parsed = JSON.parse(trimmed); }
  catch { return { samples: [{ label: "Sample 1", text: raw }] }; }
  let rows: unknown[];
  let config: Record<string, unknown> | undefined;
  if (Array.isArray(parsed)) rows = parsed;
  else if (parsed && typeof parsed === "object") {
    config = parsed as Record<string, unknown>;
    if (Array.isArray(config.samples)) rows = config.samples;
    else return { samples: [], config };
  } else return { samples: [{ label: "Sample 1", text: raw }] };
  if (rows.some((row) => typeof row !== "string" && (!row || typeof row !== "object" || Array.isArray(row)))) throw new Error("Regex test input must be an array of strings or labeled sample objects.");
  const samples = rows.map((row, index): Sample => {
    if (typeof row === "string") return { label: `Sample ${index + 1}`, text: row };
    const object = row as Record<string, unknown>;
    const text = object.text ?? object.sample;
    if (typeof text !== "string") throw new Error(`Regex sample ${index + 1} needs a string 'text' value.`);
    if (object.expectMatch !== undefined && typeof object.expectMatch !== "boolean") throw new Error(`Regex sample ${index + 1} expectMatch must be true or false.`);
    if (object.expectMatches !== undefined && (!Number.isInteger(object.expectMatches) || Number(object.expectMatches) < 0)) throw new Error(`Regex sample ${index + 1} expectMatches must be a non-negative integer.`);
    return { label: typeof object.label === "string" && object.label.trim() ? object.label.trim().slice(0, 120) : `Sample ${index + 1}`, text, ...(object.expectMatch === undefined ? {} : { expectMatch: object.expectMatch as boolean }), ...(object.expectMatches === undefined ? {} : { expectMatches: Number(object.expectMatches) }) };
  });
  if (samples.length < 1 || samples.length > MAX_SAMPLES) throw new Error(`Regex batch mode accepts between 1 and ${MAX_SAMPLES} sample strings.`);
  const bytes = samples.reduce((total, sample) => total + utf8Bytes(sample.text), 0);
  if (bytes > MAX_BYTES) throw new Error(`Regex sample input exceeds the 1 MB local processing limit (received ${bytes.toLocaleString()} UTF-8 bytes).`);
  return { samples, config };
}

function safeFallback(request: WorkerRequest, timedOutUnavailable = false): Record<string, unknown> {
  const risk = looksRisky(request.pattern);
  // A non-Worker context cannot impose a hard deadline on synchronous RegExp calls. Fail closed
  // for benchmarks and large workloads instead of letting a pasted expression freeze the page.
  if (request.mode === "benchmark") {
    return { mode: "benchmark", engine: "JavaScript RegExp", workerIsolated: false, executionSkipped: true,
      performanceRisk: "Benchmark skipped because no terminable Web Worker is available; a synchronous regex call cannot be given a hard deadline.",
      note: "No benchmark iterations executed. Run in a modern browser tab with module Worker support." };
  }
  const fallbackChars = request.samples.reduce((sum, sample) => sum + sample.text.length, 0);
  if (request.pattern.length > 512 || request.samples.length > 10 || request.samples.some((sample) => sample.text.length > 8_192) || fallbackChars > 32_768) {
    return { mode: request.mode, engine: "JavaScript RegExp", workerIsolated: false, executionSkipped: true,
      performanceRisk: "Fallback workload exceeds conservative no-Worker limits. No synchronous regex was executed.",
      limits: { patternCharacters: 512, samples: 10, sampleCharacters: 8_192, totalSampleCharacters: 32_768 }, results: [],
      note: "Use a modern browser with Worker support for larger or benchmark workloads." };
  }
  if (request.mode === "pipeline") {
    throw new Error("Substitution pipelines require an isolated Web Worker in this environment. Open this tool in a supported modern browser; the input has not been executed.");
  }
  if (risk && request.samples.some((sample) => sample.text.length > 24)) {
    return { mode: request.mode, pattern: request.pattern, flags: request.flags, engine: "JavaScript RegExp", workerIsolated: false, executionSkipped: true, performanceRisk: "Pattern resembles a high-backtracking-risk expression. Execution was skipped on samples longer than 24 UTF-16 code units because no killable Worker is available in this context.", results: request.samples.map((sample, sampleIndex) => ({ sampleIndex, label: sample.label, sample: sample.text, matchCount: 0, matches: [], preview: null, executionSkipped: sample.text.length > 24 })), note: "Static heuristic only; no general ReDoS proof is made." };
  }
  const started = Date.now();
  const re = new RegExp(request.pattern, request.flags);
  const rows = request.samples.map((sample) => {
    const one = new RegExp(request.pattern, request.flags);
    const matches: Array<Record<string, unknown>> = [];
    let found: RegExpExecArray | null;
    let truncated = false;
    while ((found = one.exec(sample.text)) !== null) {
      if (matches.length >= 500) { truncated = true; break; }
      matches.push({ match: found[0], index: found.index, end: found.index + found[0].length, groups: found.slice(1), namedGroups: found.groups ?? null, captures: found.groups ? Object.entries(found.groups).map(([name, value]) => ({ name, value })) : [] });
      if (!found[0]) one.lastIndex += sample.text.codePointAt(one.lastIndex)! > 0xffff ? 2 : 1;
    }
    const matched = matches.length > 0;
    const row: Record<string, unknown> = { label: sample.label, sample: sample.text.length > 1_000 ? `${sample.text.slice(0, 1_000)}… [truncated; ${sample.text.length} chars]` : sample.text, matched, matchCount: matches.length, matches, truncated, executionSkipped: false, elapsedMs: Date.now() - started };
    if (sample.expectMatch !== undefined || sample.expectMatches !== undefined) row.assertionPassed = (sample.expectMatch === undefined || sample.expectMatch === matched) && (sample.expectMatches === undefined || sample.expectMatches === matches.length);
    if (request.replacement !== "") { re.lastIndex = 0; row.preview = sample.text.replace(new RegExp(request.pattern, request.flags), request.replacement); }
    return row;
  });
  return { mode: "test", pattern: request.pattern, flags: request.flags, engine: "JavaScript RegExp", workerIsolated: false, sampleCount: rows.length, matchCount: rows.reduce((sum, row) => sum + Number(row.matchCount || 0), 0), results: rows, note: timedOutUnavailable ? "Worker unavailable; safe fallback mode used." : "No Worker available in this execution context; complex patterns are bounded by conservative heuristics." };
}

async function executeWorker(request: WorkerRequest, signal?: AbortSignal): Promise<Record<string, unknown> | null> {
  if (signal?.aborted) return { mode: request.mode, cancelled: true, executionSkipped: true, results: [], note: "The user cancelled this local regex run before execution." };
  if (typeof Worker === "undefined") return null;
  let worker: Worker;
  try { worker = new Worker(new URL("./developer-regex-worker.ts", import.meta.url), { type: "module", name: "enV-regex-sandbox" }); }
  catch { return null; }
  return new Promise((resolve, reject) => {
    const deadline = WORKER_DEADLINE_MS[request.mode];
    let settled = false;
    const finish = (action: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      signal?.removeEventListener("abort", onAbort);
      worker.terminate();
      action();
    };
    const onAbort = () => finish(() => resolve({ mode: request.mode, cancelled: true, workerIsolated: true, executionSkipped: true, timeBudgetMs: deadline, results: [], error: "Regex execution was stopped on request. The worker was terminated; no partial result is presented as complete." }));
    const timer = setTimeout(() => finish(() => resolve({ mode: request.mode, engine: "JavaScript RegExp", workerIsolated: true, timedOut: true, executionSkipped: true, timeBudgetMs: deadline, error: `Regex operation exceeded the ${deadline} ms hard worker budget. The worker was terminated; the page remains responsive. Reduce the sample, simplify the pattern, or benchmark fewer/smaller cases.`, results: [] })), deadline);
    signal?.addEventListener("abort", onAbort, { once: true });
    worker.onmessage = (event: MessageEvent<{ id: string; ok: boolean; result?: Record<string, unknown>; error?: string }>) => {
      if (event.data.id !== request.id) return;
      finish(() => {
        if (event.data.ok && event.data.result) resolve(event.data.result);
        else reject(new Error(event.data.error || "Regex worker failed."));
      });
    };
    worker.onerror = (event) => finish(() => reject(new Error(event.message || "Regex worker failed; no result was trusted.")));
    try { worker.postMessage(request); }
    catch (error) { finish(() => reject(error instanceof Error ? error : new Error(String(error)))); }
  });
}

function tokenizeRegex(pattern: string): string[] {
  const tokens: string[] = [];
  let i = 0;
  while (i < pattern.length) {
    const start = i;
    const char = pattern[i];
    if (char === "\\") {
      i += 1;
      if (i < pattern.length && pattern[i] === "k" && pattern[i + 1] === "<") { i += 2; while (i < pattern.length && pattern[i] !== ">") i += 1; if (i < pattern.length) i += 1; }
      else if (i < pattern.length && (pattern[i] === "p" || pattern[i] === "P") && pattern[i + 1] === "{") { i += 2; while (i < pattern.length && pattern[i] !== "}") i += 1; if (i < pattern.length) i += 1; }
      else if (i < pattern.length) { i += 1; if (/[1-9]/.test(pattern[start + 1] ?? "") && i < pattern.length && /\d/.test(pattern[i])) while (i < pattern.length && /\d/.test(pattern[i])) i += 1; }
    } else if (char === "[") {
      i += 1; let escaped = false;
      while (i < pattern.length) { const current = pattern[i++]; if (escaped) escaped = false; else if (current === "\\") escaped = true; else if (current === "]") break; }
    } else if (char === "(" && pattern[i + 1] === "?") {
      const end = ["(?<=", "(?<!", "(?=", "(?!", "(?:", "(?>", "(?(", "(?<"].find((prefix) => pattern.startsWith(prefix, i));
      if (end) { i += end.length; if (end === "(?<" ) { while (i < pattern.length && pattern[i] !== ">") i += 1; if (i < pattern.length) i += 1; } if (end === "(?(") { while (i < pattern.length && pattern[i] !== ")") i += 1; if (i < pattern.length) i += 1; } }
      else i += 1;
    } else if (char === "{" && /^\{\d+(?:,\d*)?\}/.test(pattern.slice(i))) {
      const token = pattern.slice(i).match(/^\{\d+(?:,\d*)?\}/)![0]; i += token.length;
    } else if ((char === "*" || char === "+" || char === "?") && pattern[i + 1] === "?") i += 2;
    else i += 1;
    tokens.push(pattern.slice(start, i));
  }
  return tokens;
}

function formatRegex(pattern: string): string {
  if (pattern.length > MAX_PATTERN) throw new Error(`Regex pattern exceeds ${MAX_PATTERN.toLocaleString()} characters.`);
  const tokens = tokenizeRegex(pattern);
  const lines = tokens.map((token) => `  ${JSON.stringify(token)},`).join("\n");
  const reconstructed = tokens.join("");
  return JSON.stringify({ mode: "format", engine: "JavaScript RegExp", original: pattern, source: `const pattern = [\n${lines}${lines ? "\n" : ""}].join("");`, parts: tokens.length, roundTripExact: reconstructed === pattern, note: "This creates readable JavaScript source segments while preserving the exact regex source. The generated pattern joins the segments without adding any whitespace; copy the array expression, not the display lines as a regex literal." }, null, 2);
}

function analyzeFlavor(pattern: string): string {
  const findings: Array<{ feature: string; finding: string; flavors: string[]; severity: string }> = [];
  const add = (feature: string, finding: string, flavors: string[], severity = "warning") => findings.push({ feature, finding, flavors, severity });
  if (/\(\?P</.test(pattern)) add("Python named group", "Python-style (?P<name>...) named groups are not JavaScript RegExp syntax; use (?<name>...) for modern JavaScript or translate deliberately.", ["Python", "PCRE2"], "error");
  if (/\\[AKzZ]/.test(pattern)) add("Absolute anchors", "\\A, \\Z and \\z have flavor-specific meanings and are not portable JavaScript anchors.", ["PCRE2", "Python (subset varies)", "Java/.NET variants"], "warning");
  if (/\\K/.test(pattern)) add("Match reset", "PCRE-style \\K resets the reported match start and is not supported by JavaScript RegExp.", ["PCRE2"], "error");
  if (/\(\?[imsx-]+\)/.test(pattern)) add("Inline mode modifier", "Inline modifiers such as (?i) are flavor-dependent; JavaScript uses flags on the RegExp object/literal.", ["PCRE2", "Python", "Java/.NET variants"], "error");
  if (/\(\?>/.test(pattern)) add("Atomic group", "Atomic groups are not supported in all JavaScript runtimes/flavors; test the exact browser target before converting.", ["PCRE2", "Python 3.11+", "Java/.NET"], "warning");
  if (/\(\?\(/.test(pattern)) add("Conditional group", "Conditional subpatterns are not part of JavaScript RegExp syntax.", ["PCRE2", "Python/Perl variants"], "error");
  if (/\(\?<[=!]/.test(pattern)) add("Lookbehind", "Lookbehind support and accepted length rules vary between regex flavors and runtime versions.", ["Modern JavaScript", "Python", "PCRE2", "Java/.NET"], "warning");
  if (/\(\?P=/.test(pattern)) add("Python named backreference", "(?P=name) is Python-style; JavaScript uses \\k<name> where supported.", ["Python"], "error");
  if (/\(\*[^)]*\)/.test(pattern)) add("Control verb", "PCRE control verbs are flavor-specific and cannot be executed as JavaScript RegExp.", ["PCRE2"], "error");
  if (/\(\?<([A-Za-z_$][\w$]*)>/.test(pattern)) add("Named capture", "Named capture syntax is supported by modern JavaScript and several other flavors, but spelling and version support differ.", ["Modern JavaScript", "PCRE2", "Python", "Java/.NET"], "info");
  if (/\\[1-9]/.test(pattern) && /[+*{]/.test(pattern)) add("Backreference and quantifier", "Backreferences combined with repetition can increase backtracking cost; this is a risk signal, not proof of ReDoS.", ["Backtracking engines"], "warning");
  if (!findings.length) add("No known portability issue detected", "This static scanner found no covered syntax markers. It does not compile the pattern in other engines or prove semantic equivalence.", ["JavaScript", "PCRE2", "Python", "Java", ".NET", "Go RE2"], "info");
  return JSON.stringify({ mode: "flavors", defaultEngine: "JavaScript RegExp", coverage: ["JavaScript", "PCRE2", "Python", "Java", ".NET", "Go RE2"], findings, note: "Static compatibility hints only. This tool does not run regexes under every flavor, convert patterns automatically, or guarantee semantic equivalence. Always test against representative fixtures in the target runtime." }, null, 2);
}

export async function runRegexStudio(pattern: string, rawSamples: string, flags: string, replacement: string, mode: RegexStudioMode, signal?: AbortSignal): Promise<string> {
  if (pattern.length > MAX_PATTERN) throw new Error(`Regex pattern exceeds ${MAX_PATTERN.toLocaleString()} characters.`);
  if (signal?.aborted) return JSON.stringify({ mode, cancelled: true, executionSkipped: true, results: [], note: "The user cancelled this local regex run before execution." }, null, 2);
  if (mode === "format") return formatRegex(pattern);
  if (mode === "flavors") return analyzeFlavor(pattern);
  const normalized = normalizeFlags(flags);
  if (mode === "pipeline") {
    let config: unknown;
    try { config = JSON.parse(rawSamples); } catch { throw new Error('Pipeline input must be JSON: {"input":"...","layers":[{"name":"Layer 1","pattern":"...","flags":"g","replacement":"..."}]}'); }
    if (!config || typeof config !== "object" || Array.isArray(config)) throw new Error("Pipeline configuration must be a JSON object.");
    const object = config as Record<string, unknown>;
    if (typeof object.input !== "string") throw new Error("Pipeline JSON needs an 'input' string.");
    if (!Array.isArray(object.layers)) throw new Error("Pipeline JSON needs a 'layers' array.");
    const layers = object.layers.map((layer, index) => {
      if (!layer || typeof layer !== "object" || Array.isArray(layer)) throw new Error(`Pipeline layer ${index + 1} must be an object.`);
      const item = layer as Record<string, unknown>;
      if (typeof item.pattern !== "string" || typeof item.replacement !== "string") throw new Error(`Pipeline layer ${index + 1} needs string pattern and replacement fields.`);
      return { name: typeof item.name === "string" ? item.name.slice(0, 120) : undefined, pattern: item.pattern, flags: typeof item.flags === "string" ? normalizeFlags(item.flags) : normalized, replacement: item.replacement };
    });
    if (object.input.length > MAX_LAYER_INPUT) throw new Error(`Regex pipeline input exceeds ${MAX_LAYER_INPUT.toLocaleString()} characters.`);
    if (layers.length < 1 || layers.length > 12) throw new Error("A substitution pipeline must contain between 1 and 12 layers.");
    const request: WorkerRequest = { id: crypto.randomUUID?.() ?? `${Date.now()}-${Math.random()}`, mode: "pipeline", pattern, flags: normalized, samples: [], replacement, pipelineInput: object.input, layers };
    const result = await executeWorker(request, signal);
    if (result) return JSON.stringify(result, null, 2);
    throw new Error("Substitution pipelines are disabled because this environment cannot provide a killable Web Worker. Your input has not been executed.");
  }
  if (!rawSamples.trim()) throw new Error("Enter at least one test string.");
  const { samples, config } = parseSamples(rawSamples);
  if (samples.length === 0) throw new Error("Enter at least one sample in the 'samples' array.");
  const configuredReplacement = typeof config?.replacement === "string" ? config.replacement : replacement;
  const iterations = Number.isInteger(config?.iterations) ? Number(config?.iterations) : 15;
  const request: WorkerRequest = { id: crypto.randomUUID?.() ?? `${Date.now()}-${Math.random()}`, mode, pattern, flags: normalized, samples, replacement: configuredReplacement, iterations };
  // Compile here for immediate, actionable validation without executing against user input.
  try { new RegExp(pattern, normalized); } catch (error) { throw new Error(`Invalid JavaScript RegExp: ${error instanceof Error ? error.message : String(error)}`); }
  const isolated = await executeWorker(request, signal);
  const result = isolated ?? safeFallback(request);
  if (result.cancelled || result.timedOut) return JSON.stringify(result, null, 2);
  if (!result.workerIsolated) {
    result.performanceRisk = looksRisky(pattern) ? result.performanceRisk : "No suspicious nested-quantifier shape detected by the static heuristic. This is not proof that a regex is safe.";
    result.workerIsolationNote = "The hard execution deadline is enforced only when running in a modern browser with module Web Worker support. In the fallback context, conservative heuristics skip likely risky workloads instead of promising a hard timeout.";
  }
  if (looksRisky(pattern)) result.performanceRisk ??= "Pattern resembles a high-backtracking-risk regex. This is a heuristic only; inspect it with adversarial near-miss inputs before production use.";
  return JSON.stringify(result, null, 2);
}
