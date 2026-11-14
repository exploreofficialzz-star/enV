import { execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import { chunkIndexNowUrls, routeGroups, selectChangedUrls, submitIndexNowBatch, urlsFromXml } from "./indexnow-utils.mjs";
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

async function verifyKeyFile(key) {
  const url = SITE_ORIGIN + "/" + key + ".txt";
  const response = await fetch(url, { redirect: "follow", signal: AbortSignal.timeout(12_000) });
  if (!response.ok) return { ok: false, reason: "The production key file returned HTTP " + response.status + "." };
  const body = (await response.text()).trim();
  if (body !== key) return { ok: false, reason: "The production key file content does not match INDEXNOW_KEY." };
  return { ok: true, url };
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
  let pendingKeyValidationBatches = 0;
  const batches = chunkIndexNowUrls(urlList, MAX_URLS_PER_POST);
  for (const batch of batches) {
    const result = await submitIndexNowBatch({
      endpoint: INDEXNOW_ENDPOINT,
      host: "envtools.store",
      key,
      keyLocation: verification.url,
      urlList: batch,
    });
    if (!result.accepted) {
      process.stderr.write("IndexNow batch was not accepted (HTTP " + result.status + "): " + result.body + "\n");
      process.stderr.write("The deployment is not blocked; retry the notification after resolving the IndexNow response.\n");
      return;
    }
    submitted += batch.length;
    if (result.state === "accepted-pending-key-validation") pendingKeyValidationBatches += 1;
  }

  process.stdout.write("IndexNow received " + submitted + " changed or removed canonical URLs in " +
    batches.length + " batch(es)." +
    (pendingKeyValidationBatches
      ? " Key validation is pending for " + pendingKeyValidationBatches + " batch(es)."
      : " The endpoint returned HTTP 200 for each batch.") +
    " Receipt does not prove crawling or indexing.\n");
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  await main();
}
