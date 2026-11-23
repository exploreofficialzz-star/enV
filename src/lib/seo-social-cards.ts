import type { ToolMeta } from "@/types/tool";

export const SOCIAL_CARD_WIDTH = 1200;
export const SOCIAL_CARD_HEIGHT = 630;
const SITE_ORIGIN = "https://envtools.store";
const representativeToolIdsCache = new WeakMap<readonly ToolMeta[], ReadonlySet<string>>();

function representativeToolIds(tools: readonly ToolMeta[]): ReadonlySet<string> {
  const cached = representativeToolIdsCache.get(tools);
  if (cached) return cached;
  const ids = new Set(socialCardRepresentativeTools(tools).map((tool) => tool.id));
  representativeToolIdsCache.set(tools, ids);
  return ids;
}

export type SocialCardMetadata = {
  image: string;
  imageAlt: string;
  imageWidth: number;
  imageHeight: number;
};

export function socialCardRepresentativeTools(tools: readonly ToolMeta[]): ToolMeta[] {
  const winners = new Map<string, ToolMeta>();
  for (const tool of tools) {
    if (tool.status !== "active" && tool.status !== "beta") continue;
    const current = winners.get(tool.category);
    const isFeatured = Boolean(tool.featured);
    const currentIsFeatured = Boolean(current?.featured);
    if (
      !current ||
      Number(isFeatured) > Number(currentIsFeatured) ||
      (isFeatured === currentIsFeatured && (tool.popularity ?? 0) > (current.popularity ?? 0))
    ) {
      winners.set(tool.category, tool);
    }
  }
  return [...winners.values()].sort((a, b) =>
    a.category.localeCompare(b.category) || a.id.localeCompare(b.id),
  );
}

export function homepageSocialCard(): SocialCardMetadata {
  return {
    image: SITE_ORIGIN + "/og/cards/home.png",
    imageAlt: "enV homepage preview with the enV brand and tool discovery message",
    imageWidth: SOCIAL_CARD_WIDTH,
    imageHeight: SOCIAL_CARD_HEIGHT,
  };
}

export function categorySocialCard(categoryId: string, categoryName: string): SocialCardMetadata {
  return {
    image: SITE_ORIGIN + "/og/cards/categories/" + encodeURIComponent(categoryId) + ".png",
    imageAlt: "enV " + categoryName + " category preview",
    imageWidth: SOCIAL_CARD_WIDTH,
    imageHeight: SOCIAL_CARD_HEIGHT,
  };
}

export function toolSocialCard(
  tool: ToolMeta,
  canonicalTools: readonly ToolMeta[],
  kind: "tools" | "guides" = "tools",
): SocialCardMetadata {
  const isRepresentative = representativeToolIds(canonicalTools).has(tool.id);
  const imagePath = isRepresentative
    ? "/og/cards/" + kind + "/" + encodeURIComponent(tool.id) + ".png"
    : "/og/cards/categories/" + encodeURIComponent(tool.category) + ".png";
  return {
    image: SITE_ORIGIN + imagePath,
    imageAlt: isRepresentative
      ? (kind === "guides" ? "enV usage guide preview for " : "enV preview for ") + tool.name
      : "enV category preview for " + tool.category,
    imageWidth: SOCIAL_CARD_WIDTH,
    imageHeight: SOCIAL_CARD_HEIGHT,
  };
}

export function toolsIndexSocialCard(): SocialCardMetadata {
  return {
    image: SITE_ORIGIN + "/og/cards/tools-index.png",
    imageAlt: "enV tools index preview showing the platform's practical tool collection",
    imageWidth: SOCIAL_CARD_WIDTH,
    imageHeight: SOCIAL_CARD_HEIGHT,
  };
}

export function articleSocialCard(article: { slug: string; title: string }): SocialCardMetadata {
  return {
    image: SITE_ORIGIN + "/og/cards/articles/" + encodeURIComponent(article.slug) + ".png",
    imageAlt: "enV article preview for " + article.title,
    imageWidth: SOCIAL_CARD_WIDTH,
    imageHeight: SOCIAL_CARD_HEIGHT,
  };
}

export function blogIndexSocialCard(): SocialCardMetadata {
  return {
    image: SITE_ORIGIN + "/og/cards/blog-index.png",
    imageAlt: "enV Blogs and Guides preview for individual tool documentation and product articles",
    imageWidth: SOCIAL_CARD_WIDTH,
    imageHeight: SOCIAL_CARD_HEIGHT,
  };
}
