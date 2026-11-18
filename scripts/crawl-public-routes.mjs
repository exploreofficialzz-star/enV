import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const args = process.argv.slice(2);
const option = (name, fallback) => args.find((arg) => arg.startsWith(`--${name}=`))?.slice(name.length + 3) ?? fallback;
const baseUrl = option("base", "https://envtools.store").replace(/\/$/, "");
const outputPath = path.resolve(root, option("output", "audit/public-route-crawl.json"));
const maxPages = Math.max(1, Number(option("max-pages", 1000)) || 1000);
const concurrency = Math.max(1, Math.min(12, Number(option("concurrency", 4)) || 4));
const timeoutMs = Math.max(1000, Number(option("timeout-ms", 15000)) || 15000);

export function absoluteUrl(value, origin) {
  try {
    const url = new URL(value, origin);
    return url.origin === new URL(origin).origin ? url.toString() : null;
  } catch { return null; }
}
export function parseSitemapUrls(xml, origin) {
  return [...xml.matchAll(/<loc>\s*([^<]+?)\s*<\/loc>/gi)].map((match) => absoluteUrl(match[1], origin)).filter(Boolean);
}
export function extractLinks(html, origin) {
  return [...html.matchAll(/<a\b[^>]*href\s*=\s*["']([^"']+)["'][^>]*>/gi)].map((match) => absoluteUrl(match[1], origin)).filter(Boolean);
}
function firstMatch(html, expression) { return html.match(expression)?.[1]?.trim() ?? null; }
export function inspectHtml(html, url) {
  const canonical = firstMatch(html, /<link\b[^>]*rel=["'][^"']*canonical[^"']*["'][^>]*href=["']([^"']+)["']/i);
  const robots = firstMatch(html, /<meta\b[^>]*name=["']robots["'][^>]*content=["']([^"']+)["']/i);
  const title = firstMatch(html, /<title[^>]*>([\s\S]*?)<\/title>/i);
  const description = firstMatch(html, /<meta\b[^>]*name=["']description["'][^>]*content=["']([^"']+)["']/i);
  const text = html.replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  return { requestedUrl: url, canonical, robots, title, description, meaningfulText: text.length > 80, textLength: text.length };
}
async function fetchWithTimeout(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const started = Date.now();
  try {
    const response = await fetch(url, { redirect: "manual", signal: controller.signal, headers: { "user-agent": "enV-public-route-crawler/1.0" } });
    const body = await response.text();
    return { url, finalUrl: response.headers.get("location") ? absoluteUrl(response.headers.get("location"), url) ?? url : url, status: response.status, contentType: response.headers.get("content-type"), responseMs: Date.now() - started, body };
  } catch (error) {
    return { url, finalUrl: null, status: null, contentType: null, responseMs: Date.now() - started, body: "", error: error instanceof Error ? error.message : String(error) };
  } finally { clearTimeout(timer); }
}
async function run() {
  const sitemapUrl = `${baseUrl}/sitemap.xml`;
  const sitemap = await fetchWithTimeout(sitemapUrl);
  const seeds = new Set([baseUrl + "/", ...parseSitemapUrls(sitemap.body, baseUrl)]);
  const queue = [...seeds].slice(0, maxPages);
  const records = [];
  let cursor = 0;
  async function worker() {
    while (cursor < queue.length && records.length < maxPages) {
      const url = queue[cursor++];
      const result = await fetchWithTimeout(url);
      const record = { ...inspectHtml(result.body, url), finalUrl: result.finalUrl, status: result.status, contentType: result.contentType, responseMs: result.responseMs, error: result.error ?? null, internalLinks: [], discoveredFrom: seeds.has(url) ? "sitemap-or-root" : "internal-link" };
      if (result.status && result.status >= 200 && result.status < 400 && result.body) {
        record.internalLinks = extractLinks(result.body, baseUrl).slice(0, 200);
        for (const link of record.internalLinks) if (!queue.includes(link) && queue.length < maxPages) queue.push(link);
      }
      records.push(record);
    }
  }
  await Promise.all(Array.from({ length: concurrency }, worker));
  records.sort((a, b) => a.requestedUrl.localeCompare(b.requestedUrl));
  const report = { schemaVersion: 1, crawler: "scripts/crawl-public-routes.mjs", baseUrl, sitemapUrl, crawlStartedAt: new Date().toISOString(), maxPages, concurrency, complete: cursor >= queue.length && records.length >= Math.min(queue.length, maxPages), discoveredUrlCount: queue.length, crawledUrlCount: records.length, excludedOrUncrawledCount: Math.max(0, queue.length - records.length), records };
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`);
  console.log(`Crawled ${records.length}/${queue.length} public URLs; complete=${report.complete}`);
}

if (import.meta.url === `file://${process.argv[1]}`) await run();
