import Foundation
import Combine

struct Catalog: Decodable {
    let schemaVersion: Int
    let catalogVersion: String
    let counts: CatalogCounts
    let categories: [ToolCategory]
    let tools: [Tool]
    let relatedReferenceTools: [Tool]?

    var browserActiveToolCount: Int {
        (tools + (relatedReferenceTools ?? [])).filter { $0.status == "active" || $0.status == "beta" }.count
    }
}

private let retiredDesignBuildCalculatorIDs: Set<String> = [
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
]

struct CatalogCounts: Codable {
    let total: Int
    let active: Int
    let planned: Int
    let categories: Int
}

struct ToolCategory: Codable, Identifiable, Hashable {
    let id: String
    let name: String
    let description: String
    let blurb: String
    let icon: String
}

enum CatalogJSONValue: Decodable, Hashable {
    case string(String)
    case number(Double)
    case bool(Bool)
    case object([String: CatalogJSONValue])
    case array([CatalogJSONValue])
    case null

    init(from decoder: Decoder) throws {
        let value = try decoder.singleValueContainer()
        if value.decodeNil() { self = .null }
        else if let item = try? value.decode(Bool.self) { self = .bool(item) }
        else if let item = try? value.decode(Double.self) { self = .number(item) }
        else if let item = try? value.decode(String.self) { self = .string(item) }
        else if let item = try? value.decode([String: CatalogJSONValue].self) { self = .object(item) }
        else if let item = try? value.decode([CatalogJSONValue].self) { self = .array(item) }
        else { throw DecodingError.dataCorruptedError(in: value, debugDescription: "Unsupported catalog JSON value") }
    }
}

private struct EngineCodingKey: CodingKey {
    let stringValue: String
    let intValue: Int?
    init?(stringValue: String) { self.stringValue = stringValue; self.intValue = nil }
    init?(intValue: Int) { self.stringValue = String(intValue); self.intValue = intValue }
}

struct ToolEngine: Decodable, Hashable {
    let type: String?
    let id: String?
    let op: String?
    let configuration: [String: CatalogJSONValue]

    init(type: String?, id: String?, op: String?, configuration: [String: CatalogJSONValue] = [:]) {
        self.type = type
        self.id = id
        self.op = op
        self.configuration = configuration
    }

    init(from decoder: Decoder) throws {
        let values = try decoder.container(keyedBy: EngineCodingKey.self)
        type = try values.decodeIfPresent(String.self, forKey: EngineCodingKey(stringValue: "type")!)
        id = try values.decodeIfPresent(String.self, forKey: EngineCodingKey(stringValue: "id")!)
        op = try values.decodeIfPresent(String.self, forKey: EngineCodingKey(stringValue: "op")!)
        var extras: [String: CatalogJSONValue] = [:]
        for key in values.allKeys where !["type", "id", "op"].contains(key.stringValue) {
            extras[key.stringValue] = try values.decode(CatalogJSONValue.self, forKey: key)
        }
        configuration = extras
    }
}

struct Tool: Decodable, Identifiable, Hashable {
    let id: String
    let name: String
    let slug: String
    let description: String
    let category: String
    let subcategory: String?
    let keywords: [String]
    let tags: [String]
    let icon: String
    let popularity: Int
    let featured: Bool
    let clientSide: Bool
    let requiresBackend: Bool
    let requiresAuth: Bool
    let status: String
    let disclaimer: String?
    let related: [String]
    let engine: ToolEngine

    var isPlanned: Bool { status.lowercased() == "planned" }
    var isOfflineCapable: Bool {
        let nativeDocumentOperations: Set<String> = [
            "pdf-metadata-viewer", "pdf-metadata-tool", "pdf-page-extractor", "pdf-splitter",
            "pdf-rotator", "pdf-merger", "pdf-text-extractor", "docx-text-extractor"
        ]
        let hasNativeDocumentEngine = nativeDocumentOperations.contains(id) && !requiresAuth
        let hasLocalToolEngine = clientSide && !requiresBackend && !requiresAuth
        return ["active", "beta"].contains(status.lowercased()) && !isUnderProduction &&
            (hasNativeDocumentEngine || hasLocalToolEngine) && id != "music-downloader" &&
            !NativeCopy.isWebRuntimeOnly(id)
    }
    var offlineDescription: String {
        guard isOfflineCapable else { return description }
        return description.lowercased().hasPrefix("works offline") ? description : "Works offline. \(description)"
    }
    var isUnderProduction: Bool {
        !["a-book", "zip-any-file", "camera-studio", "pdf-merger", "pdf-metadata-viewer", "pdf-page-extractor", "pdf-splitter", "pdf-rotator"].contains(id.lowercased()) &&
        !["accessibility", "ai", "audio", "business", "calculators", "career", "celebrations", "communication", "converters", "creators", "datetime", "design", "developer", "ecommerce", "education", "events", "files", "fitness", "gaming", "image", "interactive", "marketing", "network", "personal", "productivity", "qr", "random", "relationships", "security", "seo", "social", "streaming", "testdata", "text", "video", "webdesign"].contains(category.lowercased())
    }
    var searchText: String {
        ([id, slug, name, description, category, subcategory ?? "", keywords.joined(separator: " "), tags.joined(separator: " ")].joined(separator: " ")).lowercased()
    }

    var nativeDisclaimerText: String? {
        switch disclaimer {
        case "health": return "Estimates only — not medical advice."
        case "finance": return "Estimates based on your inputs — not financial advice."
        case "earnings": return "Editable assumptions. Not a prediction of actual payouts."
        case "mockup": return "DEMO / MOCKUP / FICTIONAL — not authentic evidence."
        case "estimate": return "Approximate result. Check assumptions before relying on it."
        default: return nil
        }
    }

    func nativeFacing() -> Tool {
        Tool(
            id: id,
            name: id == "qr-payload-inspector" ? "QR & Barcode Reader" : name,
            slug: slug,
            description: NativeCopy.text(id == "qr-payload-inspector" ? "Scan QR codes and 1D/2D barcodes using your camera or an image file. Decode results locally on this device." : description),
            category: category,
            subcategory: subcategory,
            keywords: id == "qr-payload-inspector" ? Array(NSOrderedSet(array: keywords + ["scan", "scanner", "reader", "barcode", "camera", "image", "decode"])) as? [String] ?? keywords : keywords,
            tags: id == "qr-payload-inspector" ? Array(NSOrderedSet(array: tags + ["scan", "reader", "barcode"])) as? [String] ?? tags : tags,
            icon: icon,
            popularity: popularity,
            featured: featured,
            clientSide: clientSide,
            requiresBackend: requiresBackend,
            requiresAuth: requiresAuth,
            status: ["qr", "ecommerce"].contains(category.lowercased()) ? "active" : status,
            disclaimer: disclaimer,
            related: related,
            engine: engine
        )
    }
}

extension ToolCategory {
    func nativeFacing() -> ToolCategory {
        ToolCategory(
            id: id,
            name: name,
            description: NativeCopy.text(description),
            blurb: NativeCopy.text(blurb),
            icon: icon
        )
    }
}

extension Catalog {
    func nativeFacing() -> Catalog {
        // Remove the retired formula records from both primary and related-reference discovery.
        let availableTools = tools.filter { !retiredDesignBuildCalculatorIDs.contains($0.id) }
        let nativeTools = availableTools
            .filter { !NativeCopy.isWebRuntimeOnly($0.id) }
            .map { $0.nativeFacing() }
        let relatedReferences = (relatedReferenceTools ?? []).filter { !retiredDesignBuildCalculatorIDs.contains($0.id) } + availableTools
            .filter { NativeCopy.isWebRuntimeOnly($0.id) }
            .map { $0.nativeFacing() }
        let planned = nativeTools.filter(\.isPlanned).count
        let active = nativeTools.filter { !$0.isPlanned }.count
        return Catalog(
            schemaVersion: schemaVersion,
            catalogVersion: catalogVersion,
            counts: CatalogCounts(total: nativeTools.count, active: active, planned: planned, categories: categories.count),
            categories: categories.map { $0.nativeFacing() },
            tools: nativeTools,
            relatedReferenceTools: relatedReferences
        )
    }
}


extension Catalog {
    /// Adds the native Music Downloader as a runtime extension without editing the generated shared catalog.
    func includingMusicDownloader() -> Catalog {
        guard !tools.contains(where: { $0.id == "music-downloader" }) else { return self }
        let tool = Tool(
            id: "music-downloader",
            name: "Music Downloader",
            slug: "music-downloader",
            description: "Download authorized tracks from supported public music pages or direct audio files, or import and organize music offline.",
            category: "audio",
            subcategory: "Music",
            keywords: ["music", "download", "offline", "online", "track", "album", "playlist", "audio", "spotify", "apple music", "youtube", "youtube music", "audiomack", "boomplay", "deezer", "amazon music", "tidal", "soundcloud", "pandora", "mixcloud", "anghami", "qobuz", "napster", "jiosaavn", "iheart radio"],
            tags: ["music", "download", "offline", "online", "album", "playlist"],
            icon: "Download",
            popularity: 10000,
            featured: true,
            clientSide: false,
            requiresBackend: false,
            requiresAuth: false,
            status: "active",
            disclaimer: nil,
            related: ["audio-file-inspector", "music-studio", "audio-to-wav"],
            engine: ToolEngine(type: "audio", id: "music-downloader", op: "music-downloader", configuration: [:])
        )
        return Catalog(
            schemaVersion: schemaVersion,
            catalogVersion: catalogVersion,
            counts: CatalogCounts(total: counts.total + 1, active: counts.active + 1, planned: counts.planned, categories: counts.categories),
            categories: categories,
            tools: (tools + [tool]).sorted {
                let leftCategory = $0.category.lowercased()
                let rightCategory = $1.category.lowercased()
                return leftCategory == rightCategory
                    ? ($0.name.localizedCaseInsensitiveCompare($1.name) == .orderedAscending)
                    : leftCategory < rightCategory
            },
            relatedReferenceTools: withWorkspace.relatedReferenceTools
        )
    }
}


