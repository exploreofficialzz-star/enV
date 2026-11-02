#!/usr/bin/env node

const baseUrl = new URL(process.env.SEO_AUDIT_BASE_URL ?? "http://127.0.0.1:8080");
const routes = [
  { path: "/", kind: "indexable", schema: "WebSite" },
  { path: "/tools", kind: "indexable", schema: "CollectionPage" },
  { path: "/tools/developer/json-studio", kind: "indexable", schema: "SoftwareApplication" },
  { path: "/blog/tool-json-studio", kind: "indexable", schema: "TechArticle" },
  { path: "/about", kind: "indexable", schema: "AboutPage" },
  { path: "/help", kind: "indexable", schema: "CollectionPage" },
  { path: "/contact", kind: "indexable", schema: "ContactPage" },
  { path: "/privacy", kind: "indexable", schema: "WebPage" },
  { path: "/token-guide", kind: "indexable", schema: "WebPage" },
  { path: "/search?q=json", kind: "noindex" },
  { path: "/wallet", kind: "noindex" },
  { path: "/updates", kind: "noindex" },
  { path: "/3d-game-studio", kind: "noindex" },
];

function attribute(tag, name) {
  const match = tag.match(new RegExp("\\b" + name + "\\s*=\\s*(?:\"([^\"]*)\"|'([^']*)')", "i"));
  return match?.[1] ?? match?.[2] ?? "";
}

function metaContent(head, key, value) {
  const tags = [...head.matchAll(/<meta\b[^>]*>/gi)].map((match) => match[0]);
  const tag = tags.find((item) => attribute(item, key).toLowerCase() === value.toLowerCase());
  return tag ? attribute(tag, "content") : "";
}

const failures = [];
const report = [];
for (const route of routes) {
  const url = new URL(route.path, baseUrl);
  let response;
  let html = "";
  try {
    response = await fetch(url, { redirect: "follow", signal: AbortSignal.timeout(20_000) });
    html = await response.text();
  } catch (error) {
    failures.push(route.path + ": request failed: " + String(error));
    continue;
  }

  const head = html.match(/<head\b[^>]*>([\s\S]*?)<\/head>/i)?.[1] ?? "";
  const title = head.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)?.[1]?.replace(/<[^>]+>/g, "").trim() ?? "";
  const description = metaContent(head, "name", "description");
  const robots = metaContent(head, "name", "robots").toLowerCase();
  const canonicals = [...head.matchAll(/<link\b[^>]*>/gi)]
    .map((match) => match[0])
    .filter((tag) => attribute(tag, "rel").toLowerCase().split(/\s+/).includes("canonical"));
  const canonical = canonicals[0] ? attribute(canonicals[0], "href") : "";
  const jsonLd = [...head.matchAll(/<script\b[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)]
    .map((match) => match[1]);
  const hasSchema = jsonLd.some((source) =>
    source.includes('"@type":"' + (route.schema ?? "UNKNOWN") + '"')
    || source.includes('"@type": "' + (route.schema ?? "UNKNOWN") + '"')
  );

  if (!response.ok) failures.push(route.path + ": HTTP " + response.status);
  if (!title || title.length < 8) failures.push(route.path + ": missing or unhelpful title");
  if (route.kind === "indexable") {
    if (!description || description.length < 40 || description.length > 170) {
      failures.push(route.path + ": missing or out-of-range meta description (" + description.length + ")");
    }
    if (!robots || robots.includes("noindex")) failures.push(route.path + ": indexable page is marked noindex");
    if (canonicals.length !== 1) failures.push(route.path + ": expected exactly one canonical link, found " + canonicals.length);
    if (canonical && canonical !== new URL(route.path, "https://envtools.store").href) {
      failures.push(route.path + ": incorrect canonical URL: " + canonical);
    }
    if (!hasSchema) failures.push(route.path + ": expected JSON-LD schema type " + route.schema);
  } else if (!robots.includes("noindex")) {
    failures.push(route.path + ": private or interaction-only route must be marked noindex");
  }

  report.push({
    path: route.path,
    status: response.status,
    title,
    descriptionLength: description.length,
    robots,
    canonical,
    schema: hasSchema ? route.schema : null,
  });
}

process.stdout.write(JSON.stringify({ checked: report.length, report, failures }, null, 2) + "\n");
if (failures.length) {
  process.stderr.write("Rendered SEO audit failed with " + failures.length + " issue(s):\n" + failures.map((item) => "- " + item).join("\n") + "\n");
  process.exit(1);
}
process.stdout.write("PASS: rendered SEO metadata, canonicals, structured data and noindex policies.\n");
