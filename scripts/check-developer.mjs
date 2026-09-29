import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../src/data/catalog.ts', import.meta.url), 'utf8');
const start = source.indexOf('const catalogJson = [');
const end = source.indexOf('].join("")', start);
if (start < 0 || end < 0) throw new Error('Catalog JSON block not found.');
const chunks = [...source.slice(start + 'const catalogJson = ['.length, end).matchAll(/"(?:\\.|[^"\\])*"/g)].map(m => JSON.parse(m[0]));
const tools = JSON.parse(chunks.join(''));
const dev = tools.filter(t => t.category === 'developer');
const active = dev.filter(t => t.status === 'active');
const planned = dev.filter(t => t.status === 'planned');
const ids = new Set(dev.map(t => t.id));
if (ids.size !== dev.length) throw new Error('Duplicate Developer tool IDs detected.');
const supported = new Set([
  'json-formatter','json-validator','json-minifier','json-beautifier','jwt-decoder','jwt-expiration-checker',
  'base64-encoder','base64-decoder','url-encoder','url-decoder','html-encoder','html-decoder','unicode-converter',
  'ascii-converter','binary-converter','hex-converter','uuid-generator','uuid-validator','md5-hash','sha1-hash',
  'sha256-hash','sha512-hash','hash-compare','regex-tester','regex-replace','sql-formatter','html-formatter',
  'css-formatter','javascript-formatter','xml-formatter','yaml-formatter','markdown-preview','markdown-to-html',
  'html-minifier','css-minifier','javascript-minifier','cron-generator','cron-parser','unix-timestamp-converter',
  'http-status-lookup','user-agent-parser','url-parser','query-string-parser','mime-lookup','data-uri-generator',
  'lorem-ipsum-generator','dummy-json-generator'
]);
for (const t of active) if (!supported.has(t.id)) throw new Error(`Active Developer tool lacks an audited implementation: ${t.id}`);
for (const id of supported) if (!active.some(t => t.id === id)) throw new Error(`Audited implementation is not Active: ${id}`);
console.log(`Developer audit: ${dev.length} tools; ${active.length} Active; ${planned.length} Coming Soon.`);
console.log('All Active Developer tools are explicitly allow-listed as implemented.');
