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

    init(type: String?, id: String?, op: String?) {
        self.type = type
        self.id = id
        self.op = op
        self.configuration = [:]
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
    func webSearch(_ query: String, limit: Int = Int.max, includeRelatedReferences: Bool = false) -> [Tool] {
        let q = query.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        let sourceCandidates = includeRelatedReferences ? tools + (relatedReferenceTools ?? []) : tools
        let candidates = sourceCandidates.filter { $0.category != "accessibility" } + accessibilityDiscoveryTools().filter { $0.category == "accessibility" }
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
        let candidates = accessibilityDiscoveryTools()
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
        return catalog.nativeFacing()
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
        let matches = (catalog.tools + (catalog.relatedReferenceTools ?? [])).filter { favoriteIDs.contains($0.id) }
        var seen = Set<String>()
        return matches.compactMap { catalog.accessibilityStudio(for: $0.id) ?? $0 }.filter { seen.insert($0.id).inserted }.sorted { $0.name < $1.name }
    }
    var featuredTools: [Tool] { (catalog.tools + (catalog.relatedReferenceTools ?? [])).filter(\.featured).sorted { $0.popularity > $1.popularity } }
    var popularTools: [Tool] { catalog.accessibilityDiscoveryTools().sorted { $0.popularity == $1.popularity ? $0.name < $1.name : $0.popularity > $1.popularity } }

    func tools(matching query: String = "", category: String? = nil) -> [Tool] {
        if category == nil || category == "accessibility" {
            return catalog.webSearch(query, limit: Int.max, includeRelatedReferences: true).filter { category == nil || $0.category == category }
        }
        let needle = query.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        return (catalog.tools + (catalog.relatedReferenceTools ?? [])).filter { tool in
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
        accessibilityStudio(for: toolID) ?? tools.first(where: { $0.id == toolID }) ?? (relatedReferenceTools ?? []).first(where: { $0.id == toolID })
    }
}
