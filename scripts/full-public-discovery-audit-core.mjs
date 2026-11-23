const CANONICAL_ORIGIN = "https://envtools.store";

function decodeHtmlEntities(value) {
  return String(value)
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&#x27;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">");
}

function readAttribute(tag, name) {
  const match = tag.match(new RegExp("\\b" + name + "\\s*=\\s*(?:\"([^\"]*)\"|'([^']*)'|([^\\s>]+))", "i"));
  return decodeHtmlEntities(match?.[1] ?? match?.[2] ?? match?.[3] ?? "");
}

function metaValue(head, key, value) {
  const tags = [...head.matchAll(/<meta\b[^>]*>/gi)].map((match) => match[0]);
  const tag = tags.find((candidate) => readAttribute(candidate, key).toLowerCase() === value.toLowerCase());
  return tag ? readAttribute(tag, "content") : "";
}

function collectSchemaTypes(value, target) {
  if (!value || typeof value !== "object") return;
  if (Array.isArray(value)) {
    for (const item of value) collectSchemaTypes(item, target);
    return;
  }
  const type = value["@type"];
  if (Array.isArray(type)) {
    for (const item of type) if (typeof item === "string") target.add(item);
  } else if (typeof type === "string") {
    target.add(type);
  }
  for (const [key, item] of Object.entries(value)) {
    if (key !== "@type") collectSchemaTypes(item, target);
  }
}

export function inspectSeoHtml(html) {
  const source = String(html);
  const head = source.match(/<head\b[^>]*>([\s\S]*?)<\/head>/i)?.[1] ?? "";
  const title = decodeHtmlEntities(
    head.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)?.[1]?.replace(/<[^>]+>/g, "").trim() ?? "",
  );
  const canonicalTags = [...head.matchAll(/<link\b[^>]*>/gi)]
    .map((match) => match[0])
    .filter((tag) => readAttribute(tag, "rel").toLowerCase().split(/\s+/).includes("canonical"));
  const schemaTypes = new Set();
  const invalidJsonLdScripts = [];
  const jsonLdScripts = [...head.matchAll(/<script\b[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)];
  for (const [index, match] of jsonLdScripts.entries()) {
    try {
      collectSchemaTypes(JSON.parse(match[1]), schemaTypes);
    } catch {
      invalidJsonLdScripts.push(index);
    }
  }
  const anchors = [...source.matchAll(/<a\b[^>]*>/gi)]
    .map((match) => readAttribute(match[0], "href"))
    .filter(Boolean);
  const h1Count = [...source.matchAll(/<h1\b[^>]*>/gi)].length;
  return {
    title,
    description: metaValue(head, "name", "description"),
    robots: metaValue(head, "name", "robots").toLowerCase(),
    canonical: canonicalTags[0] ? readAttribute(canonicalTags[0], "href") : "",
    canonicalCount: canonicalTags.length,
    ogSiteName: metaValue(head, "property", "og:site_name"),
    ogTitle: metaValue(head, "property", "og:title"),
    ogDescription: metaValue(head, "property", "og:description"),
    ogUrl: metaValue(head, "property", "og:url"),
    ogImage: metaValue(head, "property", "og:image"),
    ogImageAlt: metaValue(head, "property", "og:image:alt"),
    twitterCard: metaValue(head, "name", "twitter:card"),
    twitterTitle: metaValue(head, "name", "twitter:title"),
    twitterDescription: metaValue(head, "name", "twitter:description"),
    twitterImage: metaValue(head, "name", "twitter:image"),
    buildSha: metaValue(head, "name", "env-build-sha"),
    h1Count,
    schemaTypes: [...schemaTypes].sort(),
    invalidJsonLdScripts,
    anchors,
  };
}