extension Catalog {
    /// Adds the native Song Metadata Analyzer when loading an older generated catalog.
    func includingSongMetadataAnalyzer() -> Catalog {
        let tool = Tool(
            id: "song-metadata-analyzer",
            name: "AI Music Data Sandbox",
            slug: "ai-music-data-sandbox",
            description: "Organize, tag and prepare music for training, right on your device.",
            category: "audio",
            subcategory: "Music",
            keywords: ["song", "music", "metadata", "sandbox", "dataset", "training", "bpm", "tempo", "key", "genre", "mood", "vocals", "instruments", "batch", "zip", "afrobeats", "afro-pop"],
            tags: ["song", "music", "metadata", "analysis", "bpm", "key", "genre", "batch"],
            icon: "AudioLines",
            popularity: 9900,
            featured: true,
            clientSide: true,
            requiresBackend: false,
            requiresAuth: false,
            status: "active",
            disclaimer: nil,
            related: ["audio-file-inspector", "music-studio", "music-downloader"],
            engine: ToolEngine(type: "audio", id: "song-metadata-analyzer", op: "song-metadata-analyzer", configuration: [:])
        )
        let updated = tools.filter { $0.id != "song-metadata-analyzer" && $0.id != "audio-analyze-studio" } + [tool]
        return Catalog(
            schemaVersion: schemaVersion,
            catalogVersion: catalogVersion,
            counts: CatalogCounts(total: updated.count, active: updated.filter { $0.status == "active" || $0.status == "beta" }.count, planned: counts.planned, categories: counts.categories),
            categories: categories,
            tools: updated.sorted {
                let leftCategory = $0.category.lowercased()
                let rightCategory = $1.category.lowercased()
                return leftCategory == rightCategory
                    ? ($0.name.localizedCaseInsensitiveCompare($1.name) == .orderedAscending)
                    : leftCategory < rightCategory
            },
            relatedReferenceTools: relatedReferenceTools?.filter { $0.id != "audio-analyze-studio" && $0.id != "song-metadata-analyzer" }
        )
    }
}


extension Catalog {
    /// Adds the native-only A book tool while older shared catalogue bundles roll forward.
    func includingABook() -> Catalog {
        guard !tools.contains(where: { $0.id == "a-book" }) else { return self }
        let tool = Tool(
            id: "a-book",
            name: "A book",
            slug: "a-book",
            description: "Private local notes and document workspace. Write, organize, search, attach files, and process supported PDFs on this device.",
            category: "productivity",
            subcategory: "Notes & documents",
            keywords: ["a book", "notes", "notepad", "notebook", "local notes", "offline notes", "pdf", "document", "attachments", "markdown", "writing", "journal", "search", "folders", "tags"],
            tags: ["notes", "notebook", "documents", "pdf", "local", "offline", "productivity"],
            icon: "FileText",
            popularity: 950,
            featured: true,
            clientSide: true,
            requiresBackend: false,
            requiresAuth: false,
            status: "active",
            disclaimer: nil,
            related: ["pdf-merger", "pdf-splitter", "pdf-text-extractor"],
            engine: ToolEngine(type: "custom", id: "a-book", op: "a-book", configuration: [:])
        )
        let updated = withWorkspace.tools + [tool]
        return Catalog(
            schemaVersion: withWorkspace.schemaVersion,
            catalogVersion: withWorkspace.catalogVersion,
            counts: CatalogCounts(total: updated.count, active: updated.filter { $0.status == "active" || $0.status == "beta" }.count, planned: withWorkspace.counts.planned, categories: withWorkspace.counts.categories),
            categories: withWorkspace.categories,
            tools: updated.sorted {
                let leftCategory = $0.category.lowercased()
                let rightCategory = $1.category.lowercased()
                return leftCategory == rightCategory
                    ? ($0.name.localizedCaseInsensitiveCompare($1.name) == .orderedAscending)
                    : leftCategory < rightCategory
            },
            relatedReferenceTools: relatedReferenceTools
        )
    }
}

extension Catalog {
    /// Adds Camera Studio as a native on-device tool.
    func includingCameraStudio() -> Catalog {
        guard !tools.contains(where: { $0.id == "camera-studio" }) else { return self }
        let tool = Tool(
            id: "camera-studio",
            name: "Camera Studio",
            slug: "camera-studio",
            description: "Take photos and record videos. Switch between the front and back cameras, zoom in or out, adjust brightness, apply color filters, and save your captures to your device.",
            category: "photography",
            subcategory: "Camera",
            keywords: ["camera", "camera studio", "photo", "photography", "video", "selfie", "front camera", "rear camera", "recording", "capture", "flash", "torch"],
            tags: ["camera", "photo", "video", "creator"],
            icon: "Camera",
            popularity: 1200,
            featured: true,
            clientSide: true,
            requiresBackend: false,
            requiresAuth: false,
            status: "active",
            disclaimer: nil,
            related: [],
            engine: ToolEngine(type: "custom", id: "camera-studio", op: nil, configuration: [:])
        )
        return Catalog(
            schemaVersion: schemaVersion,
            catalogVersion: catalogVersion,
            counts: CatalogCounts(total: counts.total + 1, active: counts.active + 1, planned: counts.planned, categories: counts.categories),
            categories: categories,
            tools: (tools + [tool]).sorted {
                let leftCategory = $0.category.lowercased()
                let rightCategory = $1.category.lowercased()
                return leftCategory == rightCategory ? ($0.name.lowercased() < $1.name.lowercased()) : leftCategory < rightCategory
            },
            relatedReferenceTools: relatedReferenceTools
        )
    }

    /// Registers local ZIP64 compression and extraction as a native tool.
    func includingZipArchive() -> Catalog {
        // ZIP declares File Workspace destinations; register them first so this extension
        // is self-contained and every published related ID resolves immediately.
        let withWorkspace = includingFileWorkspaceTools()
        guard !withWorkspace.tools.contains(where: { $0.id == "zip-any-file" }) else { return withWorkspace }
        let tool = Tool(
            id: "zip-any-file",
            name: "Zip any file",
            slug: "zip-any-file",
            description: "Compress one file or many files into a ZIP/ZIP64 archive, or safely extract archives locally on this device.",
            category: "files",
            subcategory: "Archives & extraction",
            keywords: ["zip", "zipper", "compress", "compression", "archive", "extract", "unzip", "decompress", "zip64", "large files", "folder", "multiple files"],
            tags: ["zip", "archive", "compression", "extract", "offline", "local", "files"],
            icon: "Archive",
            popularity: 1450,
            featured: true,
            clientSide: true,
            requiresBackend: false,
            requiresAuth: false,
            status: "active",
            disclaimer: nil,
            related: ["file-to-txt", "file-organizer", "file-compare"],
            engine: ToolEngine(type: "custom", id: "zip-any-file", op: "zip-any-file", configuration: [:])
        )
        let updated = tools + [tool]
        return Catalog(
            schemaVersion: schemaVersion,
            catalogVersion: catalogVersion,
            counts: CatalogCounts(total: updated.count, active: updated.filter { $0.status == "active" || $0.status == "beta" }.count, planned: counts.planned, categories: counts.categories),
            categories: categories,
            tools: updated.sorted {
                let leftCategory = $0.category.lowercased()
                let rightCategory = $1.category.lowercased()
                return leftCategory == rightCategory
                    ? ($0.name.localizedCaseInsensitiveCompare($1.name) == .orderedAscending)
                    : leftCategory < rightCategory
            },
            relatedReferenceTools: relatedReferenceTools
        )
    }


    /// Registers the native local File workspace tools alongside the shared catalogue.
    func includingFileWorkspaceTools() -> Catalog {
        let definitions: [(String, String, String, String, [String], String)] = [
            ("file-to-txt", "File to TXT Converter", "Text extraction",
             "Extract readable text locally from supported text files, DOCX documents and selectable-text PDFs.",
             ["file to txt", "extract text", "docx to txt", "pdf to txt", "plain text"], "file-converter"),
            ("file-organizer", "File Organizer", "Organization",
             "Copy selected files into clearly named type folders without moving or deleting originals.",
             ["organize files", "sort files", "folders", "file manager", "phone storage"], "custom"),
            ("batch-file-renamer", "Batch File Renamer", "Organization",
             "Preview filename numbering, prefixes, suffixes and replacements before exporting renamed copies.",
             ["batch rename", "bulk rename", "filename pattern", "prefix", "suffix"], "custom"),
            ("duplicate-file-finder", "Duplicate File Finder", "Verification",
             "Find identical files using streaming SHA-256 verification after a file-size prefilter.",
             ["duplicate finder", "identical files", "sha256", "checksum", "free storage"], "custom"),
            ("folder-size-analyzer", "Folder Size Analyzer", "Analysis",
             "Inspect folder totals, file-type breakdowns and the largest files on this device.",
             ["folder size", "disk usage", "du", "largest files", "storage analyzer"], "custom"),
            ("file-search", "File Search", "Search",
             "Search filenames and supported text file contents without typing terminal commands.",
             ["find files", "grep", "search in files", "file finder", "text search"], "custom"),
            ("file-compare", "File & Folder Compare", "Verification",
             "Compare two folder selections and verify same-size files with SHA-256 checksums.",
             ["compare folders", "compare files", "directory diff", "diff", "file comparison", "backup compare", "rsync dry run", "sha256", "hash", "checksum"], "custom")
        ]
        let existing = Set(tools.map(\.id))
        let additions = definitions.filter { !existing.contains($0.0) }.map { definition -> Tool in
            let (id, name, subcategory, description, keywords, engineType) = definition
            return Tool(
                id: id,
                name: name,
                slug: id,
                description: description,
                category: "files",
                subcategory: subcategory,
                keywords: keywords + ["files", "local", "mobile", "offline"],
                tags: ["files", "local", "mobile", "offline", "file-workspace"] + (id == "file-compare" ? ["sha256", "hash", "checksum"] : []),
                icon: id == "file-organizer" ? "FolderTree" :
                    id == "batch-file-renamer" ? "FilePenLine" :
                    id == "duplicate-file-finder" ? "Files" :
                    id == "folder-size-analyzer" ? "HardDrive" :
                    id == "file-search" ? "FileSearch" :
                    id == "file-compare" ? "GitCompareArrows" : "FileText",
                popularity: id == "file-organizer" ? 1120 : 1040,
                featured: true,
                clientSide: true,
                requiresBackend: false,
                requiresAuth: false,
                status: "active",
                disclaimer: nil,
                related: [],
                engine: ToolEngine(
                    type: engineType,
                    id: engineType == "custom" ? id : nil,
                    op: engineType == "file-converter" ? "file-to-txt" : nil,
                    configuration: [:]
                )
            )
        }
        guard !additions.isEmpty else { return self }
        let updated = tools + additions
        return Catalog(
            schemaVersion: schemaVersion,
            catalogVersion: catalogVersion,
            counts: CatalogCounts(
                total: updated.count,
                active: updated.filter { $0.status == "active" || $0.status == "beta" }.count,
                planned: updated.filter { $0.status != "active" && $0.status != "beta" }.count,
                categories: categories.count
            ),
            categories: categories,
            tools: updated.sorted {
                let left = $0.category.lowercased()
                let right = $1.category.lowercased()
                return left == right
                    ? $0.name.localizedCaseInsensitiveCompare($1.name) == .orderedAscending
                    : left < right
            },
            relatedReferenceTools: relatedReferenceTools
        )
    }

}

