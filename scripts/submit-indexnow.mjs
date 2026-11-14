import { execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
import { buildSeoArtifacts } from "./generate-seo-artifacts.mjs";

const SITE_ORIGIN = "https://envtools.store";
const INDEXNOW_ENDPOINT = "https://api.indexnow.org/indexnow";
const MAX_URLS_PER_POST = 10_000;

function gitOutput(args) {
  try {
    return execFileSync("git", args, { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
  } catch {
    return "";
  }
}

function previousCommitSha() {
  const configured = process.env.VERCEL_GIT_PREVIOUS_SHA?.trim();
  if (configured && /^[a-f0-9]{40}$/i.test(configured)) return configured;
  const current = process.env.VERCEL_GIT_COMMIT_SHA?.trim() || "HEAD";
  const parent = gitOutput(["rev-parse", current + "^"]);
  return /^[a-f0-9]{40}$/i.test(parent) ? parent : "";
}

function changedFiles(baseSha) {
  const current = process.env.VERCEL_GIT_COMMIT_SHA?.trim() || "HEAD";
  const output = gitOutput(["diff", "--name-only", baseSha, current]);
  return output ? output.split(/\r?\n/).filter(Boolean) : [];
}

function decodeXml(value) {
  return String(value)
    .replaceAll("&amp;", "&")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", '"')
    .replaceAll("&apos;", "'");
}

export function urlsFromXml(xml) {
  return [...String(xml).matchAll(/<loc>([\s\S]*?)<\/loc>/g)]
    .map((match) => decodeXml(match[1].trim()))
    .filter((value) => value.startsWith(SITE_ORIGIN + "/"));
}

function previousSitemapUrls(baseSha) {
  if (!baseSha) return [];
  const root = gitOutput(["show", baseSha + ":public/sitemap.xml"]);
  if (!root) return [];
  const locations = urlsFromXml(root);
  if (!root.includes("<sitemapindex")) return locations;
  const urls = [];
  for (const location of locations) {
    const pathname = new URL(location).pathname.replace(/^\/+/, "");
    const shard = gitOutput(["show", baseSha + ":public/" + pathname]);
    if (shard) urls.push(...urlsFromXml(shard));
  }
  return [...new Set(urls)];
}

export function routeGroups(artifacts) {
  const all = artifacts.urls.map((path) => SITE_ORIGIN + path);
  const toolPages = all.filter((url) => /^\\/tools\\/[^/]+\\/[^/]+$/.test(new URL(url).pathname));
  const guidePages = all.filter((url) => new URL(url).pathname.startsWith("/blog/tool-"));
  const categoryPages = all.filter((url) => /^\\/tools\\/[^/]+$/.test(new URL(url).pathname));
  const articlePages = all.filter((url) => new URL(url).pathname.startsWith("/blog/") && !new URL(url).pathname.startsWith("/blog/tool-"));
  return {
    all,
    tools: [...toolPages, ...guidePages, SITE_ORIGIN + "/tools", ...categoryPages],
    guides: [...guidePages, ...toolPages],
    categories: [...categoryPages, SITE_ORIGIN + "/tools"],
    articles: [...articlePages, SITE_ORIGIN + "/blog"],
  };
}

export function selectChangedUrls(files, groups, currentUrls) {
  const changed = new Set();
  const all = () => groups.all.forEach((url) => changed.add(url));
  const add = (values) => values.forEach((url) => changed.add(url));
  const broad = files.some((path) =>
    path === "src/lib/seo-metadata.ts" ||
    path === "src/lib/generated-tool-copy.mjs" ||
    path === "src/lib/registry.ts" ||
    path === "scripts/generate-seo-artifacts.mjs" ||
    path === "src/routes/__root.tsx" ||
    path === "src/routes/index.tsx" ||
    path.startsWith("src/routes/") ||
    path.startsWith("scripts/site-meta-") ||
    path === "src/data/catalog.ts" ||
    path === "src/lib/tool-documentation.ts" ||
    path === "scripts/gen-catalog.mjs"
  );
  if (broad) {
    all();
  } else {
    if (files.includes("src/data/categories.ts")) add(groups.categories);
    if (files.includes("src/data/blog-articles.ts")) add(groups.articles);
    if (files.some((path) => path === "src/data/catalog.ts" || path === "src/lib/registry.ts")) add(groups.tools);
    if (files.includes("public/og.jpg") || files.includes("src/lib/og/site.json")) all();
  }
  return [...changed].filter((url) => currentUrls.has(url));
}

async function verifyKeyFile(key) {
  const url = SITE_ORIGIN + "/" + key + ".txt";
  const response = await fetch(url, { redirect: "follow", signal: AbortSignal.timeout(12_000) });
  if (!response.ok) return { ok: false, reason: "The production key file returned HTTP " + response.status + "." };
  const body = (await response.text()).trim();
  if (body !== key) return { ok: false, reason: "The production key file content does not match INDEXNOW_KEY." };
  return { ok: true, url };
}

async function submitBatch(key, keyLocation, urlList) {
  const response = await fetch(INDEXNOW_ENDPOINT, {
    method: "POST",
    headers: { "content-type": "application/json; charset=utf-8", accept: "application/json, text/plain, */*" },
    body: JSON.stringify({ host: "envtools.store", key, keyLocation, urlList }),
    signal: AbortSignal.timeout(20_000),
  });
  const body = await response.text().catch(() => "");
  return { status: response.status, ok: response.status === 200, body: body.slice(0, 500) };
}

async function main() {
  if (process.env.VERCEL_ENV !== "production") {
    process.stdout.write("IndexNow submission skipped outside the production build.\n");
    return;
  }

  const key = String(process.env.INDEXNOW_KEY ?? "").trim();
  if (!key) {
    process.stdout.write("IndexNow submission skipped: INDEXNOW_KEY is not configured.\n");
    return;
  }

  const artifacts = buildSeoArtifacts({ indexNowKey: key });
  const baseSha = previousCommitSha();
  const forceAll = process.argv.includes("--submit-all") || process.env.INDEXNOW_SUBMIT_ALL === "true";
  if (!baseSha && !forceAll) {
    process.stdout.write("IndexNow submission skipped: no previous deployment commit is available for change detection.\n");
    return;
  }

  const groups = routeGroups(artifacts);
  const currentSet = new Set(groups.all);
  const changed = forceAll ? groups.all : selectChangedUrls(changedFiles(baseSha), groups, currentSet);
  const removed = forceAll ? [] : previousSitemapUrls(baseSha).filter((url) => !currentSet.has(url));
  const urlList = [...new Set([...changed, ...removed])];

  if (urlList.length === 0) {
    process.stdout.write("IndexNow submission skipped: no indexable public URLs changed in this deployment.\n");
    return;
  }

  const verification = await verifyKeyFile(key).catch((error) => ({ ok: false, reason: String(error) }));
  if (!verification.ok) {
    process.stdout.write("IndexNow submission deferred: " + verification.reason + " The key file must be live on the canonical domain before URL notifications can be accepted.\n");
    return;
  }

  let submitted = 0;
  for (let offset = 0; offset < urlList.length; offset += MAX_URLS_PER_POST) {
    const batch = urlList.slice(offset, offset + MAX_URLS_PER_POST);
    const result = await submitBatch(key, verification.url, batch).catch((error) => ({
      status: 0, ok: false, body: String(error).slice(0, 500),
    }));
    if (!result.ok) {
      process.stderr.write("IndexNow batch was not accepted (HTTP " + result.status + "): " + result.body + "\n");
      process.stderr.write("The deployment is not blocked; retry the notification after resolving the IndexNow response.\n");
      return;
    }
    submitted += batch.length;
  }

  process.stdout.write("IndexNow accepted " + submitted + " changed or removed canonical URLs in " +
    Math.ceil(urlList.length / MAX_URLS_PER_POST) + " batch(es). This confirms receipt, not crawling or indexing.\n");
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  await main();
}
