#!/usr/bin/env node

const ORIGIN = "https://envtools.store";
const EXPECTED_HOMEPAGE_TITLE = "enV Digital Toolkit by chAs Technologies | Online Tools";
const EXPECTED_BUILD_SHA = process.env.GITHUB_SHA?.trim() ?? "";
const USER_AGENT = "enV-production-seo-smoke/1.0";
const failures = [];
const checked = [];
const privatePaths = [
  "/wallet", "/account", "/settings", "/login", "/search", "/updates", "/3d-game-studio",
];

function assert(condition, message) {
  if (!condition) failures.push(message);
}

function attribute(tag, name) {
  const match = tag.match(new RegExp("\\b" + name + "\\s*=\\s*(?:\"([^\"]*)\"|'([^']*)')", "i"));
  return match?.[1] ?? match?.[2] ?? "";
}

function metaContent(head, key, value) {
  const tags = [...head.matchAll(/<meta\b[^>]*>/gi)].map((match) => match[0]);
  const tag = tags.find((item) => attribute(item, key).toLowerCase() === value.toLowerCase());
  return tag ? attribute(tag, "content") : "";
}

function xmlDecode(value) {
  return value
    .replaceAll("&amp;", "&")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", "\"")
    .replaceAll("&apos;", "'");
}

async function get(url, label) {
  let lastError;
  for (let attempt = 1; attempt <= 4; attempt += 1) {
    try {
      const response = await fetch(url, {
        redirect: "follow",
        headers: { "user-agent": USER_AGENT },
        signal: AbortSignal.timeout(30_000),
      });
      if (response.status >= 500 && attempt < 4) {
        await new Promise((resolve) => setTimeout(resolve, attempt * 1500));
        continue;
      }
      return response;
    } catch (error) {
      lastError = error;
      if (attempt < 4) await new Promise((resolve) => setTimeout(resolve, attempt * 1500));
    }
  }
  throw new Error(label + ": request failed after retries: " + String(lastError));
}

