#!/usr/bin/env node
/**
 * Reproducible local formatter baseline. The report stores timings and output hashes only;
 * source fixtures are never copied into the report. This is not a competitor benchmark.
 */
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { createHash } from 'node:crypto';
import os from 'node:os';
import { performance } from 'node:perf_hooks';
import { formatSqlWithDialect, formatStructuredWithParser } from '../src/lib/engines/precise-formatters.ts';

const root = resolve(new URL('..', import.meta.url).pathname);
const packageJson = JSON.parse(await readFile(resolve(root, 'package.json'), 'utf8'));
const packageLock = JSON.parse(await readFile(resolve(root, 'package-lock.json'), 'utf8'));
const corpus = JSON.parse(await readFile(resolve(root, 'tests/fixtures/developer-studio-golden.json'), 'utf8'));
const reportArg = process.argv.slice(2).find((arg) => arg.startsWith('--report='))?.slice('--report='.length)
  ?? (process.argv.includes('--report') ? process.argv[process.argv.indexOf('--report') + 1] : null)
  ?? process.env.EN_V_BENCHMARK_REPORT
  ?? 'audit/developer-tool-benchmark.json';
const reportPath = resolve(root, reportArg);
const warmups = Math.max(1, Number(process.env.EN_V_BENCH_WARMUPS || 2));
const iterations = Math.max(5, Math.min(100, Number(process.env.EN_V_BENCH_ITERATIONS || 12)));
const cases = [];
for (const language of ['css', 'html', 'xml', 'yaml', 'markdown', 'graphql']) {
  cases.push({ id: `prettier-${language}`, language, input: corpus.parserFormatters[language].input,
    run: () => formatStructuredWithParser(corpus.parserFormatters[language].input, language) });
}
for (const fixture of corpus.parserFormatters.sqlDialects) {
  cases.push({ id: `sql-${fixture.dialect}`, language: 'sql', input: fixture.input,
    run: () => formatSqlWithDialect(fixture.input, fixture.dialect) });
}
const sha256 = (value) => createHash('sha256').update(value).digest('hex');
const percentile = (values, p) => [...values].sort((a, b) => a - b)[Math.min(values.length - 1, Math.ceil(values.length * p) - 1)];
const results = [];
for (const item of cases) {
  const samples = [];
  const outputHashes = [];
  let outputChars = 0;
  try {
    for (let index = 0; index < warmups; index += 1) {
      const output = await item.run();
      if (!output.trim()) throw new Error('Formatter returned empty output for non-empty golden input.');
    }
    for (let index = 0; index < iterations; index += 1) {
      const start = performance.now();
      const output = await item.run();
      samples.push(Number((performance.now() - start).toFixed(3)));
      if (!output.trim()) throw new Error('Formatter returned empty output for non-empty golden input.');
      outputHashes.push(sha256(output));
      outputChars = output.length;
    }
    results.push({ id: item.id, language: item.language, inputChars: item.input.length, outputChars,
      iterations, warmups, medianMs: percentile(samples, 0.5), p95Ms: percentile(samples, 0.95),
      maxMs: Math.max(...samples), minMs: Math.min(...samples), outputSha256: outputHashes[0],
      stableOutput: new Set(outputHashes).size === 1, status: new Set(outputHashes).size === 1 ? 'pass' : 'fail' });
  } catch (error) {
    results.push({ id: item.id, language: item.language, inputChars: item.input.length, iterations, warmups,
      status: 'error', error: error instanceof Error ? error.message : String(error) });
  }
}
const report = {
  schemaVersion: 1,
  reportType: 'enV local formatter performance/reproducibility baseline',
  note: 'This is not a competitor comparison. Compare only runs from documented equivalent environments and identical corpus/version settings.',
  runAt: new Date().toISOString(),
  environment: { node: process.version, platform: process.platform, arch: process.arch, release: os.release(), cpus: os.cpus().length },
  dependencies: {
    prettier: { declared: packageJson.dependencies?.prettier ?? packageJson.devDependencies?.prettier ?? null, locked: packageLock.packages?.['node_modules/prettier']?.version ?? null },
    sqlFormatter: { declared: packageJson.dependencies?.['sql-formatter'] ?? null, locked: packageLock.packages?.['node_modules/sql-formatter']?.version ?? null },
  },
  iterations, warmups, totalCases: cases.length,
  passed: results.filter((item) => item.status === 'pass').length,
  failed: results.filter((item) => item.status !== 'pass').length,
  results,
};
await mkdir(dirname(reportPath), { recursive: true });
await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);
console.log(`Formatter baseline: passed=${report.passed}/${report.totalCases}; failed=${report.failed}; report=${reportPath}`);
if (report.failed) process.exitCode = 1;
