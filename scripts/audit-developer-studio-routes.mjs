import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { developerStudioExample } from '../src/lib/engines/developer-studio-examples.ts';
import { runDeveloperStudio } from '../src/lib/engines/developer-studios.ts';
import { DEVELOPER_STUDIOS, developerActionForLegacySlug, developerModeForLegacySlug, developerStudioForLegacySlug, makeDeveloperStudioTools } from '../src/lib/developer-studios-catalog.ts';

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
const allDeveloper = catalog.filter((tool) => tool.category === 'developer');
const tools = allDeveloper.filter((tool) => tool.engine?.type === 'developer');
const fixedNow = new Date('2026-01-01T00:00:00.000Z');
const failures = [];
const suspicious = [];
const expectedErrors = [];
const environmentBlocked = [];
const mappingFailures = [];
const originalSlugs = new Set(allDeveloper.map((tool) => tool.slug));
for (const studio of DEVELOPER_STUDIOS) {
  if (!studio.modes.length || !studio.sourceId || !allDeveloper.some((tool) => tool.id === studio.sourceId)) mappingFailures.push({ studio: studio.slug, error: 'Missing mode or source catalog record.' });
  for (const mode of studio.modes) if (!mode.key || !mode.op) mappingFailures.push({ studio: studio.slug, mode: mode.key, error: 'Mode key or operation is empty.' });
  if (originalSlugs.has(studio.slug)) mappingFailures.push({ studio: studio.slug, error: 'Studio route collides with a pre-existing Developer slug.' });
}
for (const tool of allDeveloper) {
  const studio = developerStudioForLegacySlug(tool.slug);
  const mode = developerModeForLegacySlug(studio, tool.slug);
  if (!DEVELOPER_STUDIOS.some((entry) => entry.id === studio.id) || !studio.modes.some((entry) => entry.key === mode)) mappingFailures.push({ slug: tool.slug, studio: studio.slug, mode, error: 'Invalid legacy route-to-Studio mapping.' });
}
const virtualStudioTools = makeDeveloperStudioTools(catalog);
if (virtualStudioTools.length !== DEVELOPER_STUDIOS.length) mappingFailures.push({ expectedStudios: DEVELOPER_STUDIOS.length, actualStudios: virtualStudioTools.length, error: 'Virtual Studio routes missing.' });
const legacyRouteMap = allDeveloper.map((tool) => {
  const studio = developerStudioForLegacySlug(tool.slug);
  const mode = developerModeForLegacySlug(studio, tool.slug);
  const selectedMode = studio.modes.find((entry) => entry.key === mode);
  return {
    legacyId: tool.id,
    legacySlug: tool.slug,
    legacyRoute: `/tools/developer/${tool.slug}`,
    studioId: studio.id,
    studioName: studio.name,
    studioRoute: `/tools/developer/${studio.slug}`,
    mode,
    modeLabel: selectedMode?.label ?? mode,
    operation: tool.engine?.op ?? (tool.engine?.type === 'developer' ? tool.id : tool.engine?.type),
    action: developerActionForLegacySlug(studio, tool.slug),
  };
});
if (legacyRouteMap.length !== 474) mappingFailures.push({ expected: 474, actual: legacyRouteMap.length, error: 'Legacy route map must include every original Developer slug.' });
writeFileSync(resolve(root, 'audit/developer-studio-route-map.json'), `${JSON.stringify({ date: new Date().toISOString().slice(0, 10), studioRoutes: DEVELOPER_STUDIOS.map((studio) => ({ id: studio.id, name: studio.name, route: `/tools/developer/${studio.slug}`, modes: studio.modes.map(({ key, label, op }) => ({ key, label, operation: op })) })), legacyRouteCount: legacyRouteMap.length, routes: legacyRouteMap }, null, 2)}\n`);
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
    else if (/Cannot find (?:package|module)|ERR_MODULE_NOT_FOUND|Failed to load/i.test(message) && /(?:prettier|sql-formatter|typescript)/i.test(message)) environmentBlocked.push({ id: tool.id, slug: tool.slug, op, error: message });
    else failures.push({ id: tool.id, slug: tool.slug, op, error: message });
  }
}
const report = {
  date: new Date().toISOString().slice(0, 10),
  scope: 'All Developer catalog entries route-mapped, plus executable smoke for every category=developer and engine.type=developer entry using that tool’s Load example fixture.',
  developerCatalogEntries: allDeveloper.length,
  executableDeveloperEngineEntries: tools.length,
  studioModes: DEVELOPER_STUDIOS.reduce((sum, studio) => sum + studio.modes.length, 0),
  routeMapFile: 'audit/developer-studio-route-map.json',
  mappedLegacyRoutes: allDeveloper.length - mappingFailures.filter((item) => item.slug).length,
  studioRoutes: DEVELOPER_STUDIOS.length,
  virtualStudioRoutes: virtualStudioTools.length,
  passed: tools.length - failures.length - suspicious.length - environmentBlocked.length - expectedErrors.length,
  environmentBlockedChecks: environmentBlocked.length,
  intentionalDomainErrors: expectedErrors.length,
  mappingFailures,
  environmentBlocked,
  failures,
  suspiciousGenericFallbacks: suspicious,
  intentionalDomainErrorDetails: expectedErrors,
};
writeFileSync(resolve(root, 'audit/developer-route-smoke-results.json'), `${JSON.stringify(report, null, 2)}\n`);
console.log(`Developer Studio audit: legacy routes=${allDeveloper.length}; Studios=${DEVELOPER_STUDIOS.length}; executable smoke=${tools.length}; failures=${failures.length}; environment-blocked=${environmentBlocked.length}; mapping failures=${mappingFailures.length}; generic placeholders=${suspicious.length}; expected domain errors=${expectedErrors.length}.`);
if (failures.length || suspicious.length || mappingFailures.length) {
  console.log(JSON.stringify({ failures, suspicious, mappingFailures, environmentBlocked }, null, 2));
  process.exitCode = 1;
}
