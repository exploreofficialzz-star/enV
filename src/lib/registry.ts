import { tools as rawCatalogTools } from "@/data/catalog";
import { refineGeneratedToolDescription } from "@/lib/generated-tool-copy.mjs";
import { CATEGORY_MAP } from "@/data/categories";
import type { CategoryId, ToolMeta } from "@/types/tool";
import { makeAccessibilityStudioTools, studioToolForLegacy } from "@/lib/accessibility-studios";
import { makeDeveloperStudioTools } from "@/lib/developer-studios-catalog";
import { presentGeneratedCalculator } from "@/lib/calc/generated-calculator-presentation";
import { DATETIME_TOOL_EXTENSIONS } from "@/lib/datetime/catalog-tools";

// Apply reviewed, task-specific descriptions to legacy generated catalogue rows
// before they reach category pages, search, tool details or SEO metadata.
const catalogTools: ToolMeta[] = rawCatalogTools.map((tool) => {
  const description = refineGeneratedToolDescription(tool);
  return description === tool.description ? tool : { ...tool, description };
});

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

const aBookTool: ToolMeta = {
  id: "a-book",
  name: "A book",
  slug: "a-book",
  description: "A private local notes and document workspace. Create notes, attach files, organize and search your writing, and process PDFs on this device.",
  category: "productivity",
  subcategory: "Notes & documents",
  keywords: ["a book", "notes", "notepad", "notebook", "local notes", "offline notes", "pdf", "document", "attachments", "markdown", "writing", "journal", "search", "folders", "tags"],
  tags: ["notes", "notebook", "documents", "pdf", "local", "offline", "productivity"],
  icon: "FileText",
  iconBackground: "#24354a",
  iconAccent: "#d6e7f5",
  popularity: 950,
  featured: true,
  clientSide: true,
  requiresBackend: false,
  requiresAuth: false,
  status: "active",
  related: ["pdf-merger", "pdf-splitter", "document-editor"],
  engine: { type: "custom", id: "a-book" },
  isNew: true,
};

const zipAnyFileTool: ToolMeta = {
  id: "zip-any-file",
  name: "Zip any file",
  slug: "zip-any-file",
  description: "Create ZIP archives from files or folders, or extract an archive.",
  category: "files",
  subcategory: "Archives & extraction",
  keywords: ["zip", "zipper", "compress", "compression", "archive", "extract", "unzip", "decompress", "zip64", "large files", "folder", "multiple files", "store", "share", "tar"],
  tags: ["zip", "archive", "compression", "extract", "offline", "local", "files"],
  icon: "Archive",
  popularity: 1450,
  featured: true,
  clientSide: true,
  requiresBackend: false,
  requiresAuth: false,
  status: "active",
  related: ["file-converter", "pdf-merger", "document-editor"],
  engine: { type: "custom", id: "zip-any-file" },
  isNew: true,
};

