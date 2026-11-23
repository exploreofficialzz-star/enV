import type { CategoryId, ToolMeta } from "@/types/tool";
import { CATEGORY_MAP } from "@/data/categories";
import { isToolUnderProduction } from "@/lib/production-notice";
import { toolDocumentationSummary } from "@/lib/tool-documentation";
import { developerStudioForLegacySlug } from "@/lib/developer-studios-catalog";
import { ACCESSIBILITY_STUDIOS } from "@/lib/accessibility-studios";
import { isGenericWorkflowPlaceholder } from "@/lib/generic-workflow-policy.mjs";

export const SITE_ORIGIN = "https://envtools.store";
export const DEFAULT_SOCIAL_IMAGE = SITE_ORIGIN + "/og.jpg";

export function absoluteSiteUrl(path: string): string {
  const normalized = path.startsWith("/") ? path : "/" + path;
  return SITE_ORIGIN + normalized;
}

export function cleanMetaDescription(value: string, maxLength = 160): string {
  const normalized = value.replace(/\s+/g, " ").trim();
  if (normalized.length <= maxLength) return normalized;
  const shortened = normalized.slice(0, maxLength - 1);
  const lastSpace = shortened.lastIndexOf(" ");
  return (lastSpace > Math.floor(maxLength * 0.7) ? shortened.slice(0, lastSpace) : shortened).trimEnd() + "…";
}

export type SeoPageOptions = {
  title: string;
  description: string;
  path: string;
  image?: string;
  imageAlt?: string;
  imageWidth?: number;
  imageHeight?: number;
  type?: "website" | "article";
  robots?: string;
  structuredData?: Record<string, unknown>;
};

export function webmasterVerificationMeta() {
  const google = import.meta.env.VITE_GOOGLE_SITE_VERIFICATION?.trim() ?? "";
  const bing = import.meta.env.VITE_BING_SITE_VERIFICATION?.trim() ?? "";
  return [
    ...(google ? [{ name: "google-site-verification", content: google }] : []),
    ...(bing ? [{ name: "msvalidate.01", content: bing }] : []),
  ];
}

export function seoPageHead(options: SeoPageOptions) {
  const url = absoluteSiteUrl(options.path);
  const image = options.image ?? DEFAULT_SOCIAL_IMAGE;
  const imageAlt = options.imageAlt?.trim() || "enV practical tools and product information preview";
  const description = cleanMetaDescription(options.description);
  const type = options.type ?? "website";
  // Structured data can include public user-generated content (e.g. comments).
  // Escape HTML-significant characters and JavaScript line separators so content
  // cannot terminate the JSON-LD script element when the HTML is rendered.
  const structuredDataJson = options.structuredData
    ? JSON.stringify(options.structuredData)
        .replace(/</g, "\\u003c")
        .replace(/>/g, "\\u003e")
        .replace(/&/g, "\\u0026")
        .replace(/\u2028/g, "\\u2028")
        .replace(/\u2029/g, "\\u2029")
    : null;
  return {
    meta: [
      { title: options.title },
      { name: "description", content: description },
      { name: "robots", content: options.robots ?? "index,follow,max-image-preview:large,max-snippet:-1,max-video-preview:-1" },
      { property: "og:type", content: type },
      { property: "og:site_name", content: "enV" },
      { property: "og:title", content: options.title },
      { property: "og:description", content: description },
      { property: "og:url", content: url },
      { property: "og:image", content: image },
      { property: "og:image:alt", content: imageAlt },
      ...(options.imageWidth && options.imageHeight ? [
        { property: "og:image:width", content: String(options.imageWidth) },
        { property: "og:image:height", content: String(options.imageHeight) },
      ] : []),
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:site", content: "@envtoolz" },
      { name: "twitter:title", content: options.title },
      { name: "twitter:description", content: description },
      { name: "twitter:image", content: image },
      { name: "twitter:image:alt", content: imageAlt },
    ],
    links: [{ rel: "canonical", href: url }],
    scripts: structuredDataJson
      ? [{ type: "application/ld+json", children: structuredDataJson }]
      : [],
  };
}