async function checkStaticAssets() {
  const robotsResponse = await get(ORIGIN + "/robots.txt", "robots.txt");
  const robots = await robotsResponse.text();
  assert(robotsResponse.status === 200, "robots.txt returned HTTP " + robotsResponse.status);
  assert(!robots.trimStart().startsWith("<!doctype html"), "robots.txt returned an HTML fallback instead of crawler rules");
  for (const agent of ["Googlebot", "Bingbot", "OAI-SearchBot", "Claude-SearchBot", "PerplexityBot", "Applebot"]) {
    const rule = new RegExp("User-agent:\\s*" + agent + "\\s*\\nAllow:\\s*/\\s*\\nDisallow:\\s*/api/", "i");
    assert(rule.test(robots), "robots.txt does not explicitly allow public pages and block API routes for " + agent);
  }
  for (const agent of ["Google-Extended", "GPTBot", "ClaudeBot", "Applebot-Extended"]) {
    const rule = new RegExp("User-agent:\\s*" + agent + "\\s*\\nDisallow:\\s*/(?:\\s|$)", "i");
    assert(rule.test(robots), "robots.txt no longer applies the configured disallow policy to " + agent);
  }
  assert(robots.includes("Sitemap: " + ORIGIN + "/sitemap.xml"), "robots.txt does not reference the canonical sitemap URL");
  checked.push({ path: "/robots.txt", status: robotsResponse.status, bytes: Buffer.byteLength(robots) });

  const llmsResponse = await get(ORIGIN + "/llms.txt", "llms.txt");
  const llms = await llmsResponse.text();
  assert(llmsResponse.status === 200, "llms.txt returned HTTP " + llmsResponse.status);
  assert(!llms.trimStart().startsWith("<!doctype html"), "llms.txt returned an HTML fallback instead of discovery text");
  for (const section of [
    "# enV", "## Primary pages", "## Public tool categories",
    "## Canonical public tool pages", "## All public tool guides",
    "## Product articles", "## Accuracy",
  ]) assert(llms.includes(section), "llms.txt is missing required section: " + section);
  assert(llms.includes(ORIGIN + "/sitemap.xml"), "llms.txt does not reference the canonical sitemap");
  checked.push({ path: "/llms.txt", status: llmsResponse.status, bytes: Buffer.byteLength(llms) });

  const sitemapResponse = await get(ORIGIN + "/sitemap.xml", "sitemap.xml");
  const sitemap = await sitemapResponse.text();
  const sitemapType = sitemapResponse.headers.get("content-type")?.toLowerCase() ?? "";
  assert(sitemapResponse.status === 200, "sitemap.xml returned HTTP " + sitemapResponse.status);
  assert(/(?:application|text)\/xml/.test(sitemapType), "sitemap.xml has unexpected content type: " + sitemapType);
  const sitemapBodies = [];
  if (sitemap.includes("<sitemapindex")) {
    const shardUrls = [...sitemap.matchAll(/<loc>([\s\S]*?)<\/loc>/g)].map((match) => xmlDecode(match[1].trim()));
    assert(shardUrls.length >= 2, "sitemap index must point to at least two shards");
    for (const shardUrl of shardUrls) {
      assert(shardUrl.startsWith(ORIGIN + "/"), "sitemap shard URL is not on the canonical host: " + shardUrl);
      if (!shardUrl.startsWith(ORIGIN + "/")) continue;
      const shardResponse = await get(shardUrl, "sitemap shard " + shardUrl);
      const shardBody = await shardResponse.text();
      assert(shardResponse.status === 200, "sitemap shard returned HTTP " + shardResponse.status + ": " + shardUrl);
      assert(shardBody.includes("<urlset"), "sitemap shard is not a urlset: " + shardUrl);
      sitemapBodies.push(shardBody);
    }
  } else if (sitemap.includes("<urlset")) {
    sitemapBodies.push(sitemap);
  } else {
    failures.push("sitemap.xml is neither a urlset nor a sitemap index");
  }
  const locations = sitemapBodies.flatMap((body) =>
    [...body.matchAll(/<loc>([\s\S]*?)<\/loc>/g)].map((match) => xmlDecode(match[1].trim()))
  );
  assert(locations.length >= 20, "sitemap contains fewer than 20 public URLs (" + locations.length + ")");
  assert(new Set(locations).size === locations.length, "sitemap contains duplicate canonical URLs");
  for (const url of locations) {
    assert(url.startsWith(ORIGIN + "/") || url === ORIGIN, "sitemap contains a non-canonical host URL: " + url);
  }
  for (const path of [
    "/", "/tools", "/about", "/pricing", "/blog", "/contact", "/help",
    "/privacy", "/terms", "/disclaimer", "/responsible-use",
    "/platform/android", "/platform/ios", "/token-guide",
  ]) assert(locations.includes(ORIGIN + path), "sitemap is missing a required public page: " + path);
  for (const path of privatePaths) {
    if (locations.some((url) => url === ORIGIN + path || url.startsWith(ORIGIN + path + "/"))) {
      failures.push("sitemap includes a private or interaction-only route: " + path);
    }
  }
  checked.push({ path: "/sitemap.xml", status: sitemapResponse.status, urlCount: locations.length, shards: sitemapBodies.length });
}