const retiredDesignBuildCalculatorIds = new Set([
  "math-exp-sum-math-design-build-delivery-effort-a",
  "math-exp-sum-math-design-build-delivery-effort-b",
  "math-exp-sum-math-design-build-delivery-effort-c",
  "math-exp-sum-engineering-design-build-delivery-effort-a",
  "math-exp-sum-engineering-design-build-delivery-effort-b",
  "math-exp-sum-engineering-design-build-delivery-effort-c",
  "math-exp-sum-business-design-build-delivery-effort-a",
  "math-exp-sum-business-design-build-delivery-effort-b",
  "math-exp-sum-business-design-build-delivery-effort-c",
  "math-exp-sum-science-sum-design-effort-build-effort-delivery-effort-33-a",
  "math-exp-sum-science-sum-design-effort-build-effort-delivery-effort-33-b",
  "math-exp-sum-science-sum-design-effort-build-effort-delivery-effort-33-c",
  "math-exp-sum-engineering-sum-design-effort-build-effort-delivery-effort-83-a",
  "math-exp-sum-engineering-sum-design-effort-build-effort-delivery-effort-83-b",
  "math-exp-sum-engineering-sum-design-effort-build-effort-delivery-effort-83-c",
  "math-exp-sum-core-sum-design-effort-build-effort-delivery-effort-133-a",
  "math-exp-sum-core-sum-design-effort-build-effort-delivery-effort-133-b",
  "math-exp-sum-core-sum-design-effort-build-effort-delivery-effort-133-c",
  "math-exp-sum-advanced-sum-design-effort-build-effort-delivery-effort-183-a",
  "math-exp-sum-advanced-sum-design-effort-build-effort-delivery-effort-183-b",
  "math-exp-sum-advanced-sum-design-effort-build-effort-delivery-effort-183-c",
  "math-exp-sum-applied-sum-design-effort-build-effort-delivery-effort-233-a",
  "math-exp-sum-applied-sum-design-effort-build-effort-delivery-effort-233-b",
  "math-exp-sum-applied-sum-design-effort-build-effort-delivery-effort-233-c",
  "math-exp-sum-technical-sum-design-effort-build-effort-delivery-effort-283-a",
  "math-exp-sum-technical-sum-design-effort-build-effort-delivery-effort-283-b",
  "math-exp-sum-technical-sum-design-effort-build-effort-delivery-effort-283-c",
  "math-exp-sum-business-sum-design-effort-build-effort-delivery-effort-333-a",
  "math-exp-sum-business-sum-design-effort-build-effort-delivery-effort-333-b",
  "math-exp-sum-business-sum-design-effort-build-effort-delivery-effort-333-c",
]);

const cameraStudioTool: ToolMeta = {
  id: "camera-studio",
  name: "Camera Studio",
  slug: "camera-studio",
  description: "Take photos and record videos. Switch between the front and back cameras, zoom in or out, adjust brightness, apply color filters, and save your captures to your device.",
  category: "photography",
  subcategory: "Camera",
  keywords: ["camera", "camera studio", "photo", "photography", "video", "selfie", "front camera", "rear camera", "filters", "creator", "recording", "capture", "zoom", "exposure"],
  tags: ["camera", "photo", "video", "creator"],
  icon: "Camera",
  iconBackground: "#171b1e",
  iconAccent: "#2ec4b6",
  popularity: 1200,
  featured: true,
  clientSide: true,
  requiresBackend: false,
  requiresAuth: false,
  status: "active",
  related: [],
  engine: { type: "custom", id: "camera-studio" },
  isNew: true,
};

const smartphonePrototypeLabTool: ToolMeta = {
  id: "smartphone-prototype-lab",
  name: "Smartphone Prototype Lab",
  slug: "smartphone-prototype-lab",
  description: "Explore a generic smartphone as an interactive 3D production model. Inspect the display stack, motherboard packages, cameras, power systems, materials and factory assembly sequence.",
  category: "design",
  subcategory: "Product engineering",
  keywords: ["smartphone", "phone", "prototype", "3d", "3d model", "product engineering", "manufacturing", "production", "hardware", "electronics", "motherboard", "pcb", "soc", "cpu", "gpu", "npu", "ram", "storage", "display", "oled", "lcd", "camera", "battery", "assembly"],
  tags: ["smartphone", "3d", "engineering", "manufacturing", "hardware", "electronics", "product design"],
  icon: "Smartphone",
  iconBackground: "#171b1e",
  iconAccent: "#c7f36b",
  popularity: 1350,
  featured: false,
  clientSide: true,
  requiresBackend: false,
  requiresAuth: false,
  status: "active",
  related: [],
  engine: { type: "custom", id: "smartphone-prototype-lab" },
  isNew: true,
};


