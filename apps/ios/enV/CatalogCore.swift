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
    var isUnderProduction: Bool {
        !["accessibility", "audio", "business", "calculators", "developer", "video"].contains(category.lowercased())
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
            name: name,
            slug: slug,
            description: NativeCopy.text(description),
            category: category,
            subcategory: subcategory,
            keywords: keywords,
            tags: tags,
            icon: icon,
            popularity: popularity,
            featured: featured,
            clientSide: clientSide,
            requiresBackend: requiresBackend,
            requiresAuth: requiresAuth,
            status: status,
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
        let nativeTools = tools
            .filter { !NativeCopy.isWebRuntimeOnly($0.id) }
            .map { $0.nativeFacing() }
        let relatedReferences = (relatedReferenceTools ?? []) + tools
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
            description: "Download direct audio files online or import and organize tracks for offline use.",
            category: "audio",
            subcategory: "Music",
            keywords: ["music", "download", "offline", "online", "track", "album", "playlist", "audio"],
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
            engine: ToolEngine(type: "custom", id: "music-downloader", op: "music-downloader", configuration: [:])
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
            relatedReferenceTools: relatedReferenceTools
        )
    }
}

extension Catalog {
    func webSearch(_ query: String, limit: Int = Int.max, includeRelatedReferences: Bool = false) -> [Tool] {
        let q = query.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        let sourceCandidates = includeRelatedReferences ? tools + (relatedReferenceTools ?? []) : tools
        let candidates = sourceCandidates.filter { $0.category != "accessibility" && !$0.tags.contains("developer-studio") } + accessibilityDiscoveryTools().filter { $0.category == "accessibility" } + developerStudioTools()
        if q.isEmpty {
            return Array(candidates.enumerated().sorted {
                $0.element.popularity == $1.element.popularity ? $0.offset < $1.offset : $0.element.popularity > $1.element.popularity
            }.prefix(limit).map { $0.element })
        }
        let synonyms: [String: [String]] = [
            "photo": ["image", "picture", "pic"], "picture": ["image", "photo"], "pic": ["image", "photo"],
            "img": ["image"], "compress": ["minify", "shrink", "optimize", "size"], "resize": ["scale", "dimensions", "size"],
            "json": ["javascript object"], "pwd": ["password"], "pass": ["password"], "bmi": ["body mass", "weight"],
            "percent": ["percentage", "%"], "qr": ["qrcode", "barcode"], "uuid": ["guid"],
            "hash": ["checksum", "digest", "sha", "md5"], "color": ["colour", "hex", "rgb"],
            "mockup": ["fake", "demo", "chat", "screenshot"], "invoice": ["bill", "receipt"], "pdf": ["document"],
            "encode": ["encoding", "base64"], "decode": ["decoding"],
            "a11y": ["accessibility"], "contrast": ["color contrast", "wcag"],
            "alt": ["alt-text", "image description"], "focus": ["focus ring", "focus state"],
            "aria": ["accessible name", "accessibility tree"], "tab": ["keyboard navigation", "tab order"],
            "animation": ["motion", "reduced motion"], "readability": ["plain language", "text spacing"],
        ]
        let tokens = q.unicodeScalars.split { scalar in
            !((scalar.value >= 97 && scalar.value <= 122) || (scalar.value >= 48 && scalar.value <= 57) || scalar.value == 37 || scalar.value == 43)
        }.map { String($0) }.filter { $0.count > 1 || $0 == "%" }
        let expanded = Set(tokens + tokens.flatMap { synonyms[$0] ?? [] })
        func score(_ tool: Tool) -> Int {
            let name = tool.name.lowercased()
            if name == q || tool.id == q { return 2000 + tool.popularity }
            if name.hasPrefix(q) { return 1400 + tool.popularity }
            if tool.id.contains(q) || name.contains(q) { return 1000 + tool.popularity }
            let haystack = ([tool.name, tool.description, tool.category, tool.subcategory ?? "", tool.id] + tool.keywords + tool.tags).joined(separator: " ").lowercased()
            var hits = 0
            for token in expanded {
                if name.contains(token) { hits += 8 }
                else if tool.keywords.contains(where: { $0.lowercased().contains(token) }) { hits += 5 }
                else if haystack.contains(token) { hits += 2 }
            }
            return hits == 0 ? 0 : hits * 40 + tool.popularity
        }
        let scoredTools: [(offset: Int, tool: Tool, score: Int)] = candidates.enumerated().map { entry in
            (offset: entry.offset, tool: entry.element, score: score(entry.element))
        }
        let matchingTools = scoredTools.filter { $0.score > 0 }
        let rankedTools = matchingTools.sorted { left, right in
            if left.score == right.score { return left.offset < right.offset }
            return left.score > right.score
        }
        return rankedTools.prefix(limit).map { $0.tool }
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
        let candidates = accessibilityDiscoveryTools() + developerStudioTools()
        let byID = Dictionary(uniqueKeysWithValues: candidates.map { ($0.id, $0) })
        let related = tool.related.compactMap { byID[$0] }.filter { !$0.isPlanned }
        if related.count >= limit { return Array(related.prefix(limit)) }
        let seen = Set([tool.id] + related.map(\.id))
        let rest = candidates
            .filter { $0.category == tool.category && !seen.contains($0.id) && !$0.isPlanned }
            .sorted {
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
        return catalog.nativeFacing().includingMusicDownloader()
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
        self.favoriteIDs = Set(UserDefaults.standard.stringArray(forKey: favoritesKey) ?? [])
        self.recentIDs = Array(NSOrderedSet(array: UserDefaults.standard.stringArray(forKey: recentKey) ?? []).array.compactMap { $0 as? String }.prefix(24))
        self.usageCounts = UserDefaults.standard.dictionary(forKey: usageKey)?.compactMapValues { $0 as? Int } ?? [:]
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
        if category == nil || category == "accessibility" {
            return catalog.webSearch(query, limit: Int.max, includeRelatedReferences: true).filter { category == nil || $0.category == category }
        }
        let needle = query.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        let originals = catalog.tools + (catalog.relatedReferenceTools ?? [])
        let source = originals + (category == "developer" ? catalog.developerStudioTools() : [])
        return source.filter { tool in
            (category == nil || tool.category == category) && (needle.isEmpty || tool.searchText.contains(needle))
        }.sorted { $0.popularity == $1.popularity ? $0.name < $1.name : $0.popularity > $1.popularity }
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
    .init(id: "contrast-checker", sourceID: "contrast-checker", slug: "color-contrast-studio", name: "Color Contrast Studio", description: "Evaluate WCAG 2.2 contrast, correct color pairs, preview color-vision differences, and export tokens locally.", aliases: ["contrast", "accessible-color", "color-blindness"], keywords: ["wcag", "wcag 2.2", "apca", "contrast ratio", "alpha", "transparency", "protanopia", "deuteranopia", "tritanopia", "achromatopsia", "tailwind", "css variables", "color blindness"]),
    .init(id: "alt-text-checker", sourceID: "alt-text-checker", slug: "alt-text-studio", name: "Alt Text Studio", description: "Review image alternatives, draft concise descriptions, preview announcements, and triage batches on-device.", aliases: ["alt-text"], keywords: ["image description", "alternative text", "screen reader", "decorative image", "bulk images"]),
    .init(id: "focus-state-checker", sourceID: "focus-state-checker", slug: "focus-state-studio", name: "Focus State Studio", description: "Build and test visible keyboard focus styles, dark themes, and forced-colors behavior.", aliases: ["focus-state"], keywords: ["focus visible", "focus ring", "keyboard focus", "forced colors", "dark mode"]),
    .init(id: "text-readability-checker", sourceID: "text-readability-checker", slug: "text-readability-studio", name: "Text & Readability Studio", description: "Estimate reading difficulty, create reviewable plain-language drafts, and test type scale and spacing.", aliases: ["text-readability", "font-size", "line-height"], keywords: ["plain language", "simplify", "flesch", "gunning fog", "font size", "line height", "text spacing", "zoom"]),
    .init(id: "aria-checker", sourceID: "aria-checker", slug: "aria-studio", name: "ARIA Studio", description: "Inspect ARIA names and states, generate common patterns, and preview a local approximation of the accessibility tree.", aliases: ["aria"], keywords: ["accessible name", "role", "state", "aria-label", "aria-labelledby", "accessibility tree", "dialog", "tabs"]),
    .init(id: "motion-checker", sourceID: "motion-checker", slug: "motion-reduced-motion-studio", name: "Motion & Reduced Motion Studio", description: "Review motion CSS and exercise reduced-motion alternatives without leaving your device.", aliases: ["motion"], keywords: ["animation", "transition", "prefers-reduced-motion", "vestibular", "flash"]),
    .init(id: "keyboard-navigation-checker", sourceID: "keyboard-navigation-checker", slug: "keyboard-navigation-studio", name: "Keyboard Navigation Studio", description: "Find keyboard-operability risks and practice logical, visible, trap-free navigation.", aliases: ["keyboard-navigation"], keywords: ["tab order", "keyboard only", "tabindex", "keyboard trap", "enter", "space", "escape"]),
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
    .init(id: "json-studio", sourceID: "json-formatter", slug: "json-studio", name: "JSON Studio", description: "Format, validate, compare, inspect, and query JSON locally while preserving large integer tokens and explaining parser caveats.", icon: "Braces", keywords: ["json", "format", "minify", "validate", "diff", "path", "tree", "large integer", "privacy"], modes: [.init("format", "Format", "json-formatter"), .init("minify", "Minify", "json-minifier"), .init("validate", "Validate", "json-validator"), .init("diff", "Diff", "json-diff"), .init("path", "Path / Search", "json-path-query"), .init("tree", "Tree / Inspect", "json-inspector"), .init("schema", "Schema", "developer-json-schema-generator"), .init("convert", "Convert to CSV", "json-to-csv"), .init("csv", "CSV tools", "csv-formatter")]),
    .init(id: "jwt-studio", sourceID: "jwt-decoder", slug: "jwt-studio", name: "JWT Studio", description: "Decode tokens and inspect registered claims locally. Decoding never proves trust or signature validity.", icon: "ShieldCheck", keywords: ["jwt", "token", "claims", "expiration", "privacy"], modes: [.init("decode", "Decode", "jwt-decoder"), .init("expiration", "Expiration", "jwt-expiration-checker"), .init("claims", "Claims inspector", "jwt-inspector"), .init("payload", "Payload builder", "developer-jwt-payload-generator")]),
    .init(id: "regex-studio", sourceID: "regex-tester", slug: "regex-studio", name: "Regex Studio", description: "Test and replace regular expressions, review captures and portability, and see engine-specific limitations.", icon: "Regex", keywords: ["regex", "match", "replace", "capture", "flags"], modes: [.init("match", "Match / Test", "regex-tester"), .init("replace", "Replace", "regex-replace"), .init("explain", "Explain", "developer-regex-explainer")]),
    .init(id: "hash-studio", sourceID: "sha256-hash", slug: "hash-studio", name: "Hash Studio", description: "Calculate digest values, compare them, or hash local files without uploading their bytes. Hashes are not encryption.", icon: "Fingerprint", keywords: ["hash", "sha256", "md5", "sha1", "sha384", "sha512", "file hash"], modes: [.init("hash", "Multi-hash", "hash-generator"), .init("compare", "Compare", "hash-compare"), .init("file", "File hash", "file-hash-calculator")]),
    .init(id: "encoding-studio", sourceID: "base64-encoder", slug: "encoding-studio", name: "Encoding Studio", description: "Encode and decode UTF-8 data across common web, text, and binary representations entirely on-device.", icon: "ArrowLeftRight", keywords: ["encoding", "decoding", "base64", "url", "html", "hex", "binary", "unicode"], modes: [.init("base64", "Base64", "base64-encoder", "base64-decoder"), .init("url", "URL", "url-encoder", "url-decoder"), .init("html", "HTML entities", "html-encoder", "html-decoder"), .init("hex", "Hex", "hex-encoder", "hex-decoder"), .init("binary", "Binary", "binary-encoder", "binary-decoder"), .init("ascii", "ASCII", "ascii-encoder", "ascii-decoder"), .init("unicode", "Unicode", "unicode-encoder", "unicode-decoder"), .init("data-uri", "Data URI", "data-uri-generator", "developer-data-uri-decoder")]),
    .init(id: "time-cron-studio", sourceID: "cron-parser", slug: "time-cron-studio", name: "Time & Cron Studio", description: "Convert Unix timestamps and explain five-field cron schedules with upcoming times without contacting a scheduler.", icon: "Clock", keywords: ["cron", "timestamp", "unix", "UTC", "schedule"], modes: [.init("timestamp", "Timestamp", "unix-timestamp-converter"), .init("explain", "Cron explain", "cron-explainer"), .init("next-runs", "Next runs", "cron-parser"), .init("presets", "Presets", "cron-generator")]),
    .init(id: "uuid-studio", sourceID: "uuid-generator", slug: "uuid-studio", name: "UUID Studio", description: "Generate UUID v4 batches and validate UUID shape, variant, and version bits locally.", icon: "Fingerprint", keywords: ["uuid", "guid", "v4", "batch", "validate"], modes: [.init("generate", "Generate batch", "uuid-generator"), .init("validate", "Validate", "uuid-validator")]),
    .init(id: "sql-studio", sourceID: "sql-formatter", slug: "sql-studio", name: "SQL Studio", description: "Format and minify SQL using an explicit dialect. Queries are never executed; formatting is not full grammar validation.", icon: "Database", keywords: ["sql", "format", "minify", "dialect", "join", "group by"], modes: [.init("format", "Format", "sql-formatter"), .init("minify", "Minify", "sql-minifier"), .init("parse", "Parse feedback", "sql-parser"), .init("query", "Query builder", "developer-sql-query-builder"), .init("schema", "Schema generator", "developer-sql-schema-generator")]),
    .init(id: "markup-studio", sourceID: "javascript-formatter", slug: "markup-studio", name: "Markup & Style Studio", description: "Format and inspect HTML, CSS, JavaScript, XML, YAML, and Markdown locally. Formatting is not code execution or a security audit.", icon: "FileCode", keywords: ["html", "css", "javascript", "xml", "yaml", "markdown"], modes: [.init("html", "HTML", "html-beautifier"), .init("css", "CSS", "css-beautifier"), .init("javascript", "JavaScript", "javascript-formatter"), .init("xml", "XML", "xml-beautifier"), .init("yaml", "YAML", "yaml-formatter"), .init("markdown", "Markdown preview", "markdown-preview"), .init("samples", "Sample content", "lorem-ipsum-generator")]),
    .init(id: "http-api-studio", sourceID: "http-status-lookup", slug: "http-api-studio", name: "HTTP & API Studio", description: "Look up HTTP status codes, inspect query strings and content types, and draft header/security references locally.", icon: "Network", keywords: ["http", "api", "status", "418", "headers", "query", "mime", "cors", "csp"], modes: [.init("status", "Status codes", "http-status-lookup"), .init("headers", "Headers", "developer-http-header-builder"), .init("query", "Query string", "query-string-parser"), .init("mime", "MIME types", "developer-content-type-lookup"), .init("cors", "CORS", "developer-cors-header-helper"), .init("csp", "CSP", "developer-csp-header-generator"), .init("cookies", "Cookies", "developer-cookie-parser"), .init("user-agent", "User-Agent", "user-agent-parser")]),
    .init(id: "devops-studio", sourceID: "developer-gitignore-generator", slug: "devops-studio", name: "DevOps Config Studio", description: "Generate copy-ready project config, container files, starter docs, API schemas, and release metadata with editable presets.", icon: "Container", keywords: ["devops", "docker", "compose", "nginx", "gitignore", "openapi", "graphql", "readme", "semver"], modes: [.init("gitignore", ".gitignore", "developer-gitignore-generator"), .init("dockerfile", "Dockerfile", "developer-dockerfile-helper"), .init("compose", "Compose", "developer-docker-compose-generator"), .init("nginx", "Nginx", "developer-nginx-config-generator"), .init("editorconfig", "EditorConfig", "developer-editorconfig-generator"), .init("env", ".env example", "developer-environment-variable-generator"), .init("openapi", "OpenAPI", "developer-openapi-example-generator"), .init("graphql", "GraphQL", "developer-graphql-query-builder"), .init("license", "License", "developer-license-generator"), .init("readme", "README", "developer-readme-generator"), .init("commit", "Commit message", "developer-commit-message-helper"), .init("branch", "Branch name", "developer-branch-name-generator"), .init("changelog", "Changelog", "developer-changelog-generator"), .init("semver", "Semver", "developer-semantic-version-calculator"), .init("mock", "API / webhook fixtures", "developer-api-mock-response-generator")]),
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