private enum NativeSearchField {
    case name, id, keyword, alias, tag, subcategory, category, description

    var weight: Int {
        switch self {
        case .name: return 10
        case .id: return 7
        case .keyword: return 6
        case .alias: return 5
        case .tag, .subcategory: return 4
        case .category: return 3
        case .description: return 2
        }
    }
}

private enum NativeSearchMatchKind {
    case exact, synonym, fuzzy, prefix
}

private struct NativeSearchStemInfo {
    let weight: Int
    let field: NativeSearchField
    let surface: String
}

private struct NativeSearchVariant {
    let stems: [String]
    let weight: Double
    let kind: NativeSearchMatchKind
}

private struct NativeSearchTerm {
    let surface: String
    let stem: String
    let variants: [NativeSearchVariant]
    let idfValue: Double
}

private struct NativeSearchDocument {
    let tool: Tool
    let stems: [String: NativeSearchStemInfo]
    let surfaces: Set<String>
    let surfaceOrder: [String]
    let normalizedName: String
    let normalizedID: String
    let nameTokenCount: Int
    let aliasPhrases: Set<String>
    let stemmedName: String
}

private struct NativeSearchRanked {
    let document: NativeSearchDocument
    let score: Double
}

/**
 * Deterministic native port of src/lib/search.ts.
 *
 * The same catalogue metadata, field weighting, IDF, synonym/alias handling,
 * typo/prefix expansion, coverage gate and stable tie-breaks are used by Home,
 * Search and assistant recommendations. Search ranks metadata only.
 */
private final class NativeCatalogSearchIndex {
    private let documents: [NativeSearchDocument]
    private let postings: [String: [Int]]
    private let vocabulary: [String: Int]
    private let surfaceVocabulary: [(surface: String, stem: String)]

    init(tools: [Tool]) {
        let builtDocuments = tools.map(Self.buildDocument)

        var postingLists: [String: [Int]] = [:]
        for (index, document) in builtDocuments.enumerated() {
            for key in document.stems.keys {
                postingLists[key, default: []].append(index)
            }
        }
        let builtVocabulary = postingLists.mapValues(\.count)

        var seenSurfaces = Set<String>()
        var orderedSurfaces: [(surface: String, stem: String)] = []
        for document in builtDocuments {
            for surface in document.surfaceOrder where seenSurfaces.insert(surface).inserted {
                orderedSurfaces.append((surface, Self.stem(surface)))
            }
        }

        documents = builtDocuments
        postings = postingLists
        vocabulary = builtVocabulary
        surfaceVocabulary = orderedSurfaces
    }

    func search(_ query: String, limit: Int) -> [Tool] {
        guard limit > 0 else { return [] }
        let normalized = Self.normalizeText(query)
        if normalized.isEmpty {
            return documents.sorted {
                let leftTier = $0.tool.isPlanned ? 1 : 0
                let rightTier = $1.tool.isPlanned ? 1 : 0
                if leftTier != rightTier { return leftTier < rightTier }
                if $0.tool.popularity != $1.tool.popularity { return $0.tool.popularity > $1.tool.popularity }
                let leftName = Self.normalizeText($0.tool.name)
                let rightName = Self.normalizeText($1.tool.name)
                if leftName != rightName { return leftName < rightName }
                return $0.tool.id < $1.tool.id
            }.prefix(limit).map(\.tool)
        }

        let interpreted = interpret(normalized)
        guard !interpreted.terms.isEmpty else { return [] }
        var candidateIndices = Set<Int>()
        for term in interpreted.terms {
            for variant in term.variants {
                for key in variant.stems {
                    for index in postings[key] ?? [] { candidateIndices.insert(index) }
                }
            }
        }

        let ranked = candidateIndices.compactMap { index -> NativeSearchRanked? in
            let document = documents[index]
            guard let score = score(
                document,
                terms: interpreted.terms,
                phrase: interpreted.phrase,
                fullPhrase: interpreted.fullPhrase
            ) else { return nil }
            return NativeSearchRanked(document: document, score: score)
        }
        return ranked.sorted {
            let leftTier = $0.document.tool.isPlanned ? 1 : 0
            let rightTier = $1.document.tool.isPlanned ? 1 : 0
            if leftTier != rightTier { return leftTier < rightTier }
            if $0.score != $1.score { return $0.score > $1.score }
            if $0.document.tool.popularity != $1.document.tool.popularity {
                return $0.document.tool.popularity > $1.document.tool.popularity
            }
            let leftName = Self.normalizeText($0.document.tool.name)
            let rightName = Self.normalizeText($1.document.tool.name)
            if leftName != rightName { return leftName < rightName }
            return $0.document.tool.id < $1.document.tool.id
        }.prefix(limit).map { $0.document.tool }
    }

    private struct InterpretedQuery {
        let terms: [NativeSearchTerm]
        let phrase: String
        let fullPhrase: String
    }

    private func interpret(_ normalized: String) -> InterpretedQuery {
        let all = normalized.split(separator: " ").map(String.init).filter { $0.count > 1 || $0 == "%" }
        let content = all.filter { !Self.stopWords.contains($0) }
        let surfaces = content.isEmpty ? all : content
        let terms = surfaces.enumerated().map { index, surface -> NativeSearchTerm in
            let key = Self.stem(surface)
            let documentFrequency = vocabulary[key] ?? 0
            var variants = [NativeSearchVariant(stems: [key], weight: 1.0, kind: .exact)]

            for synonym in Self.synonyms[surface] ?? [] {
                let synonymStems = Self.tokenize(synonym).map(Self.stem)
                if !synonymStems.isEmpty {
                    variants.append(NativeSearchVariant(stems: synonymStems, weight: 0.7, kind: .synonym))
                }
            }

            if documentFrequency == 0 && key.count >= 3 {
                let editLimit = Self.maxEdits(key.count)
                if editLimit > 0 {
                    var best: [String: (distance: Int, documentFrequency: Int)] = [:]
                    var bestOrder: [String] = []
                    for entry in surfaceVocabulary {
                        if abs(entry.surface.count - surface.count) > editLimit &&
                            abs(entry.stem.count - key.count) > editLimit { continue }
                        if entry.surface.first != surface.first && entry.stem.first != key.first { continue }
                        let distance = min(
                            Self.boundedDistance(surface, entry.surface, maximum: editLimit),
                            Self.boundedDistance(key, entry.stem, maximum: editLimit)
                        )
                        if distance > editLimit { continue }
                        let existing = best[entry.stem]
                        if existing == nil {
                            bestOrder.append(entry.stem)
                            best[entry.stem] = (distance, vocabulary[entry.stem] ?? 0)
                        } else if distance < existing!.distance {
                            best[entry.stem] = (distance, vocabulary[entry.stem] ?? 0)
                        }
                    }
                    let orderedCandidates = bestOrder.sorted {
                        guard let left = best[$0], let right = best[$1] else { return $0 < $1 }
                        if left.distance != right.distance { return left.distance < right.distance }
                        if left.documentFrequency != right.documentFrequency { return left.documentFrequency > right.documentFrequency }
                        return $0 < $1
                    }
                    for candidate in orderedCandidates.prefix(3) {
                        guard let item = best[candidate] else { continue }
                        variants.append(NativeSearchVariant(
                            stems: [candidate],
                            weight: item.distance == 1 ? 0.55 : 0.4,
                            kind: .fuzzy
                        ))
                    }
                }

                if index == surfaces.count - 1 && surfaces.count <= 2 {
                    let prefixes = vocabulary
                        .filter { $0.key.count > key.count && $0.key.hasPrefix(key) }
                        .sorted {
                            if $0.value != $1.value { return $0.value > $1.value }
                            return $0.key < $1.key
                        }
                    for item in prefixes.prefix(8) {
                        variants.append(NativeSearchVariant(stems: [item.key], weight: 0.65, kind: .prefix))
                    }
                }
            }

            let idfSource: Int
            if documentFrequency > 0 {
                idfSource = documentFrequency
            } else {
                idfSource = variants.dropFirst()
                    .compactMap { $0.stems.first.flatMap { vocabulary[$0] } }
                    .first(where: { $0 > 0 }) ?? 0
            }
            return NativeSearchTerm(
                surface: surface,
                stem: key,
                variants: variants,
                idfValue: idf(idfSource)
            )
        }
        return InterpretedQuery(
            terms: terms,
            phrase: surfaces.joined(separator: " "),
            fullPhrase: all.joined(separator: " ")
        )
    }

    private func score(
        _ document: NativeSearchDocument,
        terms: [NativeSearchTerm],
        phrase: String,
        fullPhrase: String
    ) -> Double? {
        var base = 0.0
        var matchedIDF = 0.0
        let idfTotal = terms.reduce(0.0) { $0 + $1.idfValue }
        let totalIDF = idfTotal > 0 ? idfTotal : 1.0
        var strongMatch = false
        var namedTerms = 0

        for term in terms {
            var best = 0.0
            var bestField = NativeSearchField.description
            var bestStrong = false
            for variant in term.variants {
                var weakestWeight = Int.max
                var weakestField = NativeSearchField.description
                var matchedAll = true
                for key in variant.stems {
                    guard let info = document.stems[key] else {
                        matchedAll = false
                        break
                    }
                    if info.weight < weakestWeight {
                        weakestWeight = info.weight
                        weakestField = info.field
                    }
                }
                guard matchedAll else { continue }
                let surfaceBonus = variant.kind == .exact
                    ? (document.surfaces.contains(term.surface) ? 1.0 : 0.92)
                    : 1.0
                let df = vocabulary[variant.stems[0]] ?? 0
                let variantIDF = variant.kind == .exact ? term.idfValue : idf(df)
                let value = variant.weight * surfaceBonus * Double(weakestWeight) * variantIDF
                if value > best {
                    best = value
                    bestField = weakestField
                    bestStrong = weakestWeight >= NativeSearchField.tag.weight
                }
            }
            if best > 0 {
                base += best
                matchedIDF += term.idfValue
                if bestStrong { strongMatch = true }
                if bestField == .name || bestField == .id { namedTerms += 1 }
            }
        }

        guard base > 0 else { return nil }
        let coverage = matchedIDF / totalIDF
        if terms.count >= 2 {
            let threshold = terms.count == 2 ? 0.75 : 0.6
            if coverage < threshold || !strongMatch { return nil }
        }

        var result = base * (0.4 + 0.6 * coverage)
        if !terms.isEmpty && namedTerms == terms.count { result += 30 }
        if !phrase.isEmpty && " \(document.normalizedName) ".contains(" \(phrase) ") { result += 40 }
        if !phrase.isEmpty && document.normalizedName.hasPrefix(phrase) { result += 20 }
        if document.aliasPhrases.contains(fullPhrase) || document.aliasPhrases.contains(phrase) { result += 250 }

        let conversionInput = fullPhrase.replacingOccurrences(
            of: "^(convert|change|turn|transform|save)\\s+",
            with: "",
            options: .regularExpression
        )
        if let match = conversionInput.range(of: "^(\\S+) to (\\S+)$", options: .regularExpression) {
            let pieces = String(conversionInput[match]).components(separatedBy: " to ")
            if pieces.count == 2 {
                let padded = " \(document.stemmedName) "
                if padded.contains(" \(Self.stemPhrase("\(pieces[0]) to \(pieces[1])")) ") {
                    result += 60
                } else if padded.contains(" \(Self.stemPhrase("\(pieces[1]) to \(pieces[0])")) ") {
                    result -= 15
                }
            }
        }

        let normalizedFullID = fullPhrase.replacingOccurrences(of: " ", with: "-")
        let normalizedPhraseID = phrase.replacingOccurrences(of: " ", with: "-")
        if document.normalizedName == fullPhrase || document.normalizedName == phrase ||
            document.normalizedID == normalizedFullID || document.normalizedID == normalizedPhraseID {
            result += 400
        }
        result -= 0.6 * Double(min(4, max(0, document.nameTokenCount - namedTerms)))
        return (result * 1_000_000).rounded() / 1_000_000
    }

