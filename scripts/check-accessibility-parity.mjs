import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = process.cwd();

const webAccessibilitySource = readFileSync(resolve(root, 'src/lib/accessibility-studios.ts'), 'utf8');
const androidAccessibilitySource = readFileSync(resolve(root, 'apps/android/app/src/main/java/com/chastech/env/data/AccessibilityStudios.kt'), 'utf8');
const iosCatalogSource = readFileSync(resolve(root, 'apps/ios/enV/CatalogCore.swift'), 'utf8');
const accessibilityStudioIds = [
  'contrast-checker', 'alt-text-checker', 'focus-state-checker', 'text-readability-checker',
  'aria-checker', 'motion-checker', 'keyboard-navigation-checker', 'form-checker',
];
const quotedStrings = (value) => [...value.matchAll(/"([^"]+)"/g)].map((match) => match[1]);
const webStudioLines = webAccessibilitySource.split(/\r?\n/);
const androidStudioLines = androidAccessibilitySource.split(/\r?\n/);
const iosStudioLines = iosCatalogSource.split(/\r?\n/);
const keywordParityFailures = [];
for (const id of accessibilityStudioIds) {
  const webLine = webStudioLines.find((line) => line.includes('id: "' + id + '"'));
  const androidLine = androidStudioLines.find((line) => line.includes('AccessibilityStudioSpec("' + id + '"'));
  const iosLine = iosStudioLines.find((line) => line.includes('.init(id: "' + id + '"'));
  const webKeywordsMatch = webLine?.match(/keywords:\s*\[([^\]]*)\]/);
  const androidKeywordLists = androidLine ? [...androidLine.matchAll(/listOf\(([^)]*)\)/g)] : [];
  const iosKeywordsMatch = iosLine?.match(/keywords:\s*\[([^\]]*)\]/);
  if (!webKeywordsMatch || !androidKeywordLists.length || !iosKeywordsMatch) {
    keywordParityFailures.push(id + ': a canonical Web, Android, or iOS keyword definition is missing');
    continue;
  }
  const expected = quotedStrings(webKeywordsMatch[1]);
  const androidKeywords = new Set(quotedStrings(androidKeywordLists[androidKeywordLists.length - 1][1]));
  const iosKeywords = new Set(quotedStrings(iosKeywordsMatch[1]));
  for (const keyword of expected) {
    if (!androidKeywords.has(keyword)) keywordParityFailures.push(id + ': Android is missing discovery keyword "' + keyword + '"');
    if (!iosKeywords.has(keyword)) keywordParityFailures.push(id + ': iOS is missing discovery keyword "' + keyword + '"');
  }
}
if (keywordParityFailures.length) {
  console.error('Accessibility Studio discovery keyword parity FAIL (' + keywordParityFailures.length + ')');
  for (const failure of keywordParityFailures) console.error('- ' + failure);
  process.exitCode = 1;
} else {
  console.log('Accessibility Studio discovery keyword parity PASS: all ' + accessibilityStudioIds.length + ' native Studios include every canonical Web discovery keyword.');
}
const engines = {
  typescript: [
    'src/lib/engines/accessibility-audit.ts',
    'src/lib/engines/accessibility-motion-audit.ts',
  ],
  kotlin: ['apps/android/app/src/main/java/com/chastech/env/NativeAccessibilityEngine.kt'],
  swift: ['apps/ios/enV/NativeAccessibilityEngine.swift'],
};
const sources = Object.fromEntries(Object.entries(engines).map(([platform, files]) => [
  platform,
  files.map((file) => ({ file, text: readFileSync(resolve(root, file), 'utf8') })),
]));

const required = {
  aria: [
    'aria-valid-role', 'aria-label', 'aria-prohibited-attr', 'aria-labelledby',
    'aria-reference', 'aria-hidden-focus', 'aria-value-expanded', 'aria-value-live',
    'button-name', 'link-name', 'custom-control-name', 'duplicate-id',
  ],
  formsAndKeyboard: [
    'image-alt', 'filename-alt', 'label', 'label-reference', 'error-description',
    'error-description-reference', 'keyboard-operable', 'custom-control-focus',
    'custom-button-keyboard-activation', 'custom-control-keyboard-activation', 'target-size-risk', 'document-language', 'document-title', 'heading-order',
  ],
  motion: [
    'reduced-motion', 'reduced-motion-incomplete', 'smooth-scroll-not-reduced',
    'transition-all', 'loop-without-pause', 'rapid-contrast-flash',
    'auto-moving-content', 'script-driven-motion',
    'script-motion-not-preference-aware', 'competing-transform-animations', 'flashing-motion',
  ],
};

const failures = [];
for (const [platform, files] of Object.entries(sources)) {
  const merged = files.map(({ text }) => text).join('\n');
  for (const [group, rules] of Object.entries(required)) {
    for (const rule of rules) {
      if (!merged.includes(rule)) failures.push(`${platform}: missing ${group} rule key "${rule}"`);
    }
  }
  for (const phrase of ['Finding ID:', 'Source line:', 'Evidence:', 'Related WCAG criteria', 'manual-review']) {
    if (!merged.includes(phrase)) failures.push(`${platform}: missing cross-platform report field "${phrase}"`);
  }
}

// Keep the accessibility checks native/local rather than coupling Android or iOS to the web UI.
for (const [platform, files] of Object.entries({ kotlin: engines.kotlin, swift: engines.swift })) {
  const merged = files.map((file) => readFileSync(resolve(root, file), 'utf8')).join('\n');
  if (/android\.webkit\.WebView|\bWKWebView\b|src\/lib\/engines\//.test(merged)) {
    failures.push(`${platform}: native accessibility engine unexpectedly references a web engine/WebView`);
  }
}

if (failures.length) {
  console.error(`Accessibility cross-platform rule parity FAIL (${failures.length})`);
  for (const failure of failures) console.error(`- ${failure}`);
  process.exitCode = 1;
} else {
  const count = Object.values(required).reduce((total, rules) => total + rules.length, 0);
  console.log(`Accessibility cross-platform rule parity PASS: ${count} required rule keys + report contract present in TypeScript, Kotlin, and Swift; native engines remain separate.`);
}
