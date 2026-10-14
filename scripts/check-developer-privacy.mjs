#!/usr/bin/env node
/** Static privacy tripwire for tool-engine sources. Runtime capture is in the Playwright audit. */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(new URL('..', import.meta.url).pathname);
const sourceFiles = [
  'src/lib/engines/regex-studio.ts',
  'src/lib/engines/developer-regex-worker.ts',
  'src/lib/engines/developer-studios.ts',
  'src/components/engines/developer-engine.tsx',
  'src/components/engines/io-engines.tsx',
  'apps/android/app/src/main/java/com/chastech/env/engine/NativeRegexStudio.kt',
  'apps/android/app/src/main/java/com/chastech/env/engine/NativeTextEngine.kt',
  'apps/android/app/src/main/java/com/chastech/env/engine/NativeUtilityEngine.kt',
  'apps/ios/enV/NativeRegexStudio.swift',
  'apps/ios/enV/NativeTextEngine.swift',
  'apps/ios/enV/NativeUtilityEngine.swift',
];
const failures = [];
for (const relative of sourceFiles) {
  const source = readFileSync(resolve(root, relative), 'utf8');
  // Linear scanner: remove comments and quoted strings without catastrophic regex backtracking.
  // Template literals are treated as strings; this guard is supplementary to runtime capture.
  let code = '';
  let state = 'code';
  for (let i = 0; i < source.length; i++) {
    const ch = source[i];
    const next = source[i + 1] ?? '';
    if (state === 'line-comment') { if (ch === '\n') { state = 'code'; code += '\n'; } continue; }
    if (state === 'block-comment') { if (ch === '*' && next === '/') { state = 'code'; i++; } else if (ch === '\n') code += '\n'; continue; }
    if (state === 'single' || state === 'double' || state === 'template') {
      if (ch === '\\') { i++; continue; }
      if ((state === 'single' && ch === "'") || (state === 'double' && ch === '\"') || (state === 'template' && ch === '`')) state = 'code';
      continue;
    }
    if (ch === '/' && next === '/') { state = 'line-comment'; i++; continue; }
    if (ch === '/' && next === '*') { state = 'block-comment'; i++; continue; }
    if (ch === "'") { state = 'single'; continue; }
    if (ch === '\"') { state = 'double'; continue; }
    if (ch === '`') { state = 'template'; continue; }
    code += ch;
  }
  const patterns = [
    ['network request primitive', /\b(?:fetch|XMLHttpRequest|sendBeacon)\s*\(|\bURLSession\b|\bHttpURLConnection\b|\bOkHttpClient\b/],
    ['payload persistence primitive', /\b(?:localStorage|sessionStorage|indexedDB)\s*\.|\bUserDefaults\b|\bSharedPreferences\b/],
  ];
  for (const [label, regex] of patterns) if (regex.test(code)) failures.push({ file: relative, label });
}
// The site's current persistence module is intentionally limited to preferences, recent tool IDs,
// and aggregate counts. Fail if it starts persisting arbitrary payload values by spreading input.
const storage = readFileSync(resolve(root, 'src/lib/storage.ts'), 'utf8');
for (const forbidden of [/input\s*:/i, /payload\s*:/i, /sampleText\s*:/i, /lastInput/i, /historyPayload/i]) {
  if (forbidden.test(storage)) failures.push({ file: 'src/lib/storage.ts', label: `possible payload-history field ${forbidden}` });
}
if (failures.length) {
  console.error('Developer privacy source guard failed:');
  for (const failure of failures) console.error(`- ${failure.file}: ${failure.label}`);
  process.exitCode = 1;
} else {
  console.log(`Developer privacy source guard passed (${sourceFiles.length} engine/UI files). No executable network primitives or payload-history storage found in guarded source paths.`);
  console.log('This is a static tripwire, not proof of runtime network behavior. Run the Playwright browser audit against a local or deployed server to inspect requests and browser storage.');
}