    private static func buildDocument(_ tool: Tool) -> NativeSearchDocument {
        var stems: [String: NativeSearchStemInfo] = [:]
        var surfaces = Set<String>()
        var surfaceOrder: [String] = []
        func add(_ value: String, field: NativeSearchField) {
            for surface in tokenize(value) {
                if surfaces.insert(surface).inserted { surfaceOrder.append(surface) }
                let key = stem(surface)
                if stems[key] == nil || stems[key]!.weight < field.weight {
                    stems[key] = NativeSearchStemInfo(weight: field.weight, field: field, surface: surface)
                }
            }
        }

        add(tool.name, field: .name)
        let aliases = searchAliases[tool.id] ?? []
        var aliasPhrases = Set<String>()
        for alias in aliases {
            aliasPhrases.insert(normalizeText(alias))
            add(alias, field: .alias)
        }
        add(tool.id, field: .id)
        for item in tool.keywords { add(item, field: .keyword) }
        for item in tool.tags { add(item, field: .tag) }
        add(tool.subcategory ?? "", field: .subcategory)
        add(tool.category, field: .category)
        add(tool.description, field: .description)

        return NativeSearchDocument(
            tool: tool,
            stems: stems,
            surfaces: surfaces,
            surfaceOrder: surfaceOrder,
            normalizedName: normalizeText(tool.name),
            normalizedID: tool.id.lowercased(),
            nameTokenCount: tokenize(tool.name).count,
            aliasPhrases: aliasPhrases,
            stemmedName: stemPhrase(tool.name)
        )
    }

    private func idf(_ documentFrequency: Int) -> Double {
        log(1 + Double(documents.count) / (1 + Double(documentFrequency)))
    }

    private static func normalizeText(_ value: String) -> String {
        let decomposed = value.decomposedStringWithCompatibilityMapping
        let filteredScalars = decomposed.unicodeScalars.filter { scalar in
            let kind = scalar.properties.generalCategory
            return kind != .nonspacingMark && kind != .spacingMark && kind != .enclosingMark
        }
        let filtered = String(String.UnicodeScalarView(filteredScalars))
        return filtered.lowercased()
            .replacingOccurrences(of: "&", with: " and ")
            .replacingOccurrences(of: "[^a-z0-9%+#\\s]+", with: " ", options: .regularExpression)
            .replacingOccurrences(of: "\\s+", with: " ", options: .regularExpression)
            .trimmingCharacters(in: .whitespacesAndNewlines)
    }

    private static func tokenize(_ value: String) -> [String] {
        normalizeText(value).split(separator: " ").map(String.init).filter { $0.count > 1 || $0 == "%" }
    }

    private static func stemPhrase(_ value: String) -> String {
        tokenize(formatNormalize(normalizeText(value))).map(stem).joined(separator: " ")
    }

    private static func formatNormalize(_ value: String) -> String {
        value.replacingOccurrences(of: "\\bjpeg\\b", with: "jpg", options: .regularExpression)
            .replacingOccurrences(of: "\\btif\\b", with: "tiff", options: .regularExpression)
    }

    private static func stem(_ token: String) -> String {
        if token.count <= 3 || token.contains(where: { $0.isNumber }) { return token }
        var result = token
        if ["ses", "xes", "zes", "ches", "shes"].contains(where: { result.hasSuffix($0) }) {
            result = String(result.dropLast(2))
        } else if result.count > 4 && result.hasSuffix("ies") {
            result = String(result.dropLast(3)) + "y"
        } else if result.hasSuffix("s") && !result.hasSuffix("ss") && !result.hasSuffix("us") && !result.hasSuffix("is") {
            result = String(result.dropLast())
        }
        for suffix in ["ion", "ing", "ers", "er", "or", "ed", "e"] {
            if result.hasSuffix(suffix) && result.count - suffix.count >= 4 {
                result = String(result.dropLast(suffix.count))
                break
            }
        }
        return result
    }

    private static func maxEdits(_ length: Int) -> Int {
        if length >= 9 { return 2 }
        if length >= 4 { return 1 }
        return 0
    }

    private static func boundedDistance(_ lhs: String, _ rhs: String, maximum: Int) -> Int {
        let a = Array(lhs)
        let b = Array(rhs)
        if a == b { return 0 }
        if abs(a.count - b.count) > maximum { return maximum + 1 }
        var rows = Array(repeating: Array(repeating: 0, count: b.count + 1), count: a.count + 1)
        for i in 0...a.count { rows[i][0] = i }
        for j in 0...b.count { rows[0][j] = j }
        if !a.isEmpty {
            for i in 1...a.count {
                var best = maximum + 1
                if !b.isEmpty {
                    for j in 1...b.count {
                        let cost = a[i - 1] == b[j - 1] ? 0 : 1
                        var value = min(
                            min(rows[i - 1][j] + 1, rows[i][j - 1] + 1),
                            rows[i - 1][j - 1] + cost
                        )
                        if i > 1 && j > 1 && a[i - 1] == b[j - 2] && a[i - 2] == b[j - 1] {
                            value = min(value, rows[i - 2][j - 2] + 1)
                        }
                        rows[i][j] = value
                        best = min(best, value)
                    }
                }
                if best > maximum { return maximum + 1 }
            }
        }
        return rows[a.count][b.count]
    }

    private static let stopWords: Set<String> = [
        "a", "an", "the", "to", "of", "for", "my", "me", "i", "do", "how", "can", "you", "what", "is", "are", "make",
        "online", "free", "tool", "tools", "with", "from", "into", "in", "on", "and", "or", "it", "this", "that", "using",
        "use", "want", "need", "please", "best", "app", "something", "some", "get", "be"
    ]

    private static let synonyms: [String: [String]] = [
        "photo": ["image", "picture", "pic"], "picture": ["image", "photo"], "pic": ["image", "photo"],
        "img": ["image"], "compress": ["minify", "shrink", "optimize", "size"], "smaller": ["compress", "shrink", "reduce"],
        "shrink": ["compress", "reduce"], "reduce": ["compress", "shrink"], "resize": ["scale", "dimensions", "size"],
        "json": ["javascript object"], "pwd": ["password"], "pass": ["password"], "bmi": ["body mass", "weight"],
        "percent": ["percentage", "%"], "qr": ["qrcode", "barcode"], "regexp": ["regex"], "regular": ["regex"],
        "uuid": ["guid"], "hash": ["checksum", "digest", "sha", "md5"], "color": ["colour", "hex", "rgb"],
        "colour": ["color"], "mockup": ["fake", "demo", "chat", "screenshot"], "invoice": ["bill", "receipt"],
        "pdf": ["document"], "encode": ["encoding", "base64"], "decode": ["decoding"],
        "a11y": ["accessibility"], "contrast": ["color contrast", "wcag"], "alt": ["alt-text", "image description"],
        "focus": ["focus ring", "focus state"], "aria": ["accessible name", "accessibility tree"],
        "tab": ["keyboard navigation", "tab order"], "animation": ["motion", "reduced motion"],
        "readability": ["plain language", "text spacing"], "merge": ["combine", "join"], "combine": ["merge", "join"],
        "join": ["merge", "combine"], "split": ["separate", "divide"], "change": ["convert"], "transform": ["convert"],
        "create": ["generate"], "scan": ["read", "reader"], "scanner": ["reader", "scan"], "calc": ["calculator"],
        "jpeg": ["jpg"], "jpg": ["jpeg"], "tiff": ["tif"], "tif": ["tiff"]
    ]

    private static let searchAliases: [String: [String]] = [
        "pdf-merger": ["pdf joiner"],
        "image-compressor": ["image size reducer", "reduce image size"],
        "image-resizer": ["change image size"],
        "profile-picture-maker": ["picture resize", "profile picture resize", "avatar resize"],
        "qr-generator": ["qr maker", "qr code maker"],
        "json-formatter": ["json viewer", "format json online"],
        "video-to-mp3": ["mp4 to mp3", "convert mp4 to mp3"],
        "video-trimmer": ["trim mp4", "cut video", "video cutter"],
        "video-to-gif": ["mp4 to gif"],
        "exif-remover": ["strip exif", "remove metadata from photo"],
        "heic-converter": ["iphone photo to jpg", "heic to jpg"],
        "file-png-to-jpg-converter": ["png to jpeg"],
        "lorem-ipsum-generator": ["dummy text", "placeholder text"],
        "regex-studio": ["test regular expression", "regexp tester"]
    ]
}

let webOnlyNativeSearchReferenceIDs: Set<String> = ["scene-studio", "smartphone-prototype-lab"]

