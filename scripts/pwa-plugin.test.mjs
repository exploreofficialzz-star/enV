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
  assert.equal(manifest.theme_color, "#0d9f8a");
  assert.equal(manifest.display, "standalone");
});

test("all web brand lockups use the exact header image", () => {
  const logo = readFileSync(join(PROJECT_ROOT, "src/components/brand/logo.tsx"), "utf8");
  const header = readFileSync(join(PROJECT_ROOT, "src/components/layout/header.tsx"), "utf8");
  const footer = readFileSync(join(PROJECT_ROOT, "src/components/layout/footer.tsx"), "utf8");
  const install = readFileSync(join(PROJECT_ROOT, "scripts/install-page.html"), "utf8");
  assert.match(logo, /src="\/logo-header-transparent\.png"/);
  assert.doesNotMatch(logo, /<svg/);
  assert.match(header, /<Logo\s*\/>/);
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