const fileWorkspaceTools: ToolMeta[] = [
  {
    id: "file-to-txt", name: "File to TXT Converter", slug: "file-to-txt",
    description: "Type or paste plain text, or extract readable text from supported files and save it as a TXT file.",
    category: "files", subcategory: "Text extraction",
    keywords: ["file to txt", "convert to text", "extract text", "docx to txt", "pdf to txt", "plain text", "text extractor"],
    tags: ["files", "text", "extract", "converter", "local"], icon: "FileText", popularity: 1080, featured: true,
    clientSide: true, requiresBackend: false, requiresAuth: false, status: "active",
    related: ["mime-type-lookup", "file-organizer", "pdf-text-extractor"], engine: { type: "file-converter", op: "file-to-txt" }, isNew: true,
  },
  {
    id: "file-organizer", name: "File Organizer", slug: "file-organizer",
    description: "Sort selected files into clear folders by type and export an organized copy without moving or deleting originals.",
    category: "files", subcategory: "Organization",
    keywords: ["organize files", "sort files", "file manager", "file organizer", "folders", "move files", "documents", "phone storage"],
    tags: ["files", "organize", "folders", "local", "mobile"], icon: "FolderTree", popularity: 1120, featured: true,
    clientSide: true, requiresBackend: false, requiresAuth: false, status: "active",
    related: ["batch-file-renamer", "folder-size-analyzer", "zip-any-file"], engine: { type: "custom", id: "file-organizer" }, isNew: true,
  },
  {
    id: "batch-file-renamer", name: "Batch File Renamer", slug: "batch-file-renamer",
    description: "Preview and apply consistent prefixes, suffixes, numbering and literal replacements to many filenames in one operation.",
    category: "files", subcategory: "Organization",
    keywords: ["batch rename", "bulk rename", "rename files", "filename pattern", "number files", "prefix", "suffix"],
    tags: ["files", "rename", "batch", "local", "mobile"], icon: "FilePenLine", popularity: 1050, featured: true,
    clientSide: true, requiresBackend: false, requiresAuth: false, status: "active",
    related: ["file-organizer", "file-search", "mime-type-lookup"], engine: { type: "custom", id: "batch-file-renamer" }, isNew: true,
  },
  {
    id: "duplicate-file-finder", name: "Duplicate File Finder", slug: "duplicate-file-finder",
    description: "Find identical files using SHA-256 content verification after size filtering; filenames alone are never treated as proof.",
    category: "files", subcategory: "Verification",
    keywords: ["duplicate finder", "find duplicates", "identical files", "same files", "free storage", "checksum"],
    tags: ["files", "duplicates", "sha256", "verify", "local"], icon: "Files", popularity: 1100, featured: true,
    clientSide: true, requiresBackend: false, requiresAuth: false, status: "active",
    related: ["folder-size-analyzer", "file-compare", "file-organizer"], engine: { type: "custom", id: "duplicate-file-finder" }, isNew: true,
  },
  {
    id: "folder-size-analyzer", name: "Folder Size Analyzer", slug: "folder-size-analyzer",
    description: "Inspect folder contents, total storage, file-type breakdowns and the largest files without opening a terminal.",
    category: "files", subcategory: "Analysis",
    keywords: ["folder size", "storage analyzer", "disk usage", "du", "largest files", "folder inventory", "storage usage"],
    tags: ["files", "storage", "folder", "analysis", "local", "mobile"], icon: "HardDrive", popularity: 1060, featured: true,
    clientSide: true, requiresBackend: false, requiresAuth: false, status: "active",
    related: ["file-organizer", "duplicate-file-finder", "file-search"], engine: { type: "custom", id: "folder-size-analyzer" }, isNew: true,
  },
  {
    id: "file-search", name: "File Search", slug: "file-search",
    description: "Find files by name and search inside supported text files with clear file and line references.",
    category: "files", subcategory: "Search",
    keywords: ["find files", "search files", "grep", "search in files", "file finder", "text search", "folder search"],
    tags: ["files", "search", "find", "grep", "local", "mobile"], icon: "FileSearch", popularity: 1090, featured: true,
    clientSide: true, requiresBackend: false, requiresAuth: false, status: "active",
    related: ["folder-size-analyzer", "batch-file-renamer", "file-compare"], engine: { type: "custom", id: "file-search" }, isNew: true,
  },
  {
    id: "file-compare", name: "File & Folder Compare", slug: "file-compare",
    description: "Compare two selected file sets to identify added, missing, changed and SHA-256-verified identical files.",
    category: "files", subcategory: "Verification",
    keywords: ["compare folders", "compare files", "directory diff", "diff", "file comparison", "backup compare", "rsync dry run"],
    tags: ["files", "compare", "diff", "backup", "sha256", "local"], icon: "GitCompareArrows", popularity: 1030, featured: true,
    clientSide: true, requiresBackend: false, requiresAuth: false, status: "active",
    related: ["duplicate-file-finder", "folder-size-analyzer", "file-search"], engine: { type: "custom", id: "file-compare" }, isNew: true,
  },
];