export function validateSeoRouteResponse({
  route,
  status,
  contentType = "",
  finalUrl = "",
  facts,
  baseOrigin = "http://127.0.0.1:8080",
  expectedBuildSha = "",
}) {
  const errors = [];
  const fail = (message) => errors.push(route.path + ": " + message);
  const expectedCanonical = CANONICAL_ORIGIN + route.path;
  if (status !== 200) fail("expected HTTP 200, received " + status);
  if (!String(contentType).toLowerCase().includes("text/html")) fail("expected HTML content type, received " + contentType);
  if (finalUrl) {
    try {
      const final = new URL(finalUrl);
      const base = new URL(baseOrigin);
      if (final.origin !== base.origin || (final.pathname.replace(/\/$/, "") || "/") !== route.path) {
        fail("request redirected away from the requested route (final URL " + finalUrl + ")");
      }
    } catch {
      fail("response exposed an invalid final URL: " + finalUrl);
    }
  }
  if (!facts.title || facts.title.length < 8 || facts.title.length > 65) fail("title missing or outside the 8-65 character quality range (" + facts.title.length + ")");
  if (route.expectedTitle && facts.title !== route.expectedTitle) fail("title differs from the route's current peer-aware metadata (expected " + JSON.stringify(route.expectedTitle) + ", received " + JSON.stringify(facts.title) + ")");
  if (!facts.description || facts.description.length < 40 || facts.description.length > 170) fail("meta description missing or outside the 40-170 character range (" + facts.description.length + ")");
  if (route.expectedDescription && facts.description !== route.expectedDescription) fail("description differs from the current tool/article source");
  if (!facts.robots || /(?:^|[,\s])(?:noindex|none)(?:$|[,\s])/.test(facts.robots)) fail("indexable route has missing or blocking robots metadata (" + facts.robots + ")");
  if (facts.canonicalCount !== 1) fail("expected exactly one canonical link, found " + facts.canonicalCount);
  if (facts.canonical !== expectedCanonical) fail("canonical mismatch (expected " + expectedCanonical + ", received " + facts.canonical + ")");
  if (facts.ogSiteName !== "enV") fail("Open Graph site name must be enV");
  if (facts.ogTitle !== facts.title) fail("Open Graph title does not match the page title");
  if (facts.ogDescription !== facts.description) fail("Open Graph description does not match the meta description");
  if (facts.ogUrl !== expectedCanonical) fail("Open Graph URL does not match the canonical URL");
  if (typeof facts.ogImage !== "string" || !facts.ogImage.startsWith(CANONICAL_ORIGIN + "/")) fail("Open Graph image must use the canonical host");
  if (!facts.ogImageAlt || facts.ogImageAlt.length < 12) fail("Open Graph image is missing descriptive alternative text");
  if (facts.twitterCard !== "summary_large_image") fail("X/Twitter card must use summary_large_image");
  if (facts.twitterTitle !== facts.title) fail("X/Twitter title does not match the page title");
  if (facts.twitterDescription !== facts.description) fail("X/Twitter description does not match the meta description");
  if (facts.twitterImage !== facts.ogImage) fail("X/Twitter image does not match the Open Graph image");
  if (facts.h1Count < 1) fail("rendered page is missing a primary H1 heading");
  if (!facts.schemaTypes.includes(route.schema)) fail("missing JSON-LD schema type " + route.schema);
  if (facts.invalidJsonLdScripts.length) fail("contains invalid JSON-LD script block(s): " + facts.invalidJsonLdScripts.join(", "));
  if (!facts.buildSha || facts.buildSha === "local") fail("missing deployment/source build SHA metadata");
  if (expectedBuildSha && facts.buildSha !== expectedBuildSha) fail("build SHA mismatch (expected " + expectedBuildSha + ", received " + facts.buildSha + ")");
  return errors;
}

export function normalizeInternalHref(href, baseOrigin = "https://envtools.store") {
  try {
    const url = new URL(href, baseOrigin);
    if (url.origin !== baseOrigin && url.origin !== CANONICAL_ORIGIN) return null;
    return url.pathname.replace(/\/$/, "") || "/";
  } catch {
    return null;
  }
}