async function checkCanonicalHosts() {
  const aliases = ["www.envtools.store", "envtools.site", "www.envtools.site", "en-v.vercel.app"];
  for (const host of aliases) {
    const aliasUrl = "https://" + host + "/robots.txt";
    let initial;
    try {
      initial = await fetch(aliasUrl, {
        redirect: "manual",
        headers: { "user-agent": USER_AGENT },
        signal: AbortSignal.timeout(30_000),
      });
    } catch (error) {
      failures.push("canonical host alias " + host + " could not be reached: " + String(error));
      continue;
    }
    const location = initial.headers.get("location") ?? "";
    const redirectProvider = {
      server: initial.headers.get("server") ?? "",
      via: initial.headers.get("via") ?? "",
      vercelId: initial.headers.get("x-vercel-id") ?? "",
      cloudflareRay: initial.headers.get("cf-ray") ?? "",
    };
    const providerSummary = JSON.stringify(redirectProvider);
    assert([301, 308].includes(initial.status), host + " should return a permanent redirect (301/308), received " + initial.status + " from " + providerSummary);
    if (location) {
      let destination;
      try {
        destination = new URL(location, aliasUrl);
      } catch {
        failures.push(host + " returned an invalid redirect Location: " + location + " from " + providerSummary);
        continue;
      }
      assert(destination.origin === ORIGIN, host + " redirects to a non-canonical host: " + destination.origin + " (Location=" + location + "; provider=" + providerSummary + ")");
      assert(destination.pathname === "/robots.txt", host + " does not preserve the requested path in its canonical redirect (Location=" + location + ")");
    } else {
      failures.push(host + " did not provide a redirect Location header (provider=" + providerSummary + ")");
    }
    try {
      const finalResponse = await get(aliasUrl, "canonical host alias " + host);
      assert(finalResponse.url === ORIGIN + "/robots.txt", host + " did not resolve directly to the canonical host (first Location: " + location + "; final URL: " + finalResponse.url + "; provider=" + providerSummary + ")");
      checked.push({ path: "https://" + host + "/robots.txt", status: initial.status, firstRedirect: location, finalUrl: finalResponse.url, ...redirectProvider });
    } catch (error) {
      failures.push(String(error));
    }
  }
}

async function waitForHomepageDeployment() {
  // The live smoke is triggered by a Git push while Vercel builds in parallel.
  // Wait for a page-level build marker before evaluating production metadata,
  // otherwise a fast smoke can accidentally inspect the previous deployment.
  let last = { status: 0, title: "", url: ORIGIN + "/" };
  for (let attempt = 1; attempt <= 36; attempt += 1) {
    try {
      const response = await fetch(ORIGIN + "/", {
        redirect: "follow",
        headers: { "user-agent": USER_AGENT },
        signal: AbortSignal.timeout(10_000),
      });
      const html = await response.text();
      const head = html.match(/<head\b[^>]*>([\s\S]*?)<\/head>/i)?.[1] ?? "";
      const title = head.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)?.[1]?.replace(/<[^>]+>/g, "").trim() ?? "";
      const buildSha = metaContent(head, "name", "env-build-sha");
      last = { status: response.status, title, buildSha, url: response.url };
      const matchingBuild = EXPECTED_BUILD_SHA ? buildSha === EXPECTED_BUILD_SHA : title === EXPECTED_HOMEPAGE_TITLE;
      if (response.status === 200 && title === EXPECTED_HOMEPAGE_TITLE && matchingBuild) {
        checked.push({ path: "/", status: response.status, title, buildSha, deploymentVersionConfirmed: true });
        return true;
      }
    } catch (error) {
      last = { status: 0, title: "", url: ORIGIN + "/", error: String(error) };
    }
    if (attempt < 36) await new Promise((resolve) => setTimeout(resolve, 5_000));
  }
  failures.push(
    "production did not serve the current homepage build within 180 seconds (expected title="
    + JSON.stringify(EXPECTED_HOMEPAGE_TITLE) + ", last response=" + JSON.stringify(last) + ")"
  );
  return false;
}

