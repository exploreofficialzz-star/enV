// Offline SEO artifact validator (requirements §4, offline portion).
//   node --experimental-strip-types --import ./scripts/register-ts-alias.mjs scripts/validate-seo-offline.mjs [--write] [--check]
// Validates what buildSeoArtifacts() WOULD publish: sitemap, route classification, canonical
// consistency, title/description quality, private-route exclusion, guide specificity.
// It cannot fetch the live site, so it proves nothing about indexing, rendering or rankings.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildSeoArtifacts } from "./generate-seo-artifacts.mjs";
import { CATEGORIES } from "../src/data/categories.ts";
import { toolPath } from "../src/lib/registry.ts";
import { canonicalToolPath, toolSeoTitle, toolSeoDescription, toolGuideSeoTitle, toolGuideSeoDescription, SITE_ORIGIN } from "../src/lib/seo-metadata.ts";
import { toolTaskGuidanceSource } from "../src/lib/tool-documentation.ts";

const root = fileURLToPath(new URL("../", import.meta.url));
const reportPath = path.join(root, "audit/discovery/SEO-OFFLINE-VALIDATION.md");
const PRIVATE = ["/account", "/login", "/signup", "/forgot-password", "/reset-password", "/token-dashboard", "/tokens", "/settings", "/history", "/favorites", "/agent", "/api", "/pair-native"];