export function organizationSchema() {
  return {
    "@type": "Organization",
    name: "chAs Technologies LLC",
    legalName: "chAs Technologies LLC",
    description: "chAs Technologies LLC develops and operates enV.",
    url: SITE_ORIGIN,
    logo: absoluteSiteUrl("/chas-technologies-logo-transparent.webp"),
    sameAs: [
      "https://x.com/chAstechllc",
      "https://www.instagram.com/chastechnologiesllc/",
      "https://www.tiktok.com/@chastechnologiesllc",
      "https://www.linkedin.com/in/chas-technologies-llc",
      "https://www.youtube.com/@chAsTechnologiesLLC",
      "https://whatsapp.com/channel/0029Vb8F1WH0QeacnxL5sN2L",
    ],
    brand: {
      "@type": "Brand",
      name: "enV",
 
      description: "enV provides practical tools for calculations, conversions, creative work, development, media and everyday tasks.",
      url: SITE_ORIGIN,
      sameAs: [
        "https://x.com/envtoolz",
        "https://www.instagram.com/envtools.store/",
        "https://www.tiktok.com/@envtools.store",
        "https://www.youtube.com/@envtoolz",
      ],
    },
  };
}

export function websiteSchema() {
  return {
    "@context": "https://schema.org",
    "@graph": [
      organizationSchema(),
      {
        "@type": "WebSite",
        name: "enV",
 
        description: "Find practical tools for calculations, conversions, creative work, development, media and everyday tasks across Web, Android and iOS.",
        url: SITE_ORIGIN,
        inLanguage: "en",
        publisher: organizationSchema(),
        potentialAction: {
          "@type": "SearchAction",
          target: SITE_ORIGIN + "/search?q={search_term_string}",
          "query-input": "required name=search_term_string",
        },
      },
    ],
  };
}

function withBreadcrumbs(entity: Record<string, unknown>, crumbs: Array<{ name: string; path: string }>) {
  return {
    "@context": "https://schema.org",
    "@graph": [
      entity,
      {
        "@type": "BreadcrumbList",
        itemListElement: crumbs.map((crumb, index) => ({
          "@type": "ListItem",
          position: index + 1,
          name: crumb.name,
          item: absoluteSiteUrl(crumb.path),
        })),
      },
    ],
  };
}

export function pageSchema(name: string, description: string, path: string, type = "WebPage") {
  return withBreadcrumbs({
    "@type": type,
    name,
    description: cleanMetaDescription(description, 300),
    url: absoluteSiteUrl(path),
    isPartOf: { "@type": "WebSite", name: "enV", url: SITE_ORIGIN },
    publisher: organizationSchema(),
    inLanguage: "en",
  }, path === "/"
    ? [{ name, path }]
    : [{ name: "Home", path: "/" }, { name, path }]);
}

export function toolSearchIntentTerms(tool: ToolMeta): string[] {
  const category = CATEGORY_MAP[tool.category as CategoryId]?.name ?? tool.category;
  return [...new Set([
    tool.name,
    tool.name + " online",
    category + " tool",
    ...tool.keywords,
    ...tool.tags,
  ].map((value) => value.replace(/\s+/g, " ").trim()).filter(Boolean))].slice(0, 24);
}

type SeoCollisionKey = (tool: ToolMeta) => string;
type SeoCollisionIndex = Map<string, Map<string, number>>;

// Peer lists are immutable after construction during SEO generation. Cache one
// deterministic collision index per peer-list/key-function pair so rendering
// thousands of public pages does not rescan the complete tool catalogue per page.
const seoCollisionIndexes = new WeakMap<readonly ToolMeta[], Map<SeoCollisionKey, SeoCollisionIndex>>();

function seoCollisionIndex(peers: readonly ToolMeta[], keyFor: SeoCollisionKey): SeoCollisionIndex {
  let indexesByKey = seoCollisionIndexes.get(peers);
  if (!indexesByKey) {
    indexesByKey = new Map();
    seoCollisionIndexes.set(peers, indexesByKey);
  }
  const cached = indexesByKey.get(keyFor);
  if (cached) return cached;

  const groups = new Map<string, ToolMeta[]>();
  for (const candidate of peers) {
    const key = keyFor(candidate);
    const group = groups.get(key);
    if (group) group.push(candidate);
    else groups.set(key, [candidate]);
  }

  const index: SeoCollisionIndex = new Map();
  for (const [key, group] of groups) {
    group.sort((a, b) => canonicalToolPath(a).localeCompare(canonicalToolPath(b)) || a.id.localeCompare(b.id));
    const positions = new Map<string, number>();
    group.forEach((candidate, position) => positions.set(candidate.id, position + 1));
    index.set(key, positions);
  }
  indexesByKey.set(keyFor, index);
  return index;
}

