/**
 * Isolated regex execution worker. The parent owns a hard wall-clock deadline and
 * terminates this worker if a single RegExp call does not return. Keep all user
 * payload processing in this worker; it intentionally performs no network I/O.
 */
type Sample = { label: string; text: string; expectMatch?: boolean; expectMatches?: number };
type Layer = { name?: string; pattern: string; flags?: string; replacement: string };
type RegexWorkerRequest = { id: string; mode: "test" | "benchmark" | "pipeline"; pattern: string; flags: string; samples: Sample[]; replacement: string; iterations?: number; pipelineInput?: string; layers?: Layer[] };
const MAX_PATTERN = 5_000;
const MAX_SAMPLE_COUNT = 100;
const MAX_SAMPLE_BYTES = 1_000_000;
const MAX_MATCHES_PER_SAMPLE = 250;
const MAX_DISPLAY_TEXT = 1_000;
const MAX_LAYER_OUTPUT = 250_000;
const MAX_REPORT_BYTES = 2_000_000;
const RISK_HEURISTIC = /\([^)]*[+*][^)]*\)[+*{]|(?:\.\*|\.\+).*(?:\.\*|\.\+)|\([^)]*\|[^)]*\)[+*{]|(?:\\[1-9])[+*{]/;

const scope = self as unknown as { addEventListener: (type: string, listener: (event: MessageEvent<RegexWorkerRequest>) => void) => void; postMessage: (message: unknown) => void };

function regexFlags(flags: string): string {
  const normalized = [...new Set(flags)].join("");
  return normalized.includes("g") ? normalized : `${normalized}g`;
}
function clock(): number { return typeof performance !== "undefined" ? performance.now() : Date.now(); }
function short(value: string, max = MAX_DISPLAY_TEXT): { value: string; originalLength: number; truncated: boolean } {
  return { value: value.length > max ? `${value.slice(0, max)}…` : value, originalLength: value.length, truncated: value.length > max };
}
function validateRequest(request: RegexWorkerRequest): void {
  if (typeof request.pattern !== "string" || request.pattern.length > MAX_PATTERN) throw new Error(`Regex pattern must be at most ${MAX_PATTERN} characters.`);
  if (!Array.isArray(request.samples) || request.samples.length > MAX_SAMPLE_COUNT) throw new Error(`Regex run accepts at most ${MAX_SAMPLE_COUNT} samples.`);
  const sampleBytes = request.samples.reduce((sum, sample) => sum + new TextEncoder().encode(sample.text).byteLength, 0);
  if (sampleBytes > MAX_SAMPLE_BYTES) throw new Error(`Regex sample input exceeds the ${MAX_SAMPLE_BYTES.toLocaleString()} byte safety limit.`);
  if (request.replacement.length > 10_000) throw new Error("Regex replacement text exceeds 10,000 characters.");
}
function oneSample(pattern: string, flags: string, sample: Sample, replacement: string, includePreview: boolean) {
  const started = clock();
  const re = new RegExp(pattern, regexFlags(flags));
  const matches: Array<Record<string, unknown>> = [];
  let match: RegExpExecArray | null;
  let truncated = false;
  while ((match = re.exec(sample.text)) !== null) {
    if (matches.length >= MAX_MATCHES_PER_SAMPLE) { truncated = true; break; }
    const index = match.index;
    const groups = match.slice(1);
    const namedGroups = match.groups ? { ...match.groups } : null;
    const displayed = short(match[0]);
    matches.push({ match: displayed.value, originalMatchLength: displayed.originalLength, matchTextTruncated: displayed.truncated, index, end: index + match[0].length, groups: groups.map((value) => value == null ? null : short(value, 500).value), namedGroups: namedGroups ? Object.fromEntries(Object.entries(namedGroups).map(([name, value]) => [name, value == null ? null : short(value, 500).value])) : null, captures: namedGroups ? Object.entries(namedGroups).map(([name, value]) => ({ name, value: value == null ? null : short(value, 500).value })) : [] });
    // ECMAScript exec() can return an empty match without advancing lastIndex.
    if (match[0] === "") {
      const point = sample.text.codePointAt(re.lastIndex);
      re.lastIndex += point !== undefined && point > 0xffff ? 2 : 1;
    }
  }
  const elapsedMs = Math.max(0, clock() - started);
  const actual = matches.length > 0;
  const row: Record<string, unknown> = {
    label: sample.label,
    sample: sample.text,
    matchCount: matches.length,
    matched: actual,
    matches,
    truncated,
    elapsedMs: Number(elapsedMs.toFixed(3)),
    executionSkipped: false,
  };
  if (sample.expectMatch !== undefined || sample.expectMatches !== undefined) {
    const passed = (sample.expectMatch === undefined || sample.expectMatch === actual) && (sample.expectMatches === undefined || sample.expectMatches === matches.length);
    row.expected = { match: sample.expectMatch ?? null, matchCount: sample.expectMatches ?? null };
    row.assertionPassed = passed;
  }
  if (includePreview) row.preview = sample.text.replace(new RegExp(pattern, regexFlags(flags)), replacement);
  return row;
}
function percentile(values: number[], p: number): number {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil(p * sorted.length) - 1))];
}
function run(request: RegexWorkerRequest): Record<string, unknown> {
  validateRequest(request);
  if (request.mode === "pipeline") {
    let current = request.pipelineInput ?? "";
    if (current.length > 100_000) throw new Error("Regex pipeline input exceeds 100,000 UTF-16 code units.");
    if (!Array.isArray(request.layers) || request.layers.length < 1 || request.layers.length > 12) throw new Error("A substitution pipeline must contain between 1 and 12 layers.");
    const rows: Array<Record<string, unknown>> = [];
    request.layers.forEach((layer, index) => {
      if (!layer || typeof layer.pattern !== "string" || typeof layer.replacement !== "string") throw new Error(`Pipeline layer ${index + 1} needs a pattern and replacement string.`);
      if (layer.pattern.length > 5000 || layer.replacement.length > 10_000) throw new Error(`Pipeline layer ${index + 1} exceeds the pattern or replacement size limit.`);
      const input = current;
      const started = clock();
      const pattern = new RegExp(layer.pattern, regexFlags(layer.flags ?? request.flags));
      const preview = input.replace(pattern, layer.replacement);
      const elapsedMs = Math.max(0, clock() - started);
      if (preview.length > MAX_LAYER_OUTPUT) throw new Error(`Pipeline layer ${index + 1} output exceeds ${MAX_LAYER_OUTPUT.toLocaleString()} characters; execution stopped.`);
      const countRegex = new RegExp(layer.pattern, regexFlags(layer.flags ?? request.flags));
      let replacements = 0; let found: RegExpExecArray | null;
      while ((found = countRegex.exec(input)) !== null && replacements < 10_000) {
        replacements += 1;
        if (!found[0]) countRegex.lastIndex += input.codePointAt(countRegex.lastIndex)! > 0xffff ? 2 : 1;
      }
      rows.push({ index, name: layer.name?.trim() || `Layer ${index + 1}`, pattern: layer.pattern, flags: regexFlags(layer.flags ?? request.flags), replacement: layer.replacement, input, output: preview, replacements, elapsedMs: Number(elapsedMs.toFixed(3)), changed: preview !== input, outputCharacters: preview.length });
      current = preview;
    });
    return { mode: "pipeline", engine: "JavaScript RegExp", workerIsolated: true, layerCount: rows.length, totalReplacements: rows.reduce((sum, row) => sum + Number(row.replacements || 0), 0), totalElapsedMs: Number(rows.reduce((sum, row) => sum + Number(row.elapsedMs || 0), 0).toFixed(3)), initialCharacters: (request.pipelineInput ?? "").length, finalCharacters: current.length, layers: rows, output: current, note: "Layer results are local to this browser. JavaScript replacement syntax is used ($1, $<name>, $&, $`, $')." };
  }

  if (request.mode === "benchmark") {
    const iterations = Math.max(5, Math.min(30, Math.trunc(request.iterations ?? 15)));
    const timings: number[] = [];
    const perSampleTimings = request.samples.map(() => [] as number[]);
    let sampleRows: Array<Record<string, unknown>> = [];
    // Warm-up once; if any match blocks, the owning page terminates this worker.
    if (RISK_HEURISTIC.test(request.pattern)) throw new Error("Benchmark skipped: the expression matches a high-backtracking-risk heuristic. Rewrite the pattern or use smaller, verified fixtures before measuring it.");
    for (const sample of request.samples) oneSample(request.pattern, request.flags, sample, request.replacement, false);
    for (let iteration = 0; iteration < iterations; iteration += 1) {
      const started = clock();
      sampleRows = request.samples.map((sample, sampleIndex) => {
        const row = oneSample(request.pattern, request.flags, sample, request.replacement, false);
        perSampleTimings[sampleIndex].push(Number(row.elapsedMs ?? 0));
        return row;
      });
      timings.push(Math.max(0, clock() - started));
    }
    const medianMs = percentile(timings, 0.5);
    const p95Ms = percentile(timings, 0.95);
    const chars = request.samples.reduce((sum, sample) => sum + sample.text.length, 0);
    const sampleMetrics = perSampleTimings.map((values, index) => {
      const median = percentile(values, 0.5); const p95 = percentile(values, 0.95);
      return { label: request.samples[index].label, characters: request.samples[index].text.length, medianMs: Number(median.toFixed(3)), p95Ms: Number(p95.toFixed(3)), minMs: Number(Math.min(...values).toFixed(3)), maxMs: Number(Math.max(...values).toFixed(3)), charactersPerSecond: median > 0 ? Math.round(request.samples[index].text.length * 1000 / median) : null };
    });
    const totalElapsed = timings.reduce((sum, value) => sum + value, 0);
    const variance = timings.length ? timings.reduce((sum, value) => sum + (value - medianMs) ** 2, 0) / timings.length : 0;
    return { mode: "benchmark", engine: "JavaScript RegExp", workerIsolated: true, iterations, sampleCount: request.samples.length, medianMs: Number(medianMs.toFixed(3)), p95Ms: Number(p95Ms.toFixed(3)), jitterStdDevMs: Number(Math.sqrt(variance).toFixed(3)), minMs: Number(Math.min(...timings).toFixed(3)), maxMs: Number(Math.max(...timings).toFixed(3)), totalMeasuredMs: Number(totalElapsed.toFixed(3)), medianCharactersPerSecond: medianMs > 0 ? Math.round(chars * 1000 / medianMs) : null, elapsedSamplesMs: timings.map((value) => Number(value.toFixed(3))), samples: sampleMetrics, result: sampleRows.map(({ label, matchCount }) => ({ label, matchCount })), note: "Measured in this worker on this device. Median, p95 and jitter depend on browser scheduling, CPU load and garbage collection; compare candidates only on the same device/runtime and fixture set. This is not a cross-machine score or a formal ReDoS proof." };
  }

  const rows = request.samples.map((sample) => oneSample(request.pattern, request.flags, sample, request.replacement, request.mode === "test" && request.replacement !== ""));
  const result = { mode: "test", pattern: request.pattern, flags: regexFlags(request.flags), engine: "JavaScript RegExp", workerIsolated: true, sampleCount: rows.length, matchCount: rows.reduce((sum, row) => sum + Number(row.matchCount || 0), 0), assertionCount: rows.filter((row) => row.assertionPassed !== undefined).length, assertionsPassed: rows.filter((row) => row.assertionPassed === true).length, assertionFailures: rows.filter((row) => row.assertionPassed === false).map((row) => row.label), performanceRisk: RISK_HEURISTIC.test(request.pattern) ? "Static high-backtracking-risk heuristic matched. Test with adversarial near misses in an isolated runtime; this is not a full ReDoS detector." : "No covered high-risk shape detected. This does not prove the expression is safe.", results: rows, note: "Capture offsets are UTF-16 code-unit offsets, matching JavaScript string indexes. Named captures and numbered captures are returned separately; displayed match text can be truncated while offsets and original length remain exact." };
  if (new TextEncoder().encode(JSON.stringify(result)).byteLength > MAX_REPORT_BYTES) throw new Error("Regex results would exceed the 2 MB report limit. Use fewer samples, fewer captures, or shorter inputs.");
  return result;
}

scope.addEventListener("message", (event) => {
  const request = event.data;
  try { scope.postMessage({ id: request.id, ok: true, result: run(request) }); }
  catch (error) { scope.postMessage({ id: request.id, ok: false, error: error instanceof Error ? error.message : String(error) }); }
});