private let webOnlyNativeSearchReferences: [Tool] = [
    Tool(
        id: "scene-studio",
        name: "Scene Studio",
        slug: "scene-studio",
        description: "Create local 2D and 3D animated scenes with structured scene data, validation, preview, captions, audio layers, project-bundle saving and MP4 export where browser support allows.",
        category: "video",
        subcategory: "Scene editing",
        keywords: ["scene studio", "3d", "2d", "animation", "video maker", "scene", "ai video", "chatbot", "json scene", "captions", "subtitles", "mp4", "render", "export video", "cinematic", "no code", "motion graphics", "babylon"],
        tags: ["3d", "2d", "animation", "video", "captions", "ai", "creator", "no code"],
        icon: "Clapperboard",
        popularity: 1250,
        featured: false,
        clientSide: true,
        requiresBackend: false,
        requiresAuth: false,
        status: "active",
        disclaimer: nil,
        related: ["video-trimmer", "video-compressor", "video-poster-generator"],
        engine: ToolEngine(type: "custom", id: "scene-studio", op: nil)
    ),
    Tool(
        id: "smartphone-prototype-lab",
        name: "Smartphone Prototype Lab",
        slug: "smartphone-prototype-lab",
        description: "Explore a generic smartphone as an interactive 3D production model. Inspect the display stack, motherboard packages, cameras, power systems, materials and factory assembly sequence.",
        category: "design",
        subcategory: "Product engineering",
        keywords: ["smartphone", "phone", "prototype", "3d", "3d model", "product engineering", "manufacturing", "production", "hardware", "electronics", "motherboard", "pcb", "soc", "cpu", "gpu", "npu", "ram", "storage", "display", "oled", "lcd", "camera", "battery", "assembly"],
        tags: ["smartphone", "3d", "engineering", "manufacturing", "hardware", "electronics", "product design"],
        icon: "Smartphone",
        popularity: 1350,
        featured: false,
        clientSide: true,
        requiresBackend: false,
        requiresAuth: false,
        status: "active",
        disclaimer: nil,
        related: [],
        engine: ToolEngine(type: "custom", id: "smartphone-prototype-lab", op: nil)
    )
]

private final class NativeCatalogSearchCache: @unchecked Sendable {
    static let shared = NativeCatalogSearchCache()

    private let lock = NSLock()
    private var indexes: [String: NativeCatalogSearchIndex] = [:]

    func search(catalog: Catalog, query: String, limit: Int, includeRelatedReferences: Bool) -> [Tool] {
        let source = includeRelatedReferences ? catalog.tools + (catalog.relatedReferenceTools ?? []) : catalog.tools
        let general = source.filter {
            $0.category != "accessibility" && !$0.tags.contains("developer-studio") && $0.id != "audio-analyze-studio"
        }
        let accessibility = catalog.accessibilityDiscoveryTools().filter { $0.category == "accessibility" }
        // These Web-only records participate in corpus IDF/ranking but are never returned
        // to native callers and are not registered in either native tool catalogue.
        let all = general + accessibility + catalog.developerStudioTools() + webOnlyNativeSearchReferences
        var seen = Set<String>()
        let candidates = all.filter { seen.insert($0.id).inserted }

        // A catalogue version and boundary IDs are not sufficient cache identity:
        // native extensions and generated search metadata can change while those values stay
        // the same. Include every field consumed by buildDocument and ranking.
        var candidateHasher = Hasher()
        for tool in candidates {
            candidateHasher.combine(tool.id)
            candidateHasher.combine(tool.name)
            candidateHasher.combine(tool.description)
            candidateHasher.combine(tool.category)
            candidateHasher.combine(tool.subcategory ?? "")
            candidateHasher.combine(tool.popularity)
            candidateHasher.combine(tool.status)
            for keyword in tool.keywords { candidateHasher.combine(keyword) }
            candidateHasher.combine("tool-keywords-end")
            for tag in tool.tags { candidateHasher.combine(tag) }
            candidateHasher.combine("tool-tags-end")
        }
        let fingerprint = [
            catalog.catalogVersion,
            String(catalog.schemaVersion),
            String(includeRelatedReferences),
            String(candidates.count),
            String(candidateHasher.finalize())
        ].joined(separator: "|")

        lock.lock()
        let index: NativeCatalogSearchIndex
        if let existing = indexes[fingerprint] {
            index = existing
        } else {
            index = NativeCatalogSearchIndex(tools: candidates)
            if indexes.count >= 6 { indexes.removeAll(keepingCapacity: true) }
            indexes[fingerprint] = index
        }
        lock.unlock()
        guard limit > 0 else { return [] }
        let expandedLimit = limit > Int.max - webOnlyNativeSearchReferenceIDs.count
            ? Int.max
            : limit + webOnlyNativeSearchReferenceIDs.count
        return index.search(query, limit: expandedLimit)
            .filter { !webOnlyNativeSearchReferenceIDs.contains($0.id) }
            .prefix(limit)
            .map { $0 }
    }
}

extension Catalog {
    func webSearch(_ query: String, limit: Int = Int.max, includeRelatedReferences: Bool = false) -> [Tool] {
        NativeCatalogSearchCache.shared.search(
            catalog: self,
            query: query,
            limit: limit,
            includeRelatedReferences: includeRelatedReferences
        )
    }
}

private func relatedAlphabeticalKey(_ value: String) -> String {
    value.decomposedStringWithCompatibilityMapping
        .replacingOccurrences(of: "\\p{M}+", with: "", options: .regularExpression)
        .lowercased()
        .replacingOccurrences(of: "[^a-z0-9]+", with: " ", options: .regularExpression)
        .trimmingCharacters(in: .whitespacesAndNewlines)
}

extension Catalog {
    /// Mirrors the web registry: preserve declared related IDs, then fill from the same category alphabetically.
    func relatedTools(for tool: Tool, limit: Int = 6) -> [Tool] {
        guard limit > 0 else { return [] }

        // Include the complete native catalogue (including Web-only related references) and
        // canonical Studio projections, while making the lookup safe for repeated IDs.
        var candidateIDs = Set<String>()
        let candidates = (accessibilityDiscoveryTools() + developerStudioTools())
            .filter { candidateIDs.insert($0.id).inserted }
        let byID = Dictionary(uniqueKeysWithValues: candidates.map { ($0.id, $0) })
        var seen = Set([tool.id])
        var related: [Tool] = []
        for id in tool.related {
            let target = id == "audio-analyze-studio"
                ? byID["song-metadata-analyzer"]
                : (accessibilityStudio(for: id) ?? byID[id])
            guard let target, !target.isPlanned, seen.insert(target.id).inserted else { continue }
            related.append(target)
            if related.count >= limit { break }
        }
        if related.count >= limit { return Array(related.prefix(limit)) }

        // Web exposes only Studio workspaces in the Developer category. Other categories
        // use the full discoverable catalogue, with Accessibility variants canonicalized above.
        let fallbackCandidates = tool.category == "developer" ? developerStudioTools() : candidates
        var fallbackIDs = Set<String>()
        let rest = fallbackCandidates
            .filter { $0.category == tool.category && !seen.contains($0.id) && !$0.isPlanned && fallbackIDs.insert($0.id).inserted }
            .sorted {
                if tool.category == "developer" {
                    return $0.popularity == $1.popularity ? $0.id < $1.id : $0.popularity > $1.popularity
                }
                let left = relatedAlphabeticalKey($0.name)
                let right = relatedAlphabeticalKey($1.name)
                return left == right ? $0.id < $1.id : left < right
            }
        return Array((related + rest).prefix(limit))
    }
}

enum CatalogLoadState: Equatable {
    case loading
    case ready
    case failed
}

enum CatalogLoader {
    static func load(from bundle: Bundle = .main) throws -> Catalog {
        guard let url = bundle.url(forResource: "catalog", withExtension: "json") else {
            throw CocoaError(.fileNoSuchFile)
        }
        let data = try Data(contentsOf: url)
        let catalog = try JSONDecoder().decode(Catalog.self, from: data)
        guard !catalog.tools.isEmpty else { throw CocoaError(.fileReadCorruptFile) }
        return catalog.nativeFacing().includingMusicDownloader().includingSongMetadataAnalyzer().includingABook().includingZipArchive().includingFileWorkspaceTools().includingCameraStudio().includingDateTimeExtensions()
    }
}

final class CatalogStore: ObservableObject {
    @Published private(set) var catalog: Catalog
    @Published private(set) var loadState: CatalogLoadState
    @Published var query = ""
    @Published var selectedCategory: String?
    @Published private(set) var favoriteIDs: Set<String>
    @Published private(set) var recentIDs: [String]
    @Published private(set) var usageCounts: [String: Int]

    private let favoritesKey = "env.favoriteToolIDs"
    private let recentKey = "env.recentToolIDs"
    private let usageKey = "env.toolUseCounts"

    private let bundle: Bundle

    init(catalog: Catalog? = nil, bundle: Bundle = .main) {
        self.bundle = bundle
        self.catalog = catalog ?? Catalog(schemaVersion: 1, catalogVersion: "loading", counts: CatalogCounts(total: 0, active: 0, planned: 0, categories: 0), categories: [], tools: [], relatedReferenceTools: nil)
        self.loadState = catalog == nil ? .loading : .ready
        let canonical: (String) -> String = { $0 == "audio-analyze-studio" ? "song-metadata-analyzer" : $0 }
        self.favoriteIDs = Set((UserDefaults.standard.stringArray(forKey: favoritesKey) ?? []).map(canonical))
        self.recentIDs = Array(NSOrderedSet(array: (UserDefaults.standard.stringArray(forKey: recentKey) ?? []).map(canonical)).array.compactMap { $0 as? String }.prefix(24))
        var counts = UserDefaults.standard.dictionary(forKey: usageKey)?.compactMapValues { $0 as? Int } ?? [:]
        if let old = counts.removeValue(forKey: "audio-analyze-studio") { counts["song-metadata-analyzer", default: 0] += old }
        self.usageCounts = counts
        UserDefaults.standard.set(Array(favoriteIDs).sorted(), forKey: favoritesKey)
        UserDefaults.standard.set(recentIDs, forKey: recentKey)
        UserDefaults.standard.set(usageCounts, forKey: usageKey)
        if catalog == nil { reloadCatalog() }
    }

    func reloadCatalog() {
        loadState = .loading
        let sourceBundle = bundle
        DispatchQueue.global(qos: .userInitiated).async {
            let result = Result { try CatalogLoader.load(from: sourceBundle) }
            DispatchQueue.main.async {
                switch result {
                case .success(let loaded):
                    self.catalog = loaded
                    self.loadState = .ready
                case .failure:
                    self.loadState = .failed
                }
            }
        }
    }