function compactSeoDescriptionId(id: string): string {
  if (id.length <= 88) return id;

  // Keep unusually long stable IDs distinct without allowing them to consume
  // the entire search snippet. Two independent 32-bit rolling hashes provide a
  // compact, deterministic suffix; the canonical URL still retains the full ID.
  let firstHash = 2166136261;
  let secondHash = 0x9e3779b9;
  for (let index = 0; index < id.length; index += 1) {
    const character = id.charCodeAt(index);
    firstHash = Math.imul(firstHash ^ character, 16777619) >>> 0;
    secondHash = Math.imul(secondHash ^ character, 2246822519) >>> 0;
  }
  const suffix = "-" + firstHash.toString(36) + secondHash.toString(36);
  return id.slice(0, 88 - suffix.length) + suffix;
}

function uniqueToolDescription(base: string, tool: ToolMeta, peers: readonly ToolMeta[], baseFor: (candidate: ToolMeta) => string): string {
  const collisions = seoCollisionIndex(peers, baseFor).get(base);
  if (!collisions || collisions.size <= 1) return base;

  // Generated catalogue records can share the same engine-family summary and even
  // the same display name. Keep the visible task first, then add a compact stable
  // ID only for colliding pages so every canonical URL has its own accurate description.
  const task = String(tool.description ?? "").replace(/\s+/g, " ").trim()
    || tool.engine.type + ("op" in tool.engine ? " " + String(tool.engine.op) : "");
  const descriptionId = compactSeoDescriptionId(tool.id);
  const taskBudget = Math.max(1, 160 - 45 - " · Task: ".length - " · ".length - descriptionId.length);
  const taskSummary = cleanMetaDescription(task || tool.name, Math.min(38, taskBudget));
  const discriminator = " · Task: " + taskSummary + " · " + descriptionId;
  const baseBudget = 160 - discriminator.length;
  return cleanMetaDescription(base, baseBudget) + discriminator;
}

function toolSeoDescriptionBase(tool: ToolMeta): string {
  return cleanMetaDescription(toolDocumentationSummary(tool), 160);
}

function toolGuideSeoDescriptionBase(tool: ToolMeta): string {
  return cleanMetaDescription("How to use " + tool.name + ": " + toolDocumentationSummary(tool), 160);
}

export function toolSeoDescription(tool: ToolMeta, peers: readonly ToolMeta[] = [tool]): string {
  const base = toolSeoDescriptionBase(tool);
  return uniqueToolDescription(base, tool, peers, toolSeoDescriptionBase);
}

export function toolGuideSeoDescription(tool: ToolMeta, peers: readonly ToolMeta[] = [tool]): string {
  const base = toolGuideSeoDescriptionBase(tool);
  return uniqueToolDescription(base, tool, peers, toolGuideSeoDescriptionBase);
}

function boundedSeoTitle(name: string, suffix: string, maxTitleLength = 65): string {
  const rawName = name.trim();
  const maxNameLength = Math.max(12, maxTitleLength - suffix.length);
  const displayName = rawName.length > maxNameLength
    ? rawName.slice(0, maxNameLength - 1).trimEnd() + "…"
    : rawName;
  return displayName + suffix;
}

export function articleSeoTitle(title: string): string {
  return boundedSeoTitle(title, " | enV");
}

export function categorySeoTitle(name: string): string {
  return boundedSeoTitle(name, " | enV");
}

export function boundedToolSeoTitle(name: string, suffix: string, maxTitleLength = 65): string {
  const rawName = name.trim();
  // Generated formula tools carry the important differentiator after "Solve for".
  // Preserve that semantic target at the end instead of truncating it away.
  const solveFor = rawName.match(/^(.*?)(\s+[—–-]\s+Solve for\s+.+)$/i);
  if (solveFor) {
    const prefix = solveFor[1].trim();
    const differentiator = solveFor[2].trimStart();
    const prefixBudget = maxTitleLength - suffix.length - differentiator.length - 1;
    if (prefixBudget >= 12) {
      const shortPrefix = prefix.length > prefixBudget
        ? prefix.slice(0, prefixBudget - 1).trimEnd() + "…"
        : prefix;
      return shortPrefix + " " + differentiator + suffix;
    }
  }
  return boundedSeoTitle(rawName, suffix, maxTitleLength);
}

function toolGuideSeoSuffix(tool: ToolMeta): string {
  // Formula guides must keep the distinct "Solve for" target visible. The
  // shorter suffix leaves room for both the tool identity and that target.
  return /[—–-]\s*Solve for\s+/i.test(tool.name) ? " guide | enV" : " documentation | enV";
}

