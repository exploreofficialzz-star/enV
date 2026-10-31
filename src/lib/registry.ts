import { tools as catalogTools } from "@/data/catalog";
import { CATEGORY_MAP } from "@/data/categories";
import type { CategoryId, ToolMeta } from "@/types/tool";
import { makeAccessibilityStudioTools, studioToolForLegacy } from "@/lib/accessibility-studios";
import { makeDeveloperStudioTools } from "@/lib/developer-studios-catalog";
import { DATETIME_TOOL_EXTENSIONS } from "@/lib/datetime/catalog-tools";

const musicDownloaderTool: ToolMeta = {
  id: "music-downloader",
  name: "Music Downloader",
  slug: "music-downloader",
  description: "Download authorized tracks from supported public song, album and playlist pages or direct audio files, and organize music offline on your device.",
  category: "audio",
  subcategory: "Music",
  keywords: ["music", "downloader", "download", "offline", "online", "song", "track", "album", "playlist", "mp3", "audio file"],
  tags: ["music", "download", "album", "playlist", "offline", "online", "audio"],
  icon: "Download",
  popularity: 10000,
  featured: true,
  clientSide: true,
  requiresBackend: false,
  requiresAuth: false,
  status: "active",
  related: ["audio-file-inspector", "music-studio", "audio-to-wav"],
  engine: { type: "custom", id: "music-downloader" },
  isNew: true,
};


const songMetadataAnalyzerTool: ToolMeta = {
  id: "song-metadata-analyzer",
  name: "AI Music Data Sandbox",
  slug: "ai-music-data-sandbox",
  description: "Organize, tag and prepare music for training, right on your device.",
  category: "audio",
  subcategory: "Music",
  keywords: ["ai", "data", "sandbox", "dataset", "training", "folders", "drafts", "lyrics", "song", "music", "metadata", "analyzer", "analyser", "bpm", "tempo", "key", "genre", "mood", "instruments", "vocals", "batch", "zip", "afrobeats", "afro-pop"],
  tags: ["song", "music", "metadata", "analysis", "bpm", "key", "genre", "mood", "batch", "audio"],
  icon: "AudioLines",
  iconBackground: "#171717",
  iconAccent: "#ffffff",
  popularity: 9900,
  featured: true,
  clientSide: true,
  requiresBackend: false,
  requiresAuth: false,
  status: "active",
  related: ["audio-file-inspector", "music-studio", "music-downloader"],
  engine: { type: "custom", id: "song-metadata-analyzer" },
  isNew: true,
};

const designHexColorConverterTool: ToolMeta = {
  id: "hex-color-converter",
  name: "HEX Color Converter",
  slug: "hex-color-converter",
  description: "Convert HEX to RGB, HSL, and HSV with live output in the other supported color formats.",
  category: "design",
  keywords: ["hex", "color", "converter", "rgb", "hsl", "hsv", "hsb", "cmyk"],
  tags: ["hex", "color", "converter", "rgb"],
  icon: "Palette",
  popularity: 86,
  featured: false,
  clientSide: true,
  requiresBackend: false,
  requiresAuth: false,
  status: "active",
  related: ["color-picker", "rgb-converter", "hsl-converter", "hsv-converter", "cmyk-converter", "palette-generator"],
  engine: { type: "color", op: "picker" },
};

const allTools: ToolMeta[] = [
  // Web aliases share the sandbox; the source catalogue also serves native apps,
  // whose independent analyzer screens retain their existing descriptions.
  ...catalogTools.map((tool) => tool.id === songMetadataAnalyzerTool.id
    ? songMetadataAnalyzerTool
    : tool.id === "audio-analyze-studio"
      ? { ...tool, name: songMetadataAnalyzerTool.name, description: songMetadataAnalyzerTool.description, keywords: [...tool.keywords, "dataset", "sandbox", "drafts", "folders"] }
      : tool),
  ...(!catalogTools.some((tool) => tool.id === designHexColorConverterTool.id) ? [designHexColorConverterTool] : []),
  ...DATETIME_TOOL_EXTENSIONS.filter((extension) => !catalogTools.some((tool) => tool.id === extension.id)),
  ...(!catalogTools.some((tool) => tool.id === musicDownloaderTool.id) ? [musicDownloaderTool] : []),
  ...(!catalogTools.some((tool) => tool.id === songMetadataAnalyzerTool.id) ? [songMetadataAnalyzerTool] : []),
];