const allTools: ToolMeta[] = [
  // The browser has real dispatchers for both families. The generated catalogue is
  // shared with native clients, so expose these web-ready records as active here
  // without changing the independent Android/iOS catalogues in this browser task.
  ...catalogTools.filter((catalogTool) => !retiredDesignBuildCalculatorIds.has(catalogTool.id)).map((catalogTool) => {
    const presentedTool = presentGeneratedCalculator(catalogTool);
    const webTool: ToolMeta = (presentedTool.category === "qr" || (presentedTool.category === "ecommerce" && presentedTool.engine.type === "custom"))
      && presentedTool.status === "planned"
      ? { ...presentedTool, status: "active" }
      : presentedTool;
    if (webTool.id === aBookTool.id) return aBookTool;
    if (webTool.id === songMetadataAnalyzerTool.id) return songMetadataAnalyzerTool;
    if (webTool.id === "qr-payload-inspector") {
      return {
        ...webTool,
        name: "QR & Barcode Reader",
        description: "Scan QR codes and 1D/2D barcodes using your camera or an image file. Decode results locally on this device.",
        keywords: [...webTool.keywords, "scan", "scanner", "reader", "barcode", "qr", "camera", "image"],
        tags: [...webTool.tags, "scan", "reader", "barcode"],
      };
    }
    if (webTool.id === "audio-analyze-studio") {
      return { ...webTool, name: songMetadataAnalyzerTool.name, description: songMetadataAnalyzerTool.description, keywords: [...webTool.keywords, "dataset", "sandbox", "drafts", "folders"] };
    }
    return webTool;
  }),
  ...(!catalogTools.some((tool) => tool.id === designHexColorConverterTool.id) ? [designHexColorConverterTool] : []),
  ...DATETIME_TOOL_EXTENSIONS.filter((extension) => !catalogTools.some((tool) => tool.id === extension.id)),
  ...(!catalogTools.some((tool) => tool.id === musicDownloaderTool.id) ? [musicDownloaderTool] : []),
  ...(!catalogTools.some((tool) => tool.id === songMetadataAnalyzerTool.id) ? [songMetadataAnalyzerTool] : []),
  ...(!catalogTools.some((tool) => tool.id === aBookTool.id) ? [aBookTool] : []),
  ...(!catalogTools.some((tool) => tool.id === zipAnyFileTool.id) ? [zipAnyFileTool] : []),
  ...(!catalogTools.some((tool) => tool.id === cameraStudioTool.id) ? [cameraStudioTool] : []),
  ...(!catalogTools.some((tool) => tool.id === smartphonePrototypeLabTool.id) ? [smartphonePrototypeLabTool] : []),
  ...fileWorkspaceTools.filter((tool) => !catalogTools.some((catalogTool) => catalogTool.id === tool.id)),
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
