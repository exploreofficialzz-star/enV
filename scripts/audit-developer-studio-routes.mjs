import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { developerStudioExample } from '../src/lib/engines/developer-studio-examples.ts';
import { runDeveloperStudio } from '../src/lib/engines/developer-studios.ts';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
function readCatalog(file) {
  const source = readFileSync(file, 'utf8');
  const start = source.indexOf('const catalogJson = [');
  const end = source.indexOf('].join("")', start);
  if (start < 0 || end < 0) throw new Error(`Catalog JSON block not found: ${file}`);
  const chunks = [...source.slice(start + 'const catalogJson = ['.length, end).matchAll(/"(?:\\.|[^"\\])*"/g)].map((m) => JSON.parse(m[0]));
  return JSON.parse(chunks.join(''));
}
const catalog = readCatalog(resolve(root, 'src/data/catalog.ts'));
const tools = catalog.filter((tool) => tool.category === 'developer' && tool.engine?.type === 'developer');
const fixedNow = new Date('2026-01-01T00:00:00.000Z');
const failures = [];
const suspicious = [];
const expectedErrors = [];
for (const tool of tools) {
  const op = tool.engine.op;
  const sample = developerStudioExample(op);
  try {
    const output = await runDeveloperStudio(op, sample.input, sample.secondary ?? '', sample.flags ?? 'g', fixedNow, sample.replacement ?? '');
    if (typeof output !== 'string' || output.trim().length === 0) {
      failures.push({ id: tool.id, slug: tool.slug, op, error: 'No output returned.' });
      continue;
    }
    if (/Local input analysis completed|No stack preset is defined|Generated developer template ready|X utility for the enV toolkit/i.test(output)) {
      suspicious.push({ id: tool.id, slug: tool.slug, op, output: output.slice(0, 180) });
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (op === 'hash-decoder' && /one-way|cannot be decoded/i.test(message)) expectedErrors.push({ id: tool.id, slug: tool.slug, op, reason: message });
    else failures.push({ id: tool.id, slug: tool.slug, op, error: message });
  }
}
const report = {
  date: '2026-10-13',
  scope: 'All catalog entries category=developer and engine.type=developer (Web local engine smoke using each tool’s own Load example fixture)',
  catalogEntries: tools.length,
  passed: tools.length - failures.length - suspicious.length,
  intentionalDomainErrors: expectedErrors.length,
  failures,
  suspiciousGenericFallbacks: suspicious,
  intentionalDomainErrorDetails: expectedErrors,
};
writeFileSync(resolve(root, 'audit/developer-route-smoke-results.json'), `${JSON.stringify(report, null, 2)}\n`);
console.log(`Developer route smoke: ${tools.length} operations; failures=${failures.length}; generic placeholders=${suspicious.length}; expected domain errors=${expectedErrors.length}.`);
if (failures.length || suspicious.length) {
  console.log(JSON.stringify({ failures, suspicious }, null, 2));
  process.exitCode = 1;
}