    var categories: [ToolCategory] { catalog.categories }
    var mostUsedIDs: [String] {
        Set(recentIDs).union(usageCounts.keys).sorted { left, right in
            let leftCount = usageCounts[left, default: 0]
            let rightCount = usageCounts[right, default: 0]
            if leftCount != rightCount { return leftCount > rightCount }
            let leftRecent = recentIDs.firstIndex(of: left) ?? Int.max
            let rightRecent = recentIDs.firstIndex(of: right) ?? Int.max
            if leftRecent != rightRecent { return leftRecent < rightRecent }
            return left < right
        }
    }
    var favoriteTools: [Tool] {
        let matches = (catalog.tools + (catalog.relatedReferenceTools ?? []) + catalog.developerStudioTools()).filter { favoriteIDs.contains($0.id) }
        var seen = Set<String>()
        return matches.compactMap { catalog.accessibilityStudio(for: $0.id) ?? catalog.canonicalDeveloperStudio(for: $0.id) ?? $0 }.filter { seen.insert($0.id).inserted }.sorted { $0.name < $1.name }
    }
    var featuredTools: [Tool] { ((catalog.tools + (catalog.relatedReferenceTools ?? [])) + catalog.developerStudioTools()).filter(\.featured).sorted { $0.popularity > $1.popularity } }
    var popularTools: [Tool] { (catalog.accessibilityDiscoveryTools() + catalog.developerStudioTools()).sorted { $0.popularity == $1.popularity ? $0.name < $1.name : $0.popularity > $1.popularity } }

    func tools(matching query: String = "", category: String? = nil) -> [Tool] {
        catalog.webSearch(query, limit: Int.max, includeRelatedReferences: true)
            .filter { category == nil || $0.category == category }
    }

    func toggleFavorite(_ tool: Tool) {
        if favoriteIDs.contains(tool.id) { favoriteIDs.remove(tool.id) } else { favoriteIDs.insert(tool.id) }
        UserDefaults.standard.set(Array(favoriteIDs).sorted(), forKey: favoritesKey)
        objectWillChange.send()
    }

    func recordRecent(_ toolID: String) {
        guard !toolID.isEmpty else { return }
        let next = Array(([toolID] + recentIDs.filter { $0 != toolID }).prefix(24))
        recentIDs = next
        usageCounts[toolID] = min(usageCounts[toolID, default: 0] + 1, 1_000_000)
        UserDefaults.standard.set(recentIDs, forKey: recentKey)
        UserDefaults.standard.set(usageCounts, forKey: usageKey)
    }

    func isFavorite(_ tool: Tool) -> Bool { favoriteIDs.contains(tool.id) }
    func category(named id: String) -> ToolCategory? { categories.first { $0.id == id } }
}
import Foundation

private struct AccessibilityStudioSpec {
    let id: String
    let sourceID: String
    let slug: String
    let name: String
    let description: String
    let aliases: [String]
    let keywords: [String]
}

private let accessibilityStudioSpecs: [AccessibilityStudioSpec] = [
    .init(id: "contrast-checker", sourceID: "contrast-checker", slug: "color-contrast-studio", name: "Color Contrast Studio", description: "WCAG 2.2 + APCA side-by-side, one-click color fixes, full color-vision simulation, multi-surface preview, and CSS/Tailwind export — all local, no upload.", aliases: ["contrast", "accessible-color", "color-blindness"], keywords: ["wcag", "wcag 2.2", "apca", "contrast ratio", "colour", "color", "alpha", "transparency", "protanopia", "deuteranopia", "tritanopia", "achromatopsia", "tailwind", "css variables", "fix color", "color blindness", "local", "privacy"]),
    .init(id: "alt-text-checker", sourceID: "alt-text-checker", slug: "alt-text-studio", name: "Alt Text Studio", description: "Review image alternatives, draft concise descriptions, preview announcements, and triage batches on-device.", aliases: ["alt-text"], keywords: ["image description", "alternative text", "screen reader", "decorative image", "bulk images"]),
    .init(id: "focus-state-checker", sourceID: "focus-state-checker", slug: "focus-state-studio", name: "Focus State Studio", description: "Generate modern :focus-visible CSS, live keyboard playground, dark and forced-colors previews — free features others often lock behind paywalls.", aliases: ["focus-state"], keywords: ["focus visible", "focus ring", "keyboard focus", "high contrast", "forced colors", "tab playground", "CSV export", "JSON report", "local"]),
    .init(id: "text-readability-checker", sourceID: "text-readability-checker", slug: "text-readability-studio", name: "Text & Readability Studio", description: "Estimate reading difficulty, create reviewable plain-language drafts, and test type scale and spacing.", aliases: ["text-readability", "font-size", "line-height"], keywords: ["plain language", "simplify", "flesch", "gunning fog", "font size", "line height", "text spacing", "zoom"]),
    .init(id: "aria-checker", sourceID: "aria-checker", slug: "aria-studio", name: "ARIA Studio", description: "Inspect ARIA names and states, generate common patterns, and preview a local approximation of the accessibility tree.", aliases: ["aria"], keywords: ["accessible name", "role", "state", "aria-label", "aria-labelledby", "accessibility tree", "dialog", "tabs"]),
    .init(id: "motion-checker", sourceID: "motion-checker", slug: "motion-reduced-motion-studio", name: "Motion & Reduced Motion Studio", description: "Review motion CSS and exercise reduced-motion alternatives without leaving your device.", aliases: ["motion"], keywords: ["animation", "transition", "prefers-reduced-motion", "vestibular", "flash"]),
    .init(id: "keyboard-navigation-checker", sourceID: "keyboard-navigation-checker", slug: "keyboard-navigation-studio", name: "Keyboard Navigation Studio", description: "Keyboard-operability risks, logical focus order practice, and trap detection with copyable source-evidence reports.", aliases: ["keyboard-navigation"], keywords: ["tab order", "keyboard only", "tabindex", "keyboard trap", "enter", "space", "escape", "CSV export", "JSON report"]),
    .init(id: "form-checker", sourceID: "form-checker", slug: "form-accessibility-studio", name: "Form Accessibility Studio", description: "Review field labels and error descriptions, then practice an accessible local validation flow.", aliases: ["form"], keywords: ["form labels", "validation", "error message", "aria-invalid", "aria-describedby", "input"]),
]

private func accessibilityBaseKind(_ id: String) -> String {
    id.replacingOccurrences(of: "-(checker|generator|helper|preview|simulator)$", with: "", options: .regularExpression)
}

extension Catalog {
    private func makeStudio(_ spec: AccessibilityStudioSpec) -> Tool? {
        guard let source = (tools + (relatedReferenceTools ?? [])).first(where: { $0.id == spec.sourceID }) else { return nil }
        return Tool(
            id: source.id, name: spec.name, slug: spec.slug, description: NativeCopy.text(spec.description),
            category: "accessibility", subcategory: source.subcategory,
            keywords: Array(Set(source.keywords + spec.keywords + spec.aliases)).sorted(),
            tags: ["accessibility", "studio"] + spec.aliases, icon: source.icon,
            popularity: source.popularity, featured: source.featured, clientSide: source.clientSide,
            requiresBackend: source.requiresBackend, requiresAuth: source.requiresAuth,
            status: source.status, disclaimer: source.disclaimer,
            related: accessibilityStudioSpecs.filter { $0.id != spec.id }.map(\.id), engine: source.engine
        )
    }

    func accessibilityDiscoveryTools() -> [Tool] {
        (tools + (relatedReferenceTools ?? [])).filter { $0.category != "accessibility" } + accessibilityStudioSpecs.compactMap(makeStudio)
    }

    func accessibilityStudio(for toolID: String) -> Tool? {
        let kind = accessibilityBaseKind(toolID)
        guard let spec = accessibilityStudioSpecs.first(where: { $0.aliases.contains(kind) }) else { return nil }
        return makeStudio(spec)
    }

    func displayTool(for toolID: String) -> Tool? {
        accessibilityStudio(for: toolID) ?? canonicalDeveloperStudio(for: toolID) ?? tools.first(where: { $0.id == toolID }) ?? (relatedReferenceTools ?? []).first(where: { $0.id == toolID })
    }
}

// MARK: - Native Developer Studios
// These Swift-native catalog projections add the Studio discovery layer while
// preserving every historical tool ID, slug, and source engine implementation.
struct NativeDeveloperStudioMode: Identifiable, Hashable {
    let key: String
    let label: String
    let op: String
    let decodeOp: String?
    var id: String { key }
    init(_ key: String, _ label: String, _ op: String, _ decodeOp: String? = nil) {
        self.key = key; self.label = label; self.op = op; self.decodeOp = decodeOp
    }
}

struct NativeDeveloperStudioSpec: Identifiable, Hashable {
    let id: String
    let sourceID: String
    let slug: String
    let name: String
    let description: String
    let icon: String
    let keywords: [String]
    let modes: [NativeDeveloperStudioMode]
}

