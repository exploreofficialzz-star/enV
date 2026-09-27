import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

export const DEFAULT_APP_NAME = "enV — Browser Toolkit";
export const OG_SITE_REL_PATH = "src/lib/og/site.json";

const SHARE_META_KEYS = new Set([
  "og:title",
  "og:description",
  "og:image",
  "og:image:width",
  "og:image:height",
  "og:type",
  "og:url",
  "og:site_name",
  "twitter:card",
  "twitter:title",
  "twitter:image",
  "twitter:description",
  "x:game:image",
  "x:game:image:width",
  "x:game:image:height",
]);

export function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function unescapeHtml(value) {
  return String(value)
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", '"')
    .replaceAll("&#39;", "'")
    .replaceAll("&amp;", "&");
}

function normalizeHostname(value) {
  const host = String(value ?? "").split(",")[0].trim().toLowerCase();
  if (!host || /[\s/@?#]/.test(host)) return "";
  const hostname = host.replace(/:\d+$/, "");
  if (!hostname.includes(".") || hostname.startsWith(".") || hostname.endsWith(".")) return "";
  if (/^\d{1,3}(?:\.\d{1,3}){3}$/.test(hostname)) return "";
  if (!hostname.split(".").every((label) => /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(label))) return "";
  return hostname;
}

/** Return a validated public hostname, including the standard Vercel hostname. */
export function publicAppHost(hostHeader) {
  return normalizeHostname(hostHeader);
}

/** Prefer an explicitly configured canonical host, otherwise use the request host. */
export function resolvePublicHost(hostHeader) {
  return publicAppHost(process.env?.VITE_PUBLIC_HOSTNAME) || publicAppHost(hostHeader);
}

export function isInstallQuery(url) {
  const query = String(url ?? "").split("?", 2)[1] ?? "";
  const params = new URLSearchParams(query);
  return ["1", "true"].includes(params.get("install") ?? "") &&
    (params.get("platform") ?? "").toLowerCase() === "ios";
}

export function isDocumentPath(pathname) {
  const path = String(pathname ?? "");
  return (
    !path.startsWith("/pwa/") &&
    !path.startsWith("/api/") &&
    !path.startsWith("/@") &&
    !path.startsWith("/node_modules") &&
    !/\.[a-z0-9]+$/i.test(path)
  );
}

export function acceptsHtml(accept) {
  const value = String(accept ?? "");
  return value === "" || value.includes("text/html") || value.includes("*/*");
}

export function stripInstallParams(url) {
  const [path = "/", query = ""] = String(url ?? "/").split("?", 2);
  const params = new URLSearchParams(query);
  params.delete("install");
  params.delete("platform");
  const rest = params.toString();
  return rest ? `${path}?${rest}` : path;
}

export function renderInstallPageHtml(template, { url = "/", appName = DEFAULT_APP_NAME } = {}) {
  return String(template)
    .replaceAll("{{APP_NAME}}", escapeHtml(appName))
    .replaceAll("{{APP_URL}}", escapeHtml(stripInstallParams(url)));
}

export function readOgSite(cwd = process.cwd()) {
  try {
    const raw = readFileSync(join(cwd, OG_SITE_REL_PATH), "utf8");
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function siteTitle(site = {}) {
  return String(site.title ?? "").trim() || DEFAULT_APP_NAME;
}

export function renderWebManifest(_hostHeader = "", site = readOgSite()) {
  const name = siteTitle(site);
  const shortName = String(site.shortName ?? "enV").trim() || "enV";
  const themeColor = /^#[0-9a-fA-F]{6}$/.test(String(site.color ?? ""))
    ? site.color
    : "#0d9f8a";
  return JSON.stringify(
    {
      name,
      short_name: shortName,
      id: "/",
      start_url: "/",
      scope: "/",
      display: "standalone",
      background_color: "#ffffff",
      theme_color: themeColor,
      icons: [
        { src: "/pwa/icon-180.png", sizes: "180x180", type: "image/png" },
        { src: "/pwa/icon-512.png", sizes: "512x512", type: "image/png" },
      ],
    },
    null,
    2,
  );
}

export function pwaHeadTags(appName = DEFAULT_APP_NAME) {
  return [
    ["manifest", '<link rel="manifest" href="/pwa/manifest.webmanifest">'],
    ["apple-touch-icon", '<link rel="apple-touch-icon" href="/pwa/icon-180.png">'],
    ["apple-mobile-web-app-title", `<meta name="apple-mobile-web-app-title" content="${escapeHtml(appName)}">`],
    ["apple-mobile-web-app-status-bar-style", '<meta name="apple-mobile-web-app-status-bar-style" content="default">'],
    ["theme-color", '<meta name="theme-color" content="#0d9f8a">'],
  ];
}

export function readXCreator() {
  return String(typeof process !== "undefined" ? process.env?.X_CREATOR ?? "" : "").trim();
}

export function readXCreatorId() {
  return String(typeof process !== "undefined" ? process.env?.X_CREATOR_ID ?? "" : "").trim();
}

export function xCreatorHeadTags(creator = readXCreator(), creatorId = readXCreatorId()) {
  const name = String(creator ?? "").trim();
  const id = String(creatorId ?? "").trim();
  if (!name || !id) return [];
  return [
    `<meta property="x:creator" content="${escapeHtml(name)}">`,
    `<meta property="x:creator:id" content="${escapeHtml(id)}">`,
  ];
}

export function ogCardPublicPath(cwd = process.cwd()) {
  if (existsSync(join(cwd, "public/og.jpg"))) return "/og.jpg";
  if (existsSync(join(cwd, "public/og.png"))) return "/og.png";
  return "";
}

export function siteHasCustomCard(site = {}) {
  return String(site.card ?? "").toLowerCase() === "custom";
}

export function snapshotOgIdentity(cwd = process.cwd()) {
  const site = { ...readOgSite(cwd) };
  const cardPath = ogCardPublicPath(cwd);
  if (cardPath) {
    site.card = "custom";
    site.image = cardPath;
  } else {
    if (siteHasCustomCard(site)) delete site.card;
    if (site.image) delete site.image;
  }
  if (existsSync(join(cwd, "public/x-banner.jpg"))) site.banner ||= "/x-banner.jpg";
  return { site };
}

export function titleFromDocument(html) {
  const match = String(html ?? "").match(/<title\b[^>]*>([^<]*)<\/title>/i);
  return match ? unescapeHtml(match[1]).trim() : "";
}

export function resolveOgTitle(site = {}, appName = DEFAULT_APP_NAME, _host = "", documentTitle = "") {
  return (
    String(site.title ?? "").trim() ||
    String(documentTitle ?? "").trim() ||
    String(appName ?? "").trim() ||
    DEFAULT_APP_NAME
  );
}

export function resolveOgCardAsset(site = {}, cwd = process.cwd()) {
  const onDisk = ogCardPublicPath(cwd);
  if (onDisk) return onDisk;
  return siteHasCustomCard(site) ? String(site.image ?? "").trim() : "";
}

export function ogServiceUrl() {
  return String(process.env?.VITE_OG_SERVICE_URL ?? "").trim().replace(/\/+$/, "");
}

export function ogHeadTags({ host = "", appName = DEFAULT_APP_NAME, site = {}, documentTitle = "", cwd = process.cwd() } = {}) {
  const title = resolveOgTitle(site, appName, host, documentTitle);
  const publicHost = resolvePublicHost(host);
  const tags = [
    '<meta name="twitter:card" content="summary_large_image">',
    `<meta property="og:title" content="${escapeHtml(title)}">`,
  ];
  const description = String(site.description ?? "").trim();
  if (description) tags.push(`<meta property="og:description" content="${escapeHtml(description)}">`);
  if (String(site.type ?? "").toLowerCase() === "x:game") tags.push('<meta property="og:type" content="x:game">');

  if (publicHost) {
    const asset = resolveOgCardAsset(site, cwd);
    const service = ogServiceUrl();
    const image = asset
      ? `https://${publicHost}${asset.startsWith("/") ? asset : `/${asset}`}`
      : service
        ? `${service}/v1/card.png?host=${encodeURIComponent(publicHost)}&title=${encodeURIComponent(title)}`
        : "";
    if (image) {
      tags.push(`<meta property="og:image" content="${escapeHtml(image)}">`);
      tags.push('<meta property="og:image:width" content="1200">');
      tags.push('<meta property="og:image:height" content="630">');
    }
    const banner = String(site.banner ?? "").trim();
    if (banner) {
      const bannerUrl = `https://${publicHost}${banner.startsWith("/") ? banner : `/${banner}`}`;
      tags.push(`<meta property="x:game:image" content="${escapeHtml(bannerUrl)}">`);
      tags.push('<meta property="x:game:image:width" content="1200">');
      tags.push('<meta property="x:game:image:height" content="264">');
    }
  }
  return tags;
}

export function stripShareMetaTags(html) {
  return String(html).replace(/<meta\b[^>]*>/gi, (tag) => {
    const attrs = [...tag.matchAll(/\b(?:property|name)\s*=\s*["']([^"']+)["']/gi)];
    return attrs.some((match) => SHARE_META_KEYS.has(String(match[1]).toLowerCase())) ? "" : tag;
  });
}

function insertAfterHeadOpen(html, snippet) {
  if (/<head\b[^>]*>/i.test(html)) return html.replace(/<head\b[^>]*>/i, (open) => `${open}${snippet}`);
  if (/<html\b[^>]*>/i.test(html)) return html.replace(/<html\b[^>]*>/i, (open) => `${open}<head>${snippet}</head>`);
  return `<!doctype html><html><head>${snippet}</head>${html}`;
}

function insertBeforeHeadClose(html, snippet) {
  if (/<\/head>/i.test(html)) return html.replace(/<\/head>/i, `${snippet}</head>`);
  return insertAfterHeadOpen(html, snippet);
}

export function normalizeHeadContext(ctx = {}) {
  const cwd = ctx.cwd ?? process.cwd();
  const site = ctx.site !== undefined ? ctx.site : snapshotOgIdentity(cwd).site;
  return {
    appName: resolveOgTitle(site, ctx.appName ?? DEFAULT_APP_NAME, ctx.host ?? ""),
    creator: ctx.creator ?? readXCreator(),
    creatorId: ctx.creatorId ?? readXCreatorId(),
    host: ctx.host ?? "",
    cwd,
    site,
  };
}

export function injectPwaHead(html, ctx = {}) {
  if (typeof html !== "string") return html;
  const normalized = normalizeHeadContext(ctx);
  const documentTitle = titleFromDocument(html);
  const appName = resolveOgTitle(normalized.site, normalized.appName, normalized.host, documentTitle);
  let next = stripShareMetaTags(html);
  const missing = pwaHeadTags(appName)
    .filter(([key]) => {
      if (key === "manifest") return !next.includes('href="/pwa/manifest.webmanifest"');
      if (key === "apple-touch-icon") return !next.includes('href="/pwa/icon-180.png"');
      return !next.includes(`name="${key}"`);
    })
    .map(([, tag]) => tag);

  next = insertAfterHeadOpen(
    next,
    ogHeadTags({ ...normalized, appName, documentTitle }).join(""),
  );
  const creatorTags = xCreatorHeadTags(normalized.creator, normalized.creatorId);
  if (creatorTags.length) {
    if (!next.includes('property="x:creator"')) missing.push(creatorTags[0]);
    if (!next.includes('property="x:creator:id"')) missing.push(creatorTags[1]);
  }
  return missing.length ? insertBeforeHeadClose(next, missing.join("")) : next;
}

function findHeadClose(buffer) {
  return buffer.toString("latin1").search(/<\/head>/i);
}

export function createHeadInjector(ctx = {}) {
  const normalized = normalizeHeadContext(ctx);
  let pending = [];
  let done = false;
  const apply = (html) => injectPwaHead(html, normalized);
  return {
    push(chunk) {
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      if (done) return [buffer];
      pending.push(buffer);
      const joined = Buffer.concat(pending);
      const at = findHeadClose(joined);
      if (at === -1) return [];
      done = true;
      pending = [];
      const closeLength = joined.toString("latin1", at).match(/^<\/head>/i)[0].length;
      const head = apply(joined.subarray(0, at + closeLength).toString("utf8"));
      return [Buffer.concat([Buffer.from(head, "utf8"), joined.subarray(at + closeLength)])];
    },
    flush() {
      if (done || pending.length === 0) return [];
      const rest = Buffer.concat(pending);
      pending = [];
      done = true;
      return [Buffer.from(apply(rest.toString("utf8")), "utf8")];
    },
  };
}
