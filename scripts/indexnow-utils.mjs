const SITE_ORIGIN = "https://envtools.store";

export function buildIndexNowKeyArtifact(value) {
  const key = String(value ?? "").trim();
  if (!key) return null;
  if (!/^[A-Za-z0-9-]{8,128}$/.test(key)) {
    throw new Error("INDEXNOW_KEY must contain 8-128 letters, numbers or hyphens.");
  }
  return { path: "public/" + key + ".txt", content: key };
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

export function routeGroups(artifacts) {
  const all = artifacts.urls.map((path) => SITE_ORIGIN + path);
  const pathname = (url) => new URL(url).pathname;
  const toolPages = all.filter((url) => {
    const path = pathname(url);
    return path.startsWith("/tools/") && path.split("/").length === 4;
  });
  const guidePages = all.filter((url) => pathname(url).startsWith("/blog/tool-"));
  const categoryPages = all.filter((url) => {
    const path = pathname(url);
    return path.startsWith("/tools/") && path.split("/").length === 3;
  });
  const articlePages = all.filter((url) => {
    const path = pathname(url);
    return path.startsWith("/blog/") && path !== "/blog" && !path.startsWith("/blog/tool-");
  });
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


const MAX_RETRY_AFTER_MS = 10_000;

export function indexNowResponseState(status) {
  if (status === 200) return "accepted";
  if (status === 202) return "accepted-pending-key-validation";
  return "rejected";
}

export function parseIndexNowRetryAfter(value, now = Date.now()) {
  const header = String(value ?? "").trim();
  if (!header) return null;
  const seconds = Number(header);
  const delay = Number.isFinite(seconds) ? seconds * 1000 : Date.parse(header) - now;
  if (!Number.isFinite(delay)) return null;
  return Math.max(0, delay);
}

export function indexNowRetryDelayMs(status, retryAfter, attempt, now = Date.now()) {
  const retryable = status === 429 || (status >= 500 && status <= 599);
  if (!retryable) return null;
  const serverDelay = parseIndexNowRetryAfter(retryAfter, now);
  if (serverDelay !== null) {
    // Do not retry earlier than a server-requested delay. If it exceeds this
    // deployment's retry budget, defer the notification instead of retrying early.
    return serverDelay <= MAX_RETRY_AFTER_MS ? serverDelay : null;
  }
  return Math.min(1000 * 2 ** Math.max(0, attempt), MAX_RETRY_AFTER_MS);
}

const wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

export async function submitIndexNowBatch({
  endpoint,
  host,
  key,
  keyLocation,
  urlList,
  fetchImpl = fetch,
  sleep = wait,
  maxRetries = 2,
}) {
  const retries = Math.max(0, Math.min(5, Math.floor(maxRetries)));
  const body = JSON.stringify({ host, key, keyLocation, urlList });

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    let response;
    try {
      response = await fetchImpl(endpoint, {
        method: "POST",
        headers: {
          "content-type": "application/json; charset=utf-8",
          accept: "application/json, text/plain, */*",
        },
        body,
        signal: AbortSignal.timeout(20_000),
      });
    } catch (error) {
      if (attempt < retries) {
        await sleep(Math.min(1000 * 2 ** attempt, MAX_RETRY_AFTER_MS));
        continue;
      }
      return {
        status: 0,
        accepted: false,
        state: "network-error",
        body: String(error).slice(0, 500),
        attempts: attempt + 1,
      };
    }

    const responseBody = await response.text().catch(() => "");
    const state = indexNowResponseState(response.status);
    if (state !== "rejected") {
      return {
        status: response.status,
        accepted: true,
        state,
        body: responseBody.slice(0, 500),
        attempts: attempt + 1,
      };
    }

    const retryDelay = indexNowRetryDelayMs(
      response.status,
      response.headers?.get?.("retry-after"),
      attempt,
    );
    if (retryDelay !== null && attempt < retries) {
      await sleep(retryDelay);
      continue;
    }

    return {
      status: response.status,
      accepted: false,
      state: "rejected",
      body: responseBody.slice(0, 500),
      attempts: attempt + 1,
    };
  }

  return {
    status: 0,
    accepted: false,
    state: "network-error",
    body: "IndexNow submission exhausted its retry budget.",
    attempts: retries + 1,
  };
}