let nativeDeveloperStudioSpecs: [NativeDeveloperStudioSpec] = [
    .init(id:"the-world-lab",sourceID:"javascript-formatter",slug:"the-world-lab",
          name:"The World Lab",
          description:"Native 3D inspection and bounded offline scientific reference experiments.",
          icon:"Orbit",keywords:["world lab","science","materials","physics","3d"],
          modes:[.init("workspace","Workspace","the-world-lab")]),
    .init(id: "json-studio", sourceID: "json-formatter", slug: "json-studio", name: "JSON Studio", description: "Format, validate, compare, inspect, query, and convert structured data locally while preserving large integer tokens and explaining parser caveats.", icon: "Braces", keywords: ["json","format","minify","validate","diff","path","tree","csv","schema","large integer","duplicate key","offline","privacy"], modes: [.init("format", "Format", "json-formatter"), .init("minify", "Minify", "json-minifier"), .init("validate", "Validate", "json-validator"), .init("diff", "Diff", "json-diff"), .init("path", "Path / Search", "json-path-query"), .init("tree", "Tree / Inspect", "json-inspector"), .init("schema", "Schema", "developer-json-schema-generator"), .init("convert", "Convert to CSV", "json-to-csv"), .init("csv", "CSV tools", "csv-formatter")]),
    .init(id: "jwt-studio", sourceID: "jwt-decoder", slug: "jwt-studio", name: "JWT Studio", description: "Decode tokens and inspect registered claims locally. Decoding never proves trust or signature validity.", icon: "ShieldCheck", keywords: ["jwt", "token", "claims", "expiration", "privacy"], modes: [.init("decode", "Decode", "jwt-decoder"), .init("expiration", "Expiration", "jwt-expiration-checker"), .init("claims", "Claims inspector", "jwt-inspector"), .init("payload", "Payload builder", "developer-jwt-payload-generator")]),
    .init(id: "regex-studio", sourceID: "regex-tester", slug: "regex-studio", name: "Regex Studio", description: "Test JavaScript regular expressions against multiple cases, inspect numbered and named captures, preview replacements, and review portability and backtracking risks.", icon: "Regex", keywords: ["regex","regular expression","replace","capture group","match","flags","benchmark","pipeline","JavaScript RegExp"], modes: [.init("match", "Match / Test", "regex-tester"), .init("replace", "Replace", "regex-replace"), .init("explain", "Explain", "developer-regex-explainer")]),
    .init(id: "hash-studio", sourceID: "sha256-hash", slug: "hash-studio", name: "Hash Studio", description: "Calculate MD5 and SHA-family digests side by side, compare digest strings, or hash a local file without uploading its bytes. Hashes are not encryption.", icon: "Fingerprint", keywords: ["hash","sha256","sha-256","md5","sha-1","sha-384","sha-512","file hash","digest","checksum"], modes: [.init("hash", "Multi-hash", "hash-generator"), .init("compare", "Compare", "hash-compare"), .init("file", "File hash", "file-hash-calculator")]),
    .init(id: "encoding-studio", sourceID: "base64-encoder", slug: "encoding-studio", name: "Encoding Studio", description: "Encode and decode UTF-8 data across common web, text, and binary representations entirely on-device.", icon: "ArrowLeftRight", keywords: ["encoding", "decoding", "base64", "url", "html", "hex", "binary", "unicode"], modes: [.init("base64", "Base64", "base64-encoder", "base64-decoder"), .init("url", "URL", "url-encoder", "url-decoder"), .init("html", "HTML entities", "html-encoder", "html-decoder"), .init("hex", "Hex", "hex-encoder", "hex-decoder"), .init("binary", "Binary", "binary-encoder", "binary-decoder"), .init("ascii", "ASCII", "ascii-encoder", "ascii-decoder"), .init("unicode", "Unicode", "unicode-encoder", "unicode-decoder"), .init("data-uri", "Data URI", "data-uri-generator", "developer-data-uri-decoder")]),
    .init(id: "time-cron-studio", sourceID: "cron-parser", slug: "time-cron-studio", name: "Time & Cron Studio", description: "Convert Unix timestamps and explain five-field cron schedules with upcoming times without contacting a scheduler.", icon: "Clock", keywords: ["cron", "timestamp", "unix", "UTC", "schedule"], modes: [.init("timestamp", "Timestamp", "unix-timestamp-converter"), .init("explain", "Cron explain", "cron-explainer"), .init("next-runs", "Next runs", "cron-parser"), .init("presets", "Presets", "cron-generator")]),
    .init(id: "uuid-studio", sourceID: "uuid-generator", slug: "uuid-studio", name: "UUID Studio", description: "Generate UUID v4 batches and validate UUID shape, variant, and version bits locally.", icon: "Fingerprint", keywords: ["uuid", "guid", "v4", "batch", "validate"], modes: [.init("generate", "Generate batch", "uuid-generator"), .init("validate", "Validate", "uuid-validator")]),
    .init(id: "sql-studio", sourceID: "sql-formatter", slug: "sql-studio", name: "SQL Studio", description: "Format and minify SQL using an explicit dialect. Queries are never executed; formatting is not full grammar validation.", icon: "Database", keywords: ["sql", "format", "minify", "dialect", "join", "group by"], modes: [.init("format", "Format", "sql-formatter"), .init("minify", "Minify", "sql-minifier"), .init("parse", "Parse feedback", "sql-parser"), .init("query", "Query builder", "developer-sql-query-builder"), .init("schema", "Schema generator", "developer-sql-schema-generator")]),
    .init(id: "markup-studio", sourceID: "javascript-formatter", slug: "markup-studio", name: "Markup & Style Studio", description: "Format and inspect HTML, CSS, JavaScript, XML, YAML, and Markdown locally. Formatting is not code execution or a security audit.", icon: "FileCode", keywords: ["html", "css", "javascript", "xml", "yaml", "markdown"], modes: [.init("html", "HTML", "html-beautifier"), .init("css", "CSS", "css-beautifier"), .init("javascript", "JavaScript", "javascript-formatter"), .init("xml", "XML", "xml-beautifier"), .init("yaml", "YAML", "yaml-formatter"), .init("markdown", "Markdown preview", "markdown-preview"), .init("samples", "Sample content", "lorem-ipsum-generator")]),
    .init(id: "http-api-studio", sourceID: "http-status-lookup", slug: "http-api-studio", name: "HTTP & API Studio", description: "Look up HTTP status codes, inspect query strings and content types, and draft header/security references locally.", icon: "Network", keywords: ["http", "api", "status", "418", "headers", "query", "mime", "cors", "csp"], modes: [.init("status", "Status codes", "http-status-lookup"), .init("headers", "Headers", "developer-http-header-builder"), .init("query", "Query string", "query-string-parser"), .init("mime", "MIME types", "developer-content-type-lookup"), .init("cors", "CORS", "developer-cors-header-helper"), .init("csp", "CSP", "developer-csp-header-generator"), .init("cookies", "Cookies", "developer-cookie-parser"), .init("user-agent", "User-Agent", "user-agent-parser")]),
    .init(id: "devops-studio", sourceID: "developer-gitignore-generator", slug: "devops-studio", name: "DevOps Config Studio", description: "Generate copy-ready project config, container files, starter docs, API schemas, and release metadata with editable presets.", icon: "Container", keywords: ["devops", "docker", "compose", "nginx", "gitignore", "openapi", "graphql", "readme", "semver", "Google Play", "Android upload key", "JKS", "keystore", "signing key"], modes: [.init("gitignore", ".gitignore", "developer-gitignore-generator"), .init("dockerfile", "Dockerfile", "developer-dockerfile-helper"), .init("compose", "Compose", "developer-docker-compose-generator"), .init("nginx", "Nginx", "developer-nginx-config-generator"), .init("editorconfig", "EditorConfig", "developer-editorconfig-generator"), .init("env", ".env example", "developer-environment-variable-generator"), .init("openapi", "OpenAPI", "developer-openapi-example-generator"), .init("graphql", "GraphQL", "developer-graphql-query-builder"), .init("license", "License", "developer-license-generator"), .init("readme", "README", "developer-readme-generator"), .init("commit", "Commit message", "developer-commit-message-helper"), .init("branch", "Branch name", "developer-branch-name-generator"), .init("changelog", "Changelog", "developer-changelog-generator"), .init("semver", "Semver", "developer-semantic-version-calculator"), .init("mock", "API / webhook fixtures", "developer-api-mock-response-generator"), .init("google-signing-key", "Google signing key", "google-signing-key-generator")]),
    .init(id: "ux-ui-studio", sourceID: "javascript-formatter", slug: "ux-ui-studio", name: "UX/UI Studio", description: "Design mobile interfaces and desktop websites with exact layer geometry, typography, spacing, colors, searchable icon identifiers, and PDF/JSON AI handoff.", icon: "PanelsTopLeft", keywords: ["ux", "ui", "design", "wireframe", "mobile", "desktop", "components", "icons", "typography", "spacing", "tokens", "PDF", "AI prompt"], modes: [.init("workspace", "Workspace", "ux-ui-studio"), .init("components", "Components", "ux-ui-components"), .init("icons", "Icon library", "ux-ui-icons"), .init("tokens", "Design tokens", "ux-ui-tokens"), .init("presets", "Starter layouts", "ux-ui-presets")]),
    .init(id: "diff-inspect-studio", sourceID: "json-diff", slug: "diff-inspect-studio", name: "Diff & Inspect Studio", description: "Compare text, JSON, and YAML; inspect structure; preview data; and compose bounded deterministic transforms into a per-step-audited local recipe.", icon: "GitCompare", keywords: ["diff", "compare", "inspect", "structure", "preview", "recipe", "pipeline", "workflow"], modes: [.init("text-diff", "Text diff", "text-diff"), .init("json-diff", "JSON diff", "json-diff"), .init("yaml-diff", "YAML diff", "yaml-diff"), .init("inspect", "Structure inspector", "json-inspector"), .init("preview", "Preview", "markdown-preview"), .init("test", "JSON tester", "json-tester"), .init("recipe", "Recipe pipeline", "developer-recipe-runner")]),
]

extension Catalog {
    func canonicalDeveloperStudio(for toolID: String) -> Tool? {
        guard nativeDeveloperStudioSpecs.contains(where: { $0.id == toolID || $0.slug == toolID }) else { return nil }
        return developerStudioTools().first { $0.id == toolID || $0.slug == toolID }
    }

    func developerStudioTools() -> [Tool] {
        nativeDeveloperStudioSpecs.compactMap { spec in
            guard let source = (tools + (relatedReferenceTools ?? [])).first(where: { $0.id == spec.sourceID }) else { return nil }
            return Tool(id: spec.id, name: spec.name, slug: spec.slug, description: NativeCopy.text(spec.description), category: "developer", subcategory: source.subcategory,
                        keywords: Array(Set(source.keywords + spec.keywords + ["studio", "offline", "privacy"])).sorted(), tags: Array(Set(source.tags + ["developer-studio", spec.id])).sorted(), icon: spec.icon,
                        popularity: 1_000_000 - (nativeDeveloperStudioSpecs.firstIndex(of: spec) ?? 0), featured: true, clientSide: true, requiresBackend: false, requiresAuth: false,
                        status: source.status, disclaimer: source.disclaimer, related: nativeDeveloperStudioSpecs.filter { $0.id != spec.id }.map(\.id),
                        engine: ToolEngine(type: "developer", id: source.engine.id, op: spec.modes.first?.op, configuration: source.engine.configuration))
        }
    }