export function validate() {
  const a = buildSeoArtifacts({ indexNowKey: "" });
  const failures = []; const notes = [];
  const fail = (code, message, ids = []) => failures.push({ code, message, count: ids.length || 1, sample: ids.slice(0, 8) });
  const urls = a.urls;
  const dup = urls.filter((u, i) => urls.indexOf(u) !== i);
  if (dup.length) fail("DUPLICATE_URL", "Sitemap contains duplicate URLs.", dup);
  const bad = urls.filter((u) => !u.startsWith("/") || /[?#]/.test(u) || (u.length > 1 && u.endsWith("/")));
  if (bad.length) fail("NON_CANONICAL_URL_SHAPE", "Sitemap URL has a query, hash or trailing slash.", bad);
  const priv = urls.filter((u) => PRIVATE.some((p) => u === p || u.startsWith(p + "/")));
  if (priv.length) fail("PRIVATE_ROUTE_IN_SITEMAP", "Private or account route is listed in the sitemap.", priv);

  const toolPaths = new Map(a.tools.map((t) => [toolPath(t), t]));
  const guideIds = new Map(a.guideTools.map((t) => [t.id, t]));
  const categoryPaths = new Set(CATEGORIES.map((c) => "/tools/" + c.id));
  const articleSlugs = new Set(a.articles.map((x) => x.slug));
  const classes = { tool: 0, guide: 0, category: 0, article: 0, static: 0 };
  const unclassified = [];
  for (const u of urls) {
    if (toolPaths.has(u)) classes.tool += 1;
    else if (categoryPaths.has(u)) classes.category += 1;
    else if (u.startsWith("/blog/tool-") && guideIds.has(u.slice("/blog/tool-".length))) classes.guide += 1;
    else if (u.startsWith("/blog/") && articleSlugs.has(u.slice(6))) classes.article += 1;
    else if (u.split("/").length <= 2 || u.startsWith("/platform/")) classes.static += 1;
    else unclassified.push(u);
  }
  if (unclassified.length) fail("UNCLASSIFIED_URL", "Sitemap URL maps to no tool, guide, category, article or static page.", unclassified);
  const missingTool = a.tools.filter((t) => !urls.includes(toolPath(t))).map((t) => t.id);
  if (missingTool.length) fail("TOOL_PAGE_NOT_IN_SITEMAP", "Public tool page is missing from the sitemap.", missingTool);
  const planned = [...a.tools, ...a.guideTools].filter((t) => t.status === "planned").map((t) => t.id);
  if (planned.length) fail("PLANNED_TOOL_PUBLISHED", "Planned tool has a public page or guide.", planned);
  const nonCanonical = a.tools.filter((t) => canonicalToolPath(t) !== toolPath(t)).map((t) => t.id);
  if (nonCanonical.length) fail("NON_CANONICAL_PUBLIC_TOOL", "Public tool page whose canonical path differs from its own path.", nonCanonical);

  const meta = (label, rows) => {
    const titles = new Map(); const descs = new Map(); const tooLong = []; const shortDesc = []; const emptyDesc = [];
    for (const { id, title, description } of rows) {
      (titles.get(title) ?? titles.set(title, []).get(title)).push(id);
      (descs.get(description) ?? descs.set(description, []).get(description)).push(id);
      if (title.length > 70) tooLong.push(id);
      if (!description) emptyDesc.push(id); else if (description.length < 50) shortDesc.push(id);
    }
    const dupTitles = [...titles.values()].filter((l) => l.length > 1);
    const dupDescs = [...descs.values()].filter((l) => l.length > 1);
    const longDesc = rows.filter(({ description }) => description.length > 160).map(({ id }) => id);
    if (dupTitles.length) fail(`${label}_DUPLICATE_TITLE`, `${label}: ${dupTitles.length} title(s) shared by several pages.`, dupTitles.flat());
    if (dupDescs.length) fail(`${label}_DUPLICATE_DESCRIPTION`, `${label}: ${dupDescs.length} meta description group(s) are duplicated.`, dupDescs.flat());
    if (tooLong.length) fail(`${label}_TITLE_TOO_LONG`, `${label}: title over 70 characters.`, tooLong);
    if (longDesc.length) fail(`${label}_DESCRIPTION_TOO_LONG`, `${label}: meta description over 160 characters.`, longDesc);
    if (emptyDesc.length) fail(`${label}_EMPTY_DESCRIPTION`, `${label}: empty meta description.`, emptyDesc);
    notes.push(`${label}: ${rows.length} pages · duplicate titles ${dupTitles.length} groups · duplicate descriptions ${dupDescs.length} groups (${dupDescs.flat().length} pages) · short (<50) descriptions ${shortDesc.length}.`);
  };
  meta("TOOL_PAGE", a.tools.map((t) => ({ id: t.id, title: toolSeoTitle(t, a.tools), description: toolSeoDescription(t, a.tools) })));
  meta("GUIDE_PAGE", a.guideTools.map((t) => ({ id: t.id, title: toolGuideSeoTitle(t, a.guideTools), description: toolGuideSeoDescription(t, a.guideTools) })));

  const guideSources = {};
  for (const t of a.guideTools) { const s = toolTaskGuidanceSource(t); guideSources[s] = (guideSources[s] ?? 0) + 1; }
  const specific = guideSources["operation-specific"] ?? 0;
  notes.push(`Guide specificity: ${JSON.stringify(guideSources)} of ${a.guideTools.length}; tool-specific ${(100 * specific / a.guideTools.length).toFixed(1)}%.`);
  if (!a.robots.includes("Sitemap: " + SITE_ORIGIN + "/sitemap.xml")) fail("ROBOTS_NO_SITEMAP", "robots.txt does not reference the sitemap.");
  return { ok: failures.length === 0, failures, notes, classes, totals: { sitemapUrls: urls.length, publicTools: a.tools.length, guides: a.guideTools.length }, guideSources };
}

function render(r) {
  const out = ["# Offline SEO artifact validation", "", "Generated by `scripts/validate-seo-offline.mjs` from `buildSeoArtifacts()`. **This validates what the build would publish. It did not fetch the live site, so it says nothing about indexing, rendering, rich-result eligibility, rankings or AI citations.**", "",
    `Sitemap URLs: ${r.totals.sitemapUrls} (tool pages ${r.classes.tool}, guides ${r.classes.guide}, categories ${r.classes.category}, articles ${r.classes.article}, static ${r.classes.static}).`, "", "## Measurements", "", ...r.notes.map((n) => "- " + n), "", "## Result", "",
    r.ok ? "**PASS** — no structural failures." : `**FAIL** — ${r.failures.length} finding(s):`, ...r.failures.map((f) => `- \`${f.code}\` — ${f.message} (${f.count}${f.sample.length ? "; e.g. " + f.sample.map((s) => "`" + s + "`").join(", ") : ""})`), ""];
  return out.join("\n");
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const r = validate(); const text = render(r);
  if (process.argv.includes("--check")) {
    if (!fs.existsSync(reportPath) || fs.readFileSync(reportPath, "utf8") !== text) { console.error("STALE: SEO-OFFLINE-VALIDATION.md"); process.exit(1); }
  } else fs.writeFileSync(reportPath, text);
  console.log(text);
  if (!r.ok) process.exitCode = 1;
}
