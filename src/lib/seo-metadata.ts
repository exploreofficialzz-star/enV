import type { CategoryId, ToolMeta } from "@/types/tool";
import { CATEGORY_MAP } from "@/data/categories";
import { isToolUnderProduction } from "@/lib/production-notice";
import { toolDocumentationSummary } from "@/lib/tool-documentation";
import { developerStudioForLegacySlug } from "@/lib/developer-studios-catalog";

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
  const description = cleanMetaDescription(options.description);
  const type = options.type ?? "website";
  return {
    meta: [
      { title: options.title },
      { name: "description", content: description },
      { name: "robots", content: options.robots ?? "index,follow,max-image-preview:large,max-snippet:-1,max-video-preview:-1" },
      { property: "og:type", content: type },
      { property: "og:site_name", content: "enV Digital Toolkit" },
      { property: "og:title", content: options.title },
      { property: "og:description", content: description },
      { property: "og:url", content: url },
      { property: "og:image", content: image },
      { property: "og:image:alt", content: "enV digital toolkit" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:site", content: "@envtoolz" },
      { name: "twitter:title", content: options.title },
      { name: "twitter:description", content: description },
      { name: "twitter:image", content: image },
    ],
    links: [{ rel: "canonical", href: url }],
    scripts: options.structuredData
      ? [{ type: "application/ld+json", children: JSON.stringify(options.structuredData) }]
      : [],
  };
}

export function organizationSchema() {
  return {
    "@type": "Organization",
    name: "chAs Technologies LLC",
    legalName: "chAs Technologies LLC",
    description: "The company behind enV, a cross-device digital toolkit for practical online tools, calculators, converters, developer utilities, media workflows, and productivity.",
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
      alternateName: "enV Digital Toolkit",
      description: "A cross-device digital toolkit for practical online tools, calculators, converters, developer utilities, creator and media workflows, and everyday productivity.",
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
        name: "enV Digital Toolkit",
        alternateName: ["enV", "enV by chAs Technologies LLC"],
        description: "Practical online tools, calculators, converters, developer utilities, creator and media workflows, and productivity tools across Web, Android, and iOS.",
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

export function toolSeoDescription(tool: ToolMeta): string {
  return cleanMetaDescription(toolDocumentationSummary(tool), 160);
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

export function toolGuideSeoTitle(tool: ToolMeta, peers: readonly ToolMeta[] = [tool]): string {
  const baseTitle = boundedToolSeoTitle(tool.name, " documentation | enV");
  const collisions = peers
    .filter((candidate) => boundedToolSeoTitle(candidate.name, " documentation | enV") === baseTitle)
    .slice()
    .sort((a, b) => canonicalToolPath(a).localeCompare(canonicalToolPath(b)) || a.id.localeCompare(b.id));
  if (collisions.length <= 1) return baseTitle;
  const position = collisions.findIndex((candidate) => candidate.id === tool.id) + 1;
  return boundedSeoTitle(tool.name, " (" + position + "/" + collisions.length + ") documentation | enV");
}

export function canonicalToolPath(tool: ToolMeta): string {
  if (tool.category === "developer" && !tool.tags.includes("developer-studio")) {
    const studio = developerStudioForLegacySlug(tool.slug);
    return "/tools/developer/" + studio.slug;
  }
  return "/tools/" + tool.category + "/" + tool.slug;
}

export function canonicalToolName(tool: ToolMeta): string {
  if (tool.category === "developer" && !tool.tags.includes("developer-studio")) {
    return developerStudioForLegacySlug(tool.slug).name;
  }
  return tool.name;
}

export function toolSeoTitle(tool: ToolMeta, peers: readonly ToolMeta[] = [tool]): string {
  const baseTitle = boundedToolSeoTitle(tool.name, " Online | enV");
  const collisions = peers
    .filter((candidate) => boundedToolSeoTitle(candidate.name, " Online | enV") === baseTitle)
    .slice()
    .sort((a, b) => canonicalToolPath(a).localeCompare(canonicalToolPath(b)) || a.id.localeCompare(b.id));
  if (collisions.length <= 1) return baseTitle;
  const position = collisions.findIndex((candidate) => candidate.id === tool.id) + 1;
  return boundedSeoTitle(tool.name, " (" + position + "/" + collisions.length + ") | enV");
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
  return (tool.status === "active" || tool.status === "beta") && !isToolUnderProduction(tool);
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