    func developerStudio(for toolID: String) -> Tool? {
        let id = toolID.lowercased().replacingOccurrences(of: "^developer-", with: "", options: .regularExpression)
        let target: String
        if ["yaml-diff", "text-diff", "csv-diff"].contains(id) || id.range(of: "^(yaml|text|csv|xml|html|css|sql|base64|url|hex|binary|ascii|unicode|uuid|jwt|regex)-diff$", options: .regularExpression) != nil { target = "diff-inspect-studio" }
        else if id.hasPrefix("jwt") { target = "jwt-studio" }
        else if id.hasPrefix("regex") { target = "regex-studio" }
        else if ["hash", "md5", "file-hash", "sha1", "sha256", "sha384", "sha512"].contains(where: { id == $0 || id.hasPrefix($0 + "-") }) { target = "hash-studio" }
        else if ["query-string", "url-query", "cookie", "cors", "csp", "ip-header", "status-code", "user-agent", "content-type", "mime", "http"].contains(where: { id == $0 || id.hasPrefix($0 + "-") }) { target = "http-api-studio" }
        else if ["base64", "url", "uri", "hex", "binary", "ascii", "unicode", "data-uri"].contains(where: { id == $0 || id.hasPrefix($0 + "-") }) || ["json-decoder", "json-encoder", "html-decoder", "html-encoder"].contains(id) { target = "encoding-studio" }
        else if ["cron", "unix-timestamp", "timestamp", "epoch"].contains(where: { id == $0 || id.hasPrefix($0 + "-") }) { target = "time-cron-studio" }
        else if id.hasPrefix("uuid") { target = "uuid-studio" }
        else if id.hasPrefix("sql") { target = "sql-studio" }
        else if id.hasPrefix("csv") || id.hasPrefix("json") || id.hasPrefix("dummy-json") { target = "json-studio" }
        else if ["html", "css", "javascript", "typescript", "xml", "svg", "yaml", "markdown", "lorem-ipsum"].contains(where: { id == $0 || id.hasPrefix($0 + "-") }) { target = "markup-studio" }
        else if ["gitignore", "git", "docker", "dockerfile", "kubernetes", "nginx", "openapi", "graphql", "license", "readme", "editorconfig", "environment-variable", "semantic-version", "branch-name", "commit-message", "changelog", "webhook", "api-mock", "sql-query-builder", "sql-schema-generator"].contains(where: { id == $0 || id.hasPrefix($0 + "-") }) { target = "devops-studio" }
        else { target = "diff-inspect-studio" }
        return developerStudioTools().first { $0.id == target }
    }

    func developerStudio(forLegacyTool tool: Tool) -> Tool? {
        guard tool.category == "developer", !tool.tags.contains("developer-studio") else { return nil }
        return developerStudio(for: tool.slug)
    }

    func developerModeForLegacySlug(_ rawSlug: String) -> String {
        let slug = rawSlug.lowercased().replacingOccurrences(of: "^developer-", with: "", options: .regularExpression)
        let studio = developerStudio(for: slug)
        let selected: String
        switch studio?.id ?? "" {
        case "json-studio":
            if slug.hasPrefix("csv-") { selected = "csv" }
            else if slug.contains("diff") { selected = "diff" }
            else if slug.contains("path") || slug.contains("query") { selected = "path" }
            else if ["inspector", "parser", "tree", "preview"].contains(where: { slug.contains($0) }) { selected = "tree" }
            else if slug.contains("schema") { selected = "schema" }
            else if slug.contains("to-csv") { selected = "convert" }
            else if slug.contains("csv") { selected = "csv" }
            else if slug.contains("validator") || slug.contains("tester") { selected = "validate" }
            else if slug.contains("minifier") { selected = "minify" }
            else { selected = "format" }
        case "jwt-studio":
            if slug.contains("expiration") || slug.contains("expiry") || slug.contains("exp-check") { selected = "expiration" }
            else if slug.contains("payload") || slug.contains("builder") { selected = "payload" }
            else if slug.contains("inspector") || slug.contains("claims") { selected = "claims" }
            else { selected = "decode" }
        case "regex-studio":
            selected = slug.contains("replace") ? "replace" : (slug.contains("explain") ? "explain" : "match")
        case "hash-studio":
            selected = (slug.contains("file-hash") || slug.contains("file-hasher")) ? "file" : (slug.contains("compare") ? "compare" : "hash")
        case "encoding-studio":
            if slug.contains("data-uri") { selected = "data-uri" }
            else if slug.contains("hex") { selected = "hex" }
            else if slug.contains("binary") { selected = "binary" }
            else if slug.contains("ascii") { selected = "ascii" }
            else if slug.contains("unicode") { selected = "unicode" }
            else if slug.hasPrefix("html-") { selected = "html" }
            else if slug.contains("base64") || ["json-decoder", "json-encoder"].contains(slug) { selected = "base64" }
            else { selected = "url" }
        case "time-cron-studio":
            if slug.contains("timestamp") || slug.contains("epoch") { selected = "timestamp" }
            else if slug.contains("generator") || slug.contains("preset") { selected = "presets" }
            else if slug.contains("explain") { selected = "explain" }
            else { selected = "next-runs" }
        case "uuid-studio":
            selected = (slug.contains("validator") || slug.contains("tester")) ? "validate" : "generate"
        case "sql-studio":
            if slug.contains("query-builder") { selected = "query" }
            else if slug.contains("schema-generator") { selected = "schema" }
            else if slug.contains("minifier") { selected = "minify" }
            else if slug.contains("parser") || slug.contains("validator") || slug.contains("tester") { selected = "parse" }
            else { selected = "format" }
        case "markup-studio":
            if slug.hasPrefix("css-") { selected = "css" }
            else if slug.hasPrefix("javascript-") || slug.hasPrefix("typescript-") { selected = "javascript" }
            else if slug.hasPrefix("xml-") || slug.hasPrefix("svg-") { selected = "xml" }
            else if slug.hasPrefix("yaml-") { selected = "yaml" }
            else if slug.hasPrefix("lorem-ipsum") { selected = "samples" }
            else if slug.hasPrefix("markdown") { selected = "markdown" }
            else { selected = "html" }
        case "http-api-studio":
            if slug.contains("query") { selected = "query" }
            else if slug.contains("mime") || slug.contains("content-type") { selected = "mime" }
            else if slug.contains("cors") { selected = "cors" }
            else if slug.contains("csp") { selected = "csp" }
            else if slug.contains("cookie") { selected = "cookies" }
            else if slug.contains("user-agent") { selected = "user-agent" }
            else if slug.contains("header") { selected = "headers" }
            else { selected = "status" }
        case "devops-studio":
            if slug.contains("dockerfile") { selected = "dockerfile" }
            else if slug.contains("docker-compose") || slug.contains("compose") { selected = "compose" }
            else if slug.contains("nginx") { selected = "nginx" }
            else if slug.contains("editorconfig") { selected = "editorconfig" }
            else if slug.contains("environment") || slug.contains(".env") { selected = "env" }
            else if slug.contains("openapi") { selected = "openapi" }
            else if slug.contains("graphql") { selected = "graphql" }
            else if slug.contains("license") { selected = "license" }
            else if slug.contains("readme") { selected = "readme" }
            else if slug.contains("commit") { selected = "commit" }
            else if slug.contains("branch") { selected = "branch" }
            else if slug.contains("changelog") { selected = "changelog" }
            else if slug.contains("semantic-version") || slug.contains("semver") { selected = "semver" }
            else if slug.contains("api-mock") || slug.contains("webhook") { selected = "mock" }
            else { selected = "gitignore" }
        case "diff-inspect-studio":
            if slug.hasPrefix("json-") { selected = slug.contains("diff") ? "json-diff" : (["inspector", "parser", "preview", "tester", "explainer"].contains(where: { slug.contains($0) }) ? "inspect" : "text-diff") }
            else if slug.hasPrefix("yaml-") { selected = "yaml-diff" }
            else if slug.hasPrefix("markdown") { selected = "preview" }
            else if ["inspector", "parser", "tester"].contains(where: { slug.contains($0) }) { selected = "inspect" }
            else { selected = "text-diff" }
        default:
            selected = studio?.id == "diff-inspect-studio"
                ? "text-diff"
                : (nativeDeveloperStudioSpecs.first(where: { $0.id == studio?.id })?.modes.first?.key ?? "format")
        }
        guard let spec = nativeDeveloperStudioSpecs.first(where: { $0.id == studio?.id }),
              spec.modes.contains(where: { $0.key == selected }) else {
            return nativeDeveloperStudioSpecs.first(where: { $0.id == studio?.id })?.modes.first?.key ?? "format"
        }
        return selected
    }
}

extension Catalog {
    /// Adds Date & Time tools backed by the local Swift engine while older bundled catalogues roll forward.
    func includingDateTimeExtensions() -> Catalog {
        let definitions: [(String, String, String, String, [String], [String], Int, Bool, String, [String])] = [
            ("age-calculator", "Age Calculator", "age-calculator", "Calculate your age in years, months, and days.", ["age", "calculator", "years", "months", "days", "birthday"], ["age", "calculator", "date"], 83, false, "age", ["birthday-countdown", "date-difference", "time-until-calculator"]),
            ("date-calculator", "Date Calculator", "date-calculator", "Add or subtract years, months, weeks, and days from a date.", ["date", "calculator", "add", "subtract", "years", "months", "weeks", "days"], ["date", "arithmetic", "add", "subtract"], 84, false, "date-add", ["date-difference", "workday-calculator", "business-day-calculator"]),
            ("duration-calculator", "Duration Calculator", "duration-calculator", "Calculate exact elapsed time between two date and time values.", ["duration", "elapsed", "time", "hours", "minutes", "seconds"], ["duration", "elapsed-time", "date"], 85, false, "duration", ["date-difference", "countdown", "time-until-calculator"]),
            ("meeting-time-planner", "Meeting Time Planner", "meeting-time-planner", "Find shared working-hour slots across cities and export an ICS invite.", ["meeting", "planner", "timezone", "working", "hours", "calendar", "ics"], ["meeting", "timezone", "planner", "calendar"], 91, true, "meeting-planner", ["timezone-converter", "world-clock", "countdown"])
        ]
        let existing = Set(tools.map(\.id))
        let additions = definitions.filter { !existing.contains($0.0) }.map { item in
            Tool(
                id: item.0,
                name: item.1,
                slug: item.2,
                description: item.3,
                category: "datetime",
                subcategory: nil,
                keywords: item.4,
                tags: item.5,
                icon: "Calendar",
                popularity: item.6,
                featured: item.7,
                clientSide: true,
                requiresBackend: false,
                requiresAuth: false,
                status: "active",
                disclaimer: nil,
                related: item.9,
                engine: ToolEngine(type: "datetime", id: nil, op: item.8, configuration: [:])
            )
        }
        guard !additions.isEmpty else { return self }
        let updated = (tools + additions).sorted {
            let leftCategory = $0.category.lowercased()
            let rightCategory = $1.category.lowercased()
            return leftCategory == rightCategory
                ? ($0.name.localizedCaseInsensitiveCompare($1.name) == .orderedAscending)
                : leftCategory < rightCategory
        }
        return Catalog(
            schemaVersion: schemaVersion,
            catalogVersion: catalogVersion,
            counts: CatalogCounts(
                total: updated.count,
                active: updated.filter { $0.status == "active" || $0.status == "beta" }.count,
                planned: updated.filter { $0.isPlanned }.count,
                categories: categories.count
            ),
            categories: categories,
            tools: updated,
            relatedReferenceTools: relatedReferenceTools
        )
    }
}

