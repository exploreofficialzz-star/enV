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
  { path: "/this-route-does-not-exist-seo-audit", kind: "noindex" },
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
  const ogTitle = metaContent(head, "property", "og:title");
  const ogDescription = metaContent(head, "property", "og:description");
  const ogUrl = metaContent(head, "property", "og:url");
  const ogImage = metaContent(head, "property", "og:image");
  const twitterCard = metaContent(head, "name", "twitter:card");
  const twitterTitle = metaContent(head, "name", "twitter:title");
  const twitterDescription = metaContent(head, "name", "twitter:description");
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
    if (!ogTitle || ogTitle !== title) failures.push(route.path + ": Open Graph title must match the page title");
    if (!ogDescription || ogDescription !== description) failures.push(route.path + ": Open Graph description must match the page description");
    if (!ogUrl || ogUrl !== canonical) failures.push(route.path + ": Open Graph URL must match the canonical URL");
    if (!ogImage || !ogImage.startsWith("https://envtools.store/")) failures.push(route.path + ": Open Graph image must use the canonical host");
    if (twitterCard !== "summary_large_image") failures.push(route.path + ": Twitter card must use summary_large_image");
    if (twitterTitle !== title) failures.push(route.path + ": Twitter title must match the page title");
    if (twitterDescription !== description) failures.push(route.path + ": Twitter description must match the page description");
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
    ogTitle,
    ogUrl,
    ogImage,
    twitterCard,
    schema: hasSchema ? route.schema : null,
  });
}

async function auditStaticDiscoveryFiles() {
  const assets = [
    { path: "/robots.txt", required: ["User-agent: OAI-SearchBot", "User-agent: GPTBot", "Sitemap: https://envtools.store/sitemap.xml"] },
    { path: "/sitemap.xml", required: ["<urlset", "https://envtools.store/tools/developer/json-studio", "https://envtools.store/blog/tool-json-studio"] },
    { path: "/llms.txt", required: ["# enV", "## Public tool categories", "## All public tool pages and guides", "https://envtools.store/tools/developer/json-studio"] },
  ];
  for (const asset of assets) {
    try {
      const response = await fetch(new URL(asset.path, baseUrl), {
        redirect: "follow",
        signal: AbortSignal.timeout(20_000),
      });
      const body = await response.text();
      if (!response.ok) failures.push(asset.path + ": HTTP " + response.status);
      if (!body.trim() || body.trimStart().startsWith("<!doctype html")) {
        failures.push(asset.path + ": expected a static discovery file, not an HTML fallback");
      }
      for (const phrase of asset.required) {
        if (!body.includes(phrase)) failures.push(asset.path + ": missing required content " + phrase);
      }
      if (asset.path === "/robots.txt" && !body.includes("Disallow: /api/")) {
        failures.push("/robots.txt: API routes must remain excluded from crawler access");
      }
      if (asset.path === "/sitemap.xml") {
        const locations = [...body.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => match[1]);
        if (locations.length < 20) failures.push("/sitemap.xml: expected the platform and public tool route inventory");
        if (new Set(locations).size !== locations.length) failures.push("/sitemap.xml: duplicate canonical URL entries");
        if (locations.some((url) => !url.startsWith("https://envtools.store/") && url !== "https://envtools.store")) {
          failures.push("/sitemap.xml: every URL must use the canonical https://envtools.store host");
        }
        for (const privatePath of ["/wallet", "/account", "/settings", "/login", "/search", "/updates", "/3d-game-studio"]) {
          if (locations.some((url) => url === "https://envtools.store" + privatePath || url.startsWith("https://envtools.store" + privatePath + "/"))) {
            failures.push("/sitemap.xml: private or interaction-only route must not be listed: " + privatePath);
          }
        }
      }
      report.push({ path: asset.path, status: response.status, contentLength: body.length });
    } catch (error) {
      failures.push(asset.path + ": request failed: " + String(error));
    }
  }
}

await auditStaticDiscoveryFiles();
process.stdout.write(JSON.stringify({ checked: report.length, report, failures }, null, 2) + "\n");
if (failures.length) {
  process.stderr.write("Rendered SEO audit failed with " + failures.length + " issue(s):\n" + failures.map((item) => "- " + item).join("\n") + "\n");
  process.exit(1);
}
process.stdout.write("PASS: rendered metadata, canonicals, structured data, noindex policies, robots.txt, sitemap.xml and llms.txt.\n");
