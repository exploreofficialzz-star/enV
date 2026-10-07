import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import {
  acceptsHtml,
  createHeadInjector,
  injectPwaHead,
  isDocumentPath,
  isInstallQuery,
  ogHeadTags,
  publicAppHost,
  renderInstallPageHtml,
  renderWebManifest,
  snapshotOgIdentity,
  stripInstallParams,
} from "./pwa-shared.mjs";
import { pwaPlugin, renderInstallPage, SITE_IDENTITY_ID } from "./pwa-plugin.mjs";

const PROJECT_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
function workspace({ card = true } = {}) {
  const root = mkdtempSync(join(tmpdir(), "env-pwa-"));
  mkdirSync(join(root, "src/lib/og"), { recursive: true });
  mkdirSync(join(root, "public"), { recursive: true });
  writeFileSync(join(root, "src/lib/og/site.json"), JSON.stringify({ title: "enV — Browser Toolkit", shortName: "enV", card: "custom", color: "#0d9f8a" }));
  if (card) writeFileSync(join(root, "public/og.jpg"), "image");
  return root;
}

test("host validation accepts Vercel/custom domains and rejects untrusted host syntax", () => {
  assert.equal(publicAppHost("env-toolkit.vercel.app:443"), "env-toolkit.vercel.app");
  assert.equal(publicAppHost("tools.example.com"), "tools.example.com");
  for (const invalid of ["localhost:8080", "127.0.0.1", "https://example.com", "evil.example.com/path", "bad host.com"]) {
    assert.equal(publicAppHost(invalid), "", invalid);
  }
});

test("install query is limited to iOS document requests and clean links", () => {
  assert.equal(isInstallQuery("/?install=1&platform=ios"), true);
  assert.equal(isInstallQuery("/?install=true&platform=IOS"), true);
  assert.equal(isInstallQuery("/?install=1&platform=android"), false);
  assert.equal(isDocumentPath("/tools/color-picker"), true);
  assert.equal(isDocumentPath("/pwa/manifest.webmanifest"), false);
  assert.equal(isDocumentPath("/api/auth/session"), false);
  assert.equal(acceptsHtml("text/html,application/xhtml+xml"), true);
  assert.equal(acceptsHtml("application/json"), false);
  assert.equal(stripInstallParams("/tools?a=1&install=1&platform=ios"), "/tools?a=1");
});

test("manifest identifies enV and serves the canonical app icon", () => {
  const manifest = JSON.parse(renderWebManifest("env-toolkit.vercel.app", { title: "enV — Browser Toolkit", shortName: "enV", color: "#0d9f8a" }));
  assert.equal(manifest.name, "enV — Browser Toolkit");
  assert.equal(manifest.short_name, "enV");
  assert.equal(manifest.icons[0].src, "/pwa/icon-180.png");
  assert.equal(manifest.icons[1].src, "/pwa/icon-512.png");
  assert.ok(manifest.icons.every((icon) => icon.type === "image/png"));
  assert.equal(manifest.background_color, "#ffffff");
  assert.equal(manifest.theme_color, "#ffffff");
  assert.equal(manifest.display, "standalone");
});

test("browser chrome metadata follows the active light or dark theme", () => {
  const root = readFileSync(join(PROJECT_ROOT, "src/routes/__root.tsx"), "utf8");
  const theme = readFileSync(join(PROJECT_ROOT, "src/hooks/use-theme.ts"), "utf8");
  assert.match(root, /name: "theme-color", content: "#ffffff"/);
  assert.match(theme, /dark \? "#000000" : "#ffffff"/);
  assert.match(theme, /dark \? "black-translucent" : "default"/);
});

