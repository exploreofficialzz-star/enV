import { readFileSync, existsSync } from 'node:fs';
import assert from 'node:assert/strict';

const requiredFiles = [
  'src/routes/blog.tsx',
  'src/routes/blog.index.tsx',
  'src/routes/blog.$slug.tsx',
  'src/routes/help.tsx',
  'src/routes/tokens.tsx',
  'src/routes/tokens.guide.tsx',
  'src/routes/tokens.$toolId.tsx',
  'src/data/blog-articles.ts',
  'server/routes/api/billing/tool.get.ts',
  'migrations/0003_offline_wallet.sql',
  'docs/billing-offline-wallet-security.md',
  'docs/support-center-content-and-editorial.md',
];
for (const file of requiredFiles) assert.ok(existsSync(file), `Missing support-center artifact: ${file}`);

const read = (path) => readFileSync(path, 'utf8');
const header = read('src/components/layout/header.tsx');
const footer = read('src/components/layout/footer.tsx');
const articles = read('src/data/blog-articles.ts');
const blogIndex = read('src/routes/blog.index.tsx');
const blogDetail = read('src/routes/blog.$slug.tsx');
const help = read('src/routes/help.tsx');
const tokens = read('src/routes/tokens.guide.tsx');
const detail = read('src/routes/tokens.$toolId.tsx');
const migration = read('migrations/0003_offline_wallet.sql');
const security = read('docs/billing-offline-wallet-security.md');

for (const path of ['/blog', '/help', '/tokens', '/tokens/guide']) assert.ok(header.includes(path), `overflow header menu is missing ${path}`);
for (const path of ['/blog', '/help', '/tokens']) assert.ok(!footer.includes(path), `compact footer must not duplicate navigation to ${path}`);
for (const phrase of ['a-more-private-way-to-use-online-tools', 'how-env-tokens-are-designed-to-work', 'offline-tools-and-wallet-safety', 'designing-tools-that-feel-simple']) {
  assert.ok(articles.includes(phrase), `Missing required starter article: ${phrase}`);
}
assert.ok(blogIndex.includes('grid grid-cols-2 gap-2 md:grid-cols-[minmax(0,1fr)_12rem] md:gap-3'), 'Category and status filters must share a row on mobile and desktop.');
const filterStart = blogIndex.indexOf('aria-label="Filter by category"');
const filterEnd = blogIndex.indexOf('Tool reference library', filterStart);
assert.ok(filterStart >= 0 && filterEnd > filterStart, 'Category and status filter markup must be present.');
const filterMarkup = blogIndex.slice(filterStart, filterEnd);
assert.ok(filterMarkup.includes('aria-label="Filter by status"'), 'The status filter must appear beside the category filter.');
assert.ok(!filterMarkup.includes('ChevronDown'), 'Filter selects must not render duplicate custom dropdown arrows.');
assert.ok(blogIndex.includes('href={"/blog/" + article.slug}'), 'Article links must use a direct article URL.');
assert.ok(blogDetail.includes('createFileRoute("/blog/$slug")') && blogDetail.includes('getBlogArticle(params.slug)'), 'The article and guide detail route must resolve its slug.');
for (const [label, source] of [['blog index', blogIndex], ['blog detail', blogDetail], ['article data', articles]]) {
  assert.ok(!source.includes('readingMinutes'), `${label} must not define or render reading-time metadata.`);
  assert.ok(!/\b\d+\s*min(?:ute)?s?\s+read\b/i.test(source), `${label} must not show estimated reading-time labels.`);
}
for (const phrase of ['clear storage before syncing', 'automatic token deductions', 'How does enV prevent fraud?']) {
  assert.ok(help.toLowerCase().includes(phrase.toLowerCase()), `Help center must explain: ${phrase}`);
}
for (const phrase of ['tool-by-tool', 'getSearchableTools', 'usage factors']) assert.ok(tokens.toLowerCase().includes(phrase.toLowerCase()), `Token guide is missing ${phrase}`);
assert.ok(detail.includes('/api/billing/tool?toolId='), 'Tool detail must load a server-owned billing profile');
for (const phrase of ['billing_offline_allowances', 'billing_offline_transactions', 'billing_security_events', 'unique (allowance_id, transaction_id)', 'unique (allowance_id, sequence_number)']) {
  assert.ok(migration.includes(phrase), `Offline migration missing safety invariant: ${phrase}`);
}
for (const phrase of ['Lost offline records do not prove zero usage', 'Shared server', 'Production launch gates']) {
  assert.ok(security.includes(phrase), `Offline security document missing: ${phrase}`);
}
console.log(`Support-center audit passed: ${requiredFiles.length} artifacts and navigation/content invariants checked.`);