async function checkRenderedRoute(path, schema) {
  const response = await get(ORIGIN + path, path);
  const html = await response.text();
  assert(response.status === 200, path + " returned HTTP " + response.status);
  const head = html.match(/<head\b[^>]*>([\s\S]*?)<\/head>/i)?.[1] ?? "";
  const title = head.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)?.[1]?.replace(/<[^>]+>/g, "").trim() ?? "";
  const description = metaContent(head, "name", "description");
  const robots = metaContent(head, "name", "robots").toLowerCase();
  const buildSha = metaContent(head, "name", "env-build-sha");
  assert(Boolean(buildSha) && buildSha !== "local", path + " is missing build SHA metadata");
  if (EXPECTED_BUILD_SHA) assert(buildSha === EXPECTED_BUILD_SHA, path + " is not serving the current GitHub commit (expected " + EXPECTED_BUILD_SHA + ", received " + buildSha + ")");
  const canonicalTags = [...head.matchAll(/<link\b[^>]*>/gi)]
    .map((match) => match[0])
    .filter((tag) => attribute(tag, "rel").toLowerCase().split(/\s+/).includes("canonical"));
  const canonical = canonicalTags[0] ? attribute(canonicalTags[0], "href") : "";
  const ogTitle = metaContent(head, "property", "og:title");
  const ogUrl = metaContent(head, "property", "og:url");
  const twitterTitle = metaContent(head, "name", "twitter:title");
  const jsonLd = [...head.matchAll(/<script\b[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)]
    .map((match) => match[1]);

  assert(title.length >= 8 && title.length <= 65, path + " title is missing or exceeds 65 characters (" + title.length + ")");
  if (path === "/") {
    assert(title === EXPECTED_HOMEPAGE_TITLE, "Homepage title must disambiguate the enV brand: " + title);
    assert(description.includes("enV Digital Toolkit by chAs Technologies LLC"), "Homepage description must identify the parent brand.");
  }
  assert(description.length >= 40 && description.length <= 170, path + " has an invalid description length (" + description.length + ")");
  assert(robots && !robots.includes("noindex"), path + " should be indexable but has robots=" + robots);
  assert(canonicalTags.length === 1, path + " should have exactly one canonical link (found " + canonicalTags.length + ")");
  assert(canonical === ORIGIN + path, path + " has incorrect canonical URL: " + canonical);
  assert(ogTitle === title, path + " Open Graph title does not match its page title");
  assert(ogUrl === canonical, path + " Open Graph URL does not match its canonical URL");
  assert(twitterTitle === title, path + " Twitter title does not match its page title");
  assert(jsonLd.some((json) => json.includes('"@type":"' + schema + '"') || json.includes('"@type": "' + schema + '"')),
    path + " is missing JSON-LD schema type " + schema);
  if (path === "/tools/productivity/zip-any-file") {
    assert(html.includes("Zip any file"), "Zip any file route does not render its tool name");
    assert(html.includes("Compress") && html.includes("Extract"), "Zip any file route is missing compression or extraction controls");
    assert(html.includes("Private and on-device"), "Zip any file route is missing its local privacy notice");
    assert(!html.includes("Under production"), "Zip any file is incorrectly blocked by the production notice");
  }
  checked.push({ path, status: response.status, title, canonical, schema, buildSha });
}

async function main() {
  try {
    await waitForHomepageDeployment();
    await checkStaticAssets();
    await checkCanonicalHosts();
    for (const [path, schema] of [
      ["/", "WebSite"],
      ["/tools", "CollectionPage"],
      ["/tools/calculators", "CollectionPage"],
      ["/tools/developer/json-studio", "SoftwareApplication"],
      ["/blog", "CollectionPage"],
      ["/blog/tool-json-studio", "TechArticle"],
      ["/tools/productivity/zip-any-file", "SoftwareApplication"],
    ]) await checkRenderedRoute(path, schema);
  } catch (error) {
    failures.push(String(error));
  }
  process.stdout.write(JSON.stringify({ origin: ORIGIN, checked: checked.length, report: checked, failures }, null, 2) + "\n");
  if (failures.length) {
    process.stderr.write("Live SEO smoke failed with " + failures.length + " issue(s):\n" + failures.map((item) => "- " + item).join("\n") + "\n");
    process.exit(1);
  }
  process.stdout.write("PASS: public production robots, sitemap, llms.txt, canonical routes, metadata and structured data.\n");
}

await main();