function toolGuideSeoTitleBase(candidate: ToolMeta): string {
  return boundedToolSeoTitle(candidate.name, toolGuideSeoSuffix(candidate));
}

export function toolGuideSeoTitle(tool: ToolMeta, peers: readonly ToolMeta[] = [tool]): string {
  const suffix = toolGuideSeoSuffix(tool);
  const baseTitle = toolGuideSeoTitleBase(tool);
  const collisions = seoCollisionIndex(peers, toolGuideSeoTitleBase).get(baseTitle);
  if (!collisions || collisions.size <= 1) return baseTitle;
  const position = collisions.get(tool.id) ?? 0;
  return boundedToolSeoTitle(tool.name, " (" + position + "/" + collisions.size + ")" + suffix);
}

export function canonicalToolPath(tool: ToolMeta): string {
  const accessibilityStudio = ACCESSIBILITY_STUDIOS.find((studio) => studio.id === tool.id);
  if (accessibilityStudio && (tool.category !== "accessibility" || tool.slug !== accessibilityStudio.slug)) {
    return "/tools/accessibility/" + accessibilityStudio.slug;
  }
  if (tool.category === "developer" && !tool.tags.includes("developer-studio")) {
    const studio = developerStudioForLegacySlug(tool.slug);
    return "/tools/developer/" + studio.slug;
  }
  return "/tools/" + tool.category + "/" + tool.slug;
}

export function canonicalToolName(tool: ToolMeta): string {
  const accessibilityStudio = ACCESSIBILITY_STUDIOS.find((studio) => studio.id === tool.id);
  if (accessibilityStudio && (tool.category !== "accessibility" || tool.slug !== accessibilityStudio.slug)) {
    return accessibilityStudio.name;
  }
  if (tool.category === "developer" && !tool.tags.includes("developer-studio")) {
    return developerStudioForLegacySlug(tool.slug).name;
  }
  return tool.name;
}

function toolSeoTitleBase(candidate: ToolMeta): string {
  return boundedToolSeoTitle(candidate.name, " Online | enV");
}

export function toolSeoTitle(tool: ToolMeta, peers: readonly ToolMeta[] = [tool]): string {
  const baseTitle = toolSeoTitleBase(tool);
  const collisions = seoCollisionIndex(peers, toolSeoTitleBase).get(baseTitle);
  if (!collisions || collisions.size <= 1) return baseTitle;
  const position = collisions.get(tool.id) ?? 0;
  return boundedToolSeoTitle(tool.name, " (" + position + "/" + collisions.size + ") | enV");
}

export function toolSchema(tool: ToolMeta) {
  const category = CATEGORY_MAP[tool.category as CategoryId];
  const path = canonicalToolPath(tool);
  return withBreadcrumbs({
    "@type": "SoftwareApplication",
    name: tool.name,
    description: tool.description,
    applicationCategory: category?.name ?? tool.category,
    applicationSubCategory: category?.name ?? tool.category,
    keywords: toolSearchIntentTerms(tool).join(", "),
    operatingSystem: "Any modern web browser",
    url: absoluteSiteUrl(path),
    isPartOf: { "@type": "WebSite", name: "enV", url: SITE_ORIGIN },
    provider: organizationSchema(),
  }, [
    { name: "Home", path: "/" },
    { name: "Tools", path: "/tools" },
    { name: category?.name ?? tool.category, path: "/tools/" + tool.category },
    { name: tool.name, path },
  ]);
}

export function categorySchema(name: string, description: string, path: string, tools: readonly ToolMeta[]) {
  return withBreadcrumbs({
    "@type": "CollectionPage",
    name,
    description: cleanMetaDescription(description, 300),
    url: absoluteSiteUrl(path),
    isPartOf: { "@type": "WebSite", name: "enV", url: SITE_ORIGIN },
    mainEntity: {
      "@type": "ItemList",
      itemListElement: tools.map((tool, index) => ({
        "@type": "ListItem",
        position: index + 1,
        name: canonicalToolName(tool),
        url: absoluteSiteUrl(canonicalToolPath(tool)),
      })),
    },
  }, [
    { name: "Home", path: "/" },
    { name: "Tools", path: "/tools" },
    { name, path },
  ]);
}

export function articleSchema(title: string, description: string, path: string, articleSection?: string) {
  return withBreadcrumbs({
    "@type": "Article",
    headline: title,
    description: cleanMetaDescription(description, 300),
    mainEntityOfPage: absoluteSiteUrl(path),
    articleSection: articleSection ?? "enV Guides",
    publisher: organizationSchema(),
    inLanguage: "en",
  }, [
    { name: "Home", path: "/" },
    { name: "Blogs & Guides", path: "/blog" },
    { name: title, path },
  ]);
}