const byId = new Map(allTools.map((t) => [t.id, t]));
const accessibilityStudios = makeAccessibilityStudioTools(allTools);
const developerStudios = makeDeveloperStudioTools(allTools);
const virtualStudios = [...accessibilityStudios, ...developerStudios];
const byPath = new Map<string, ToolMeta>([
  ...allTools.map((t) => [`${t.category}/${t.slug}`, t] as const),
  ...virtualStudios.map((t) => [`${t.category}/${t.slug}`, t] as const),
]);
const byVirtualId = new Map(virtualStudios.map((tool) => [tool.id, tool] as const));
// The old audio-analyze-studio URL remains usable, but its shared sandbox is
// presented once in discovery and related-tool lists.
const isDiscoverable = (tool: ToolMeta) => tool.id !== "audio-analyze-studio";
const searchableTools = [...allTools.filter((tool) => tool.category !== "accessibility" && isDiscoverable(tool)), ...virtualStudios];

export function getAllTools(): ToolMeta[] {
  return allTools;
}

/** Public discovery hides generated accessibility action variants, without deleting their routes or source records. */
export function getSearchableTools(): ToolMeta[] {
  return searchableTools;
}

export function getActiveTools(): ToolMeta[] {
  return getSearchableTools().filter((t) => t.status === "active" || t.status === "beta");
}

export function getToolById(id: string): ToolMeta | undefined {
  if (id === "audio-analyze-studio") return songMetadataAnalyzerTool;
  const virtual = byVirtualId.get(id);
  if (virtual) return virtual;
  const tool = byId.get(id);
  return tool?.category === "accessibility" ? studioToolForLegacy(tool, allTools) : tool;
}

export function getToolByPath(category: string, slug: string): ToolMeta | undefined {
  if (category === "audio" && ["song-metadata-analyzer", "audio-analyze-studio", "ai-music-data-sandbox"].includes(slug)) return songMetadataAnalyzerTool;
  return byPath.get(`${category}/${slug}`);
}

function alphabeticalKey(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function getToolsByCategory(category: CategoryId): ToolMeta[] {
  // Developer tools stay in the full searchable catalog, but category discovery
  // presents only the thirteen Studio workspaces. Legacy tool URLs remain routable.
  const items = category === "accessibility"
    ? accessibilityStudios
    : category === "developer"
      ? developerStudios
      : allTools.filter((t) => t.category === category && isDiscoverable(t));
  return items.slice().sort((a, b) => {
    // Keep the thirteen workspace entry points first. The original long-tail list
    // follows alphabetically, so every existing catalog URL remains discoverable.
    if (category === "developer") {
      const aStudio = a.tags.includes("developer-studio");
      const bStudio = b.tags.includes("developer-studio");
      if (aStudio !== bStudio) return aStudio ? -1 : 1;
      if (aStudio && bStudio) return b.popularity - a.popularity || a.id.localeCompare(b.id);
    }
    return alphabeticalKey(a.name).localeCompare(alphabeticalKey(b.name)) || a.id.localeCompare(b.id);
  });
}

export function getFeaturedTools(limit = 8): ToolMeta[] {
  return getSearchableTools().filter((t) => t.status === "active" || t.status === "beta")
    .filter((t) => t.featured)
    .sort((a, b) => b.popularity - a.popularity)
    .slice(0, limit);
}

export function getPopularTools(limit = 12): ToolMeta[] {
  return getSearchableTools().filter((t) => t.status === "active" || t.status === "beta")
    .slice()
    .sort((a, b) => b.popularity - a.popularity)
    .slice(0, limit);
}

export function getNewTools(limit = 8): ToolMeta[] {
  return getActiveTools()
    .filter((t) => t.isNew)
    .sort((a, b) => b.popularity - a.popularity)
    .slice(0, limit);
}

export function getRelatedTools(tool: ToolMeta, limit = 6): ToolMeta[] {
  if (tool.category === "accessibility") {
    return accessibilityStudios.filter((item) => item.id !== tool.id).slice(0, limit);
  }
  const related = tool.related
    .map((id) => byId.get(id))
    .filter((t): t is ToolMeta => Boolean(t && isDiscoverable(t) && t.status !== "planned"));
  if (related.length >= limit) return related.slice(0, limit);
  const seen = new Set([tool.id, ...related.map((t) => t.id)]);
  const rest = getToolsByCategory(tool.category).filter(
    (t) => !seen.has(t.id) && t.status !== "planned",
  );
  return [...related, ...rest].slice(0, limit);
}

export function activeCount(): number {
  return allTools.filter((t) => t.status === "active" || t.status === "beta").length;
}

export function plannedCount(): number {
  return allTools.filter((t) => t.status === "planned").length;
}

export function totalToolCount(): number {
  return allTools.length;
}

export function categoryLabel(id: CategoryId): string {
  return CATEGORY_MAP[id]?.name ?? id;
}

export function toolPath(tool: ToolMeta): string {
  return `/tools/${tool.category}/${tool.slug}`;
}