test("All Tools groups results by category and progressively expands without global filters or counts", () => {
  const tools = readFileSync(join(PROJECT_ROOT, "src/routes/tools/index.tsx"), "utf8");
  assert.match(tools, /flex items-center gap-4/);
  assert.match(tools, /w-\[52vw\] shrink-0 max-w-\[18rem\]/);
  assert.match(tools, /<SearchBox value=\{query\} onValueChange=/);
  assert.match(tools, /validateSearch: \(search: Record<string, unknown>\).*q:/s);
  assert.match(tools, /const \{ q \} = Route\.useSearch\(\)/);
  assert.match(tools, /CATEGORIES\.map/);
  assert.match(tools, /INITIAL_TOOLS_PER_CATEGORY = 3/);
  assert.match(tools, /MORE_TOOLS_PER_CLICK = 6/);
  assert.match(tools, /See more tools/);
  assert.match(tools, /ChevronDown/);
  assert.match(tools, /text-lg font-bold text-accent/);
  assert.match(tools, /flex justify-end/);
  assert.match(tools, /text-accent/);
  assert.doesNotMatch(tools, /Tool availability filter|Coming Soon \(|PAGE_SIZE|Showing \d+–|Page \{safePage\}/);
});

test("tool and category cards use theme-aware icon strokes and directional click affordances", () => {
  const toolCard = readFileSync(join(PROJECT_ROOT, "src/components/tools/tool-card.tsx"), "utf8");
  const categoryCard = readFileSync(join(PROJECT_ROOT, "src/components/tools/category-card.tsx"), "utf8");
  assert.match(toolCard, /toolIcon\(tool\.icon\)/);
  assert.match(toolCard, /ArrowRight/);
  assert.match(toolCard, /text-black dark:text-white/);
  assert.ok(toolCard.indexOf('className="mt-auto flex justify-end pt-3"') > toolCard.indexOf("tool.description"), "Tool arrow should sit at the bottom-right after the description");
  assert.match(categoryCard, /toolIcon\(category\.icon\)/);
  assert.match(categoryCard, /ArrowRight/);
  assert.match(categoryCard, /text-black dark:text-white/);
});

test("Home search shows live matches and opens full results only on explicit action", () => {
  const home = readFileSync(join(PROJECT_ROOT, "src/routes/index.tsx"), "utf8");
  const searchBox = readFileSync(join(PROJECT_ROOT, "src/components/tools/search-box.tsx"), "utf8");
  const brand = readFileSync(join(PROJECT_ROOT, "src/components/brand/logo.tsx"), "utf8");
  assert.match(home, /<SearchBox[\s\S]*?onValueChange=\{setQuery\}[\s\S]*?onEnter=\{openSearchResults\}/);
  assert.match(home, /hidePlaceholderOnFocus/);
  assert.match(home, /to: "\/search", search: \{ q: searchQuery\.trim\(\) \}/);
  assert.doesNotMatch(home, /navigate\(\{ to: "\/tools"/);
  assert.match(home, /<ToolCard key=\{tool\.id\} tool=\{tool\}/);
  assert.match(home, /hidden md:flex/);
  assert.match(home, /leading=\{<Logo size="search"/);
  assert.match(brand, /search: "h-9 w-14"/);
  assert.match(searchBox, /onChange=\{\(e\) => \{\s*setQ\(e\.target\.value\);\s*setOpen\(true\);/);
  assert.match(searchBox, /searchTools\(getAllTools\(\), q, 8\)/);
  assert.match(searchBox, /placeholder=\{hidePlaceholderOnFocus && focused \? "" : placeholder\}/);
  assert.match(searchBox, /setFocused\(true\);\s*setOpen\(true\);/);
  assert.match(searchBox, /See more results/);
  assert.match(searchBox, /nav\(\{ to: "\/search", search: \{ q \} \}\)/);
});

test("AI assistant uses the secured backend task and is reachable from Home and the header", () => {
  const home = readFileSync(join(PROJECT_ROOT, "src/routes/index.tsx"), "utf8");
  const header = readFileSync(join(PROJECT_ROOT, "src/components/layout/header.tsx"), "utf8");
  const assistant = readFileSync(join(PROJECT_ROOT, "src/routes/assistant.tsx"), "utf8");
  const task = readFileSync(join(PROJECT_ROOT, "src/lib/ai/server/tasks/assistant.ts"), "utf8");
  const registry = readFileSync(join(PROJECT_ROOT, "src/lib/ai/server/tasks/index.ts"), "utf8");
  assert.match(home, /<Link to="\/assistant"[^>]*>AI assistant<\/Link>/);
  assert.match(header, /to="\/assistant">AI assistant<\/Link>/);
  assert.match(assistant, /runAiTask\("assistant\.chat", request/);
  assert.match(assistant, /searchTools\(getActiveTools\(\), query, 8\)/);
  assert.match(assistant, /recommendedToolIds/);
  assert.match(assistant, /<ToolCard key=\{tool\.id\} tool=\{tool\}/);
  assert.match(assistant, /Ask about enV tools or the enV brand/);
  assert.doesNotMatch(assistant, /fetchAiAvailability|configured AI provider|I understand my message|AI responses can be inaccurate|planning, writing, and everyday work/);
  assert.match(task, /id: "assistant\.chat"/);
  assert.match(task, /privacy: "sensitive"/);
  assert.match(task, /BRAND_FACTS/);
  assert.match(task, /recommendedToolIds/);
  assert.match(task, /allowed\.has\(id\)/);
  assert.match(task, /redactSecrets/);
  assert.match(task, /wrapUntrusted/);
  assert.match(registry, /assistantChatTask/);
});

test("company pages use the supplied brand, distinct contact emails, and transparent token pricing", () => {
  const about = readFileSync(join(PROJECT_ROOT, "src/routes/about.tsx"), "utf8");
  const contact = readFileSync(join(PROJECT_ROOT, "src/routes/contact.tsx"), "utf8");
  const pricing = readFileSync(join(PROJECT_ROOT, "src/routes/pricing.tsx"), "utf8");
  const footer = readFileSync(join(PROJECT_ROOT, "src/components/layout/footer.tsx"), "utf8");
  assert.match(about, /chas-technologies-logo\.jpg/);
  assert.match(about, /chAs Technologies LLC/);
  assert.match(about, /registered in Delaware, USA/);
  assert.match(contact, /mailto:envtoolkit@gmail\.com/);
  assert.match(contact, /mailto:chastechnologiesllc@gmail\.com/);
  assert.match(pricing, /Planned pricing — purchases are not available yet/);
  for (const price of ["$0.30", "$0.50", "$0.80", "$1.20", "$5.00"]) assert.ok(pricing.includes(price), `Missing supplied token price ${price}`);
  assert.match(pricing, /100 tokens/);
  assert.match(pricing, /50 tokens/);
  assert.match(footer, /chAs Technologies LLC · enV/);
});

test("Web information routes contain complete company, privacy, terms, disclaimer, and responsible-use content", () => {
  const privacy = readFileSync(join(PROJECT_ROOT, "src/routes/privacy.tsx"), "utf8");
  const terms = readFileSync(join(PROJECT_ROOT, "src/routes/terms.tsx"), "utf8");
  const disclaimer = readFileSync(join(PROJECT_ROOT, "src/routes/disclaimer.tsx"), "utf8");
  const responsibleUse = readFileSync(join(PROJECT_ROOT, "src/routes/responsible-use.tsx"), "utf8");
  const pricing = readFileSync(join(PROJECT_ROOT, "src/routes/pricing.tsx"), "utf8");
  for (const section of ["Information stored on your device", "Connected tools and service providers", "Cookies, sessions, and account requests", "Payments and tokens"]) {
    assert.ok(privacy.includes(section), `Privacy page is missing ${section}`);
  }
  assert.match(privacy, /Groq, OpenRouter, and Google Gemini/);
  assert.match(privacy, /aged 13 or older/);
  assert.match(privacy, /chAs Technologies LLC/);
  for (const section of ["Using enV", "Accounts and contact exchange", "Your content and tool results", "Availability and changes", "Tokens and pricing", "Disclaimer and limits"]) {
    assert.ok(terms.includes(section), `Terms page is missing ${section}`);
  }
  assert.match(disclaimer, /Not professional advice/);
  assert.match(disclaimer, /Verify every result/);
  assert.match(responsibleUse, /Do not use enV to/);
  assert.match(responsibleUse, /aged 13 or older/);
  assert.match(responsibleUse, /Reporting a concern/);
  assert.match(terms, /at least 13 years old/);
  assert.match(terms, /listed reference prices are in USD/);
  assert.match(terms, /final amount and currency will be shown before payment/);
  assert.match(pricing, /Prices are listed in USD/);
  assert.match(pricing, /final currency and total will be shown before you confirm payment/);
  assert.match(privacy, /registered in Delaware, USA/);
  assert.match(terms, /Governing Law and Venue/);
  assert.match(terms, /governed by the laws of the State of Delaware, United States/);
  assert.match(terms, /courts located in Delaware/);
});

test("web brand lockups use the canonical light and dark assets in the home hero", () => {
  const logo = readFileSync(join(PROJECT_ROOT, "src/components/brand/logo.tsx"), "utf8");
  const header = readFileSync(join(PROJECT_ROOT, "src/components/layout/header.tsx"), "utf8");
  const shell = readFileSync(join(PROJECT_ROOT, "src/components/layout/app-shell.tsx"), "utf8");
  const home = readFileSync(join(PROJECT_ROOT, "src/routes/index.tsx"), "utf8");
  const footer = readFileSync(join(PROJECT_ROOT, "src/components/layout/footer.tsx"), "utf8");
  const install = readFileSync(join(PROJECT_ROOT, "scripts/install-page.html"), "utf8");
  assert.match(logo, /logo-header-transparent\.png/);
  assert.match(logo, /logo-header-dark\.png/);
  assert.match(logo, /logo-home-transparent\.png/);
  assert.match(logo, /logo-home-dark\.png/);
  assert.match(logo, /hero: "h-\[56px\] w-\[142px\] sm:h-\[64px\] sm:w-\[163px\]"/);
  assert.doesNotMatch(logo, /<svg/);
  assert.match(header, /aria-label="Home"/);
  assert.match(home, /<Logo size="hero"\s*\/>/);
  assert.match(home, /pt-1/);
  assert.match(home, /sm:pt-1/);
  assert.match(home, /className="mt-4 max-w-3xl sm:mt-5"/);
  assert.match(home, /containerClassName="flex h-16 w-full items-center gap-3 rounded-2xl border border-border-strong bg-surface px-4/);
  assert.match(home, /sm:h-\[72px\] sm:gap-4 sm:px-5/);
  assert.match(home, /inputClassName="[^\"]*text-center/);
  assert.doesNotMatch(home, /pl-\[76px\]/);
  assert.match(home, /sm:mt-5/);
  assert.match(home, /getPopularTools\(12\)/);
  assert.match(home, /index >= 6 \? "hidden md:flex"/);
  assert.match(home, /text-xl font-semibold text-accent sm:text-2xl/);
  assert.match(home, /AI assistant/);
  assert.match(home, /Total token = 100/);
  assert.match(home, /mt-4 grid w-\[84%\] max-w-\[40rem\] grid-cols-2 gap-2/);
  assert.match(home, /items-center justify-center rounded-xl/);
  assert.match(home, /text-center text-\[10px\]/);
  assert.match(home, /md:grid-cols-3/);
  assert.doesNotMatch(home, /Explore all tools/);
  assert.match(home, /<br className="sm:hidden"\s*\/>/);
  assert.doesNotMatch(shell, /MobileNav/);
  assert.match(footer, /<Logo\s*\/>/);
  assert.match(install, /src="\/logo-header-transparent\.png"/);
});

test("share metadata is generated from the project card without third-party defaults", () => {
  const root = workspace();
  const tags = ogHeadTags({ host: "env-toolkit.vercel.app", site: { title: "enV", description: "Browser tools", card: "custom" }, cwd: root }).join("\n");
  assert.match(tags, /https:\/\/env-toolkit\.vercel\.app\/og\.jpg/);
  assert.match(tags, /Browser tools/);
  assert.doesNotMatch(tags, /\.app\.me|extensions\.js/);
  const noCard = ogHeadTags({ host: "env-toolkit.vercel.app", site: { title: "enV" }, cwd: workspace({ card: false }) }).join("\n");
  assert.doesNotMatch(noCard, /og:image/);
  assert.deepEqual(snapshotOgIdentity(root).site.card, "custom");
});

test("head injection escapes values, removes stale share tags, and is idempotent", () => {
  const root = workspace();
  const input = '<!doctype html><html><head><title>enV</title><meta property="og:title" content="old"><meta name="description" content="Keep me"></head><body>ok</body></html>';
  const once = injectPwaHead(input, { host: "env-toolkit.vercel.app", cwd: root, site: { title: 'enV "safe"', card: "custom" } });
  assert.match(once, /content="enV &quot;safe&quot;"/);
  assert.match(once, /content="Keep me"/);
  assert.match(once, /name="theme-color" content="#ffffff"/);
  assert.match(once, /name="apple-mobile-web-app-status-bar-style" content="default"/);
  assert.equal((once.match(/property="og:title"/g) ?? []).length, 1);
  const twice = injectPwaHead(once, { host: "env-toolkit.vercel.app", cwd: root, site: { title: 'enV "safe"', card: "custom" } });
  assert.equal((twice.match(/rel="manifest"/g) ?? []).length, 1);
  assert.equal((twice.match(/apple-touch-icon/g) ?? []).length, 1);
});

test("streaming injector handles a head close split across chunks", () => {
  const root = workspace();
  const injector = createHeadInjector({ host: "env-toolkit.vercel.app", cwd: root, site: { title: "enV", card: "custom" } });
  const outputs = [
    ...injector.push(Buffer.from("<html><head><title>enV</title></he")),
    ...injector.push(Buffer.from("ad><body>content")),
    ...injector.flush(),
  ];
  const html = Buffer.concat(outputs).toString();
  assert.match(html, /rel="manifest"/);
  assert.match(html, /\/og\.jpg/);
  assert.match(html, /<body>content/);
});

test("install guide uses escaped product copy and preserves a clean destination URL", () => {
  assert.match(renderInstallPageHtml("<title>{{APP_NAME}}</title><a href=\"{{APP_URL}}\">Open</a>", { appName: "enV & tools", url: "/?install=1&platform=ios" }), /enV &amp; tools/);
  const rendered = renderInstallPage("env-toolkit.vercel.app", "/?install=1&platform=ios", workspace());
  assert.match(rendered, /enV/);
  assert.match(rendered, /\/pwa\/icon-180\.png/);
  assert.doesNotMatch(rendered, /\/\?install=1/);
});

test("Vite plugin exposes stable virtual identity and uses the generic PWA routes", () => {
  const root = workspace();
  const plugin = pwaPlugin();
  plugin.configResolved({ root });
  assert.equal(plugin.name, "env:pwa");
  assert.equal(plugin.resolveId(SITE_IDENTITY_ID), `\0${SITE_IDENTITY_ID}`);
  assert.match(plugin.load(`\0${SITE_IDENTITY_ID}`), /siteIdentity/);
  assert.match(plugin.transformIndexHtml("<html><head></head><body></body></html>"), /\/pwa\/manifest.webmanifest/);
  const middleware = readFileSync(join(PROJECT_ROOT, "server/middleware/pwa.ts"), "utf8");
  assert.match(middleware, /\/pwa\/manifest\.webmanifest/);
  assert.doesNotMatch(middleware, /virtual:.*app-og/);
  rmSync(root, { recursive: true, force: true });
});
