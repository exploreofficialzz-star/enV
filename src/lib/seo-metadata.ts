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
      ...webmasterVerificationMeta(),
      { title: options.title },
      { name: "description", content: description },
      { name: "robots", content: options.robots ?? "index,follow,max-image-preview:large,max-snippet:-1,max-video-preview:-1" },
      { property: "og:type", content: type },
      { property: "og:site_name", content: "enV" },
      { property: "og:title", content: options.title },
      { property: "og:description", content: description },
      { property: "og:url", content: url },
      { property: "og:image", content: image },
      { property: "og:image:alt", content: "enV digital toolkit" },
      { name: "twitter:card", content: "summary_large_image" },
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
        alternateName: "enV digital toolkit",
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

export function toolGuideSeoTitle(tool: ToolMeta): string {
  const suffix = " documentation | enV";
  const maxTitleLength = 65;
  const rawName = tool.name.trim();
  const maxNameLength = maxTitleLength - suffix.length;
  const displayName = rawName.length > maxNameLength
    ? rawName.slice(0, maxNameLength - 1).trimEnd() + "…"
    : rawName;
  return displayName + suffix;
}

export function canonicalToolPath(tool: ToolMeta): string {
  if (tool.category === "developer" && !tool.tags.includes("developer-studio")) {
    const studio = developerStudioForLegacySlug(tool.slug);
    return "/tools/developer/" + studio.slug;
  }
  return "/tools/" + tool.category + "/" + tool.slug;
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
        name: tool.name,
        url: absoluteSiteUrl("/tools/" + tool.category + "/" + tool.slug),
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
      name: tool.name,
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

export function toolSeoTitle(tool: ToolMeta): string {
  const category = CATEGORY_MAP[tool.category as CategoryId]?.name ?? tool.category;
  const suffix = " | " + category + " Tool | enV";
  const maxTitleLength = 65;
  const rawName = tool.name.trim();
  const maxNameLength = Math.max(20, maxTitleLength - suffix.length);
  const displayName = rawName.length > maxNameLength
    ? rawName.slice(0, maxNameLength - 1).trimEnd() + "…"
    : rawName;
  return displayName + suffix;
}