export function technicalArticleSchema(tool: ToolMeta, description: string, path: string) {
  return withBreadcrumbs({
    "@type": "TechArticle",
    headline: tool.name + ": documentation and usage guide",
    description: cleanMetaDescription(description, 300),
    about: {
      "@type": "SoftwareApplication",
      name: canonicalToolName(tool),
      url: absoluteSiteUrl(canonicalToolPath(tool)),
      keywords: toolSearchIntentTerms(tool).join(", "),
    },
    mainEntityOfPage: absoluteSiteUrl(path),
    publisher: organizationSchema(),
    inLanguage: "en",
  }, [
    { name: "Home", path: "/" },
    { name: "Blogs & Guides", path: "/blog" },
    { name: tool.name + " guide", path },
  ]);
}

export function isIndexableTool(tool: ToolMeta): boolean {
  // The old Artboard route is a retired label; World Lab is not yet a production SEO landing page.
  if (tool.id === "artboard-studio" || tool.slug === "artboard-studio") return false;
  return !isGenericWorkflowPlaceholder(tool)
    && (tool.status === "active" || tool.status === "beta")
    && !isToolUnderProduction(tool);
}

function expansionSeoFingerprint(tool: ToolMeta): string | null {
  if (tool.engine.type !== "calculator") return null;
  const formula = tool.engine.formula ?? "";
  if (!/^exp-(product|sum|ratio)-/.test(formula)) return null;
  const normalize = (value: string) => value.replace(/\s+/g, " ").trim().toLocaleLowerCase();
  return [
    tool.category,
    tool.engine.type,
    normalize(tool.name),
    normalize(tool.description),
  ].join("|");
}

function isGenericExpansionPlaceholder(tool: ToolMeta): boolean {
  return tool.engine.type === "calculator"
    && /^exp-product-general-product-relation-\d+-[abc]$/.test(tool.engine.formula ?? "");
}

function expansionCanonicalPriority(tool: ToolMeta): number {
  if (tool.engine.type !== "calculator") return 99;
  const familyKey = (tool.engine.formula ?? "").replace(/^exp-(product|sum|ratio)-/, "");
  const prefix = familyKey.split("-")[0];
  const priorities: Record<string, number> = {
    math: 0,
    science: 1,
    engineering: 2,
    business: 3,
    advanced: 4,
    applied: 5,
    technical: 6,
    core: 7,
  };
  return priorities[prefix] ?? 20;
}

/**
 * Return one public SEO page per distinct generated equation. The underlying
 * catalog entries remain available in the app; only pages with identical
 * equation labels and descriptions are consolidated for search indexing.
 * Generic Input A/Input B placeholders are not useful standalone search pages.
 */
export function canonicalSeoTools(tools: readonly ToolMeta[]): ToolMeta[] {
  const uniqueById = new Map(tools.map((tool) => [tool.id, tool]));
  const candidates = [...uniqueById.values()]
    .filter(isIndexableTool)
    .filter((tool) => !isGenericExpansionPlaceholder(tool));
  const expansionWinners = new Map<string, ToolMeta>();

  for (const tool of candidates) {
    const fingerprint = expansionSeoFingerprint(tool);
    if (!fingerprint) continue;
    const current = expansionWinners.get(fingerprint);
    if (!current) {
      expansionWinners.set(fingerprint, tool);
      continue;
    }
    const priority = expansionCanonicalPriority(tool);
    const currentPriority = expansionCanonicalPriority(current);
    if (priority < currentPriority || (priority === currentPriority && tool.id.localeCompare(current.id) < 0)) {
      expansionWinners.set(fingerprint, tool);
    }
  }

  return candidates.filter((tool) => {
    const fingerprint = expansionSeoFingerprint(tool);
    return !fingerprint || expansionWinners.get(fingerprint)?.id === tool.id;
  });
}

export function canonicalSeoToolFor(tool: ToolMeta, canonicalTools: readonly ToolMeta[]): ToolMeta | undefined {
  if (!isIndexableTool(tool) || isGenericExpansionPlaceholder(tool)) return undefined;
  const fingerprint = expansionSeoFingerprint(tool);
  if (!fingerprint) return canonicalTools.find((candidate) => candidate.id === tool.id);
  return canonicalTools.find((candidate) => expansionSeoFingerprint(candidate) === fingerprint);
}

