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
