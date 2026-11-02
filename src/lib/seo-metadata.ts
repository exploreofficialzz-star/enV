import type { CategoryId, ToolMeta } from "@/types/tool";
import { CATEGORY_MAP } from "@/data/categories";
import { isToolUnderProduction } from "@/lib/production-notice";
import { toolDocumentationSummary } from "@/lib/tool-documentation";

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
    brand: { "@type": "Brand", name: "enV", url: SITE_ORIGIN },
  };
}

export function pageSchema(name: string, description: string, path: string, type = "WebPage") {
  return {
    "@context": "https://schema.org",
    "@type": type,
    name,
    description: cleanMetaDescription(description, 300),
    url: absoluteSiteUrl(path),
    isPartOf: { "@type": "WebSite", name: "enV", url: SITE_ORIGIN },
    publisher: organizationSchema(),
    inLanguage: "en",
  };
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

export function toolSchema(tool: ToolMeta) {
  const category = CATEGORY_MAP[tool.category as CategoryId];
  return {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: tool.name,
    description: tool.description,
    applicationCategory: category?.name ?? tool.category,
    applicationSubCategory: category?.name ?? tool.category,
    keywords: toolSearchIntentTerms(tool).join(", "),
    operatingSystem: "Any modern web browser",
    url: absoluteSiteUrl("/tools/" + tool.category + "/" + tool.slug),
    isPartOf: { "@type": "WebSite", name: "enV", url: SITE_ORIGIN },
    provider: organizationSchema(),
  };
}

export function categorySchema(name: string, description: string, path: string, tools: readonly ToolMeta[]) {
  return {
    "@context": "https://schema.org",
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
  };
}

export function articleSchema(title: string, description: string, path: string, articleSection?: string) {
  return {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: title,
    description: cleanMetaDescription(description, 300),
    mainEntityOfPage: absoluteSiteUrl(path),
    articleSection: articleSection ?? "enV Guides",
    publisher: organizationSchema(),
    inLanguage: "en",
  };
}

export function technicalArticleSchema(tool: ToolMeta, description: string, path: string) {
  return {
    "@context": "https://schema.org",
    "@type": "TechArticle",
    headline: tool.name + ": documentation and usage guide",
    description: cleanMetaDescription(description, 300),
    about: { "@type": "SoftwareApplication", name: tool.name, url: absoluteSiteUrl("/tools/" + tool.category + "/" + tool.slug) },
    mainEntityOfPage: absoluteSiteUrl(path),
    publisher: organizationSchema(),
    inLanguage: "en",
  };
}

export function isIndexableTool(tool: ToolMeta): boolean {
  return (tool.status === "active" || tool.status === "beta") && !isToolUnderProduction(tool);
}

export function toolSeoTitle(tool: ToolMeta): string {
  return tool.name.trim() + " Online | enV";
}
