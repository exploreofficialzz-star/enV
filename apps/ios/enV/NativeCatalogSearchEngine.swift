import Foundation

private let nativeSearchSuggestionStopWords: Set<String> = [
    "a", "an", "the", "to", "of", "for", "my", "me", "i", "do", "how", "can", "you", "what", "is", "are",
    "make", "create", "generate", "convert", "change", "turn", "find", "show", "please", "want", "need",
    "online", "free", "tool", "tools", "with", "from", "into", "in", "on", "and", "or", "it", "this", "that",
    "using", "use", "best", "app", "something", "some", "get", "be"
]

private let nativeSearchSynonyms: [String: [String]] = [
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
    "animation": ["motion", "reduced motion"], "readability": ["plain language", "text spacing"]
]

final class NativeCatalogSearchEngine {
    private struct Document {
        let tool: Tool
        let normalizedName: String
        let nameTokens: Set<String>
        let fieldTokens: Set<String>
        let aliasPhrases: Set<String>
    }

    private struct Index {
        let documents: [Document]
        let namePrefixes: [String: [Int]]
        let fieldPrefixes: [String: [Int]]
    }

    private let catalog: Catalog
    private let lock = NSLock()
    private var indexes: [Bool: Index] = [:]
    private var suggestionCache: [String: [Tool]] = [:]
    private var suggestionOrder: [String] = []
    private var fullSearchCache: [String: [Tool]] = [:]
    private var fullSearchOrder: [String] = []

    private let minimumPrefixLength = 2
    private let maximumPrefixLength = 12
    private let maximumCandidatesPerTerm = 220
    private let maximumSuggestionCacheEntries = 100
    private let maximumSearchCacheEntries = 32

    init(catalog: Catalog) {
        self.catalog = catalog
    }

    func prepare() {
        lock.lock()
        defer { lock.unlock() }
        _ = index(includeRelatedReferences: false)
        _ = index(includeRelatedReferences: true)
    }

    func search(_ query: String, limit: Int = Int.max, includeRelatedReferences: Bool = false) -> [Tool] {
        lock.lock()
        defer { lock.unlock() }

        let normalizedQuery = query.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        let key = normalizedQuery + "\u{0}" + String(limit) + "\u{0}" + (includeRelatedReferences ? "1" : "0")
        if let cached = fullSearchCache[key] {
            touch(key, order: &fullSearchOrder)
            return cached
        }

        // Keep the established Catalog.webSearch ranking exactly; this layer only caches it.
        let results = catalog.webSearch(
            normalizedQuery,
            limit: limit,
            includeRelatedReferences: includeRelatedReferences
        )
        remember(results, key: key, cache: &fullSearchCache, order: &fullSearchOrder, maximum: maximumSearchCacheEntries)
        return results
    }
    func suggestions(_ query: String, limit: Int = 8, includeRelatedReferences: Bool = false) -> [Tool] {
        lock.lock()
        defer { lock.unlock() }

        let normalizedQuery = normalizeSearchText(query)
        let key = normalizedQuery + "\u{0}" + String(limit) + "\u{0}" + (includeRelatedReferences ? "1" : "0")
        if let cached = suggestionCache[key] {
            touch(key, order: &suggestionOrder)
            return cached
        }

        guard limit > 0 else {
            remember([], key: key, cache: &suggestionCache, order: &suggestionOrder, maximum: maximumSuggestionCacheEntries)
            return []
        }
        let terms = suggestionTerms(query)
        guard !terms.isEmpty else {
            remember([], key: key, cache: &suggestionCache, order: &suggestionOrder, maximum: maximumSuggestionCacheEntries)
            return []
        }

        let searchIndex = index(includeRelatedReferences: includeRelatedReferences)
        let variantsByTerm = terms.map { term -> [String] in
            let related = (nativeSearchSynonyms[term] ?? []).flatMap { tokenize($0) }
            return Array(Set([term] + related)).filter { $0.count >= minimumPrefixLength }.sorted()
        }
        var candidateIndexes = Set<Int>()
        for variant in variantsByTerm.flatMap({ $0 }) {
            readCandidates(searchIndex.namePrefixes, variant: variant, documents: searchIndex.documents, into: &candidateIndexes)
            readCandidates(searchIndex.fieldPrefixes, variant: variant, documents: searchIndex.documents, into: &candidateIndexes)
        }

        let minimumMatchedTerms = terms.count == 1 ? 1 : (terms.count == 2 ? 2 : max(2, terms.count - 1))
        let ranked = candidateIndexes.compactMap { documentIndex -> (Document, Int)? in
            let document = searchIndex.documents[documentIndex]
            var matchedTerms = 0
            var matchedNameTerms = 0
            for index in terms.indices {
                let variants = variantsByTerm[index]
                let nameMatch = hasPrefix(document.nameTokens, variants: variants)
                let fieldMatch = hasPrefix(document.fieldTokens, variants: variants)
                if nameMatch || fieldMatch { matchedTerms += 1 }
                if nameMatch { matchedNameTerms += 1 }
            }
            guard matchedTerms >= minimumMatchedTerms else { return nil }

            let exactName = document.normalizedName == normalizedQuery
            let namePhrasePrefix = document.normalizedName.hasPrefix(normalizedQuery)
            let namePhraseContains = normalizedQuery.count >= 3 && document.normalizedName.contains(normalizedQuery)
            let aliasPrefix = document.aliasPhrases.contains { $0.hasPrefix(normalizedQuery) }
            let popularity = min(max(document.tool.popularity, 0), 10000)
            let plannedPenalty = document.tool.status == "planned" ? 100 : 0
            let score = (exactName ? 500 : 0)
                + (namePhrasePrefix ? 140 : 0)
                + (namePhraseContains ? 35 : 0)
                + (aliasPrefix ? 80 : 0)
                + matchedNameTerms * 24
                + matchedTerms * 10
                + min(5, popularity / 2000)
                - plannedPenalty
            return (document, score)
        }.sorted {
            if $0.1 == $1.1 {
                let left = $0.0.normalizedName
                let right = $1.0.normalizedName
                return left == right ? $0.0.tool.id < $1.0.tool.id : left < right
            }
            return $0.1 > $1.1
        }.prefix(limit).map { $0.0.tool }

        remember(ranked, key: key, cache: &suggestionCache, order: &suggestionOrder, maximum: maximumSuggestionCacheEntries)
        return ranked
    }

    private func candidateTools(includeRelatedReferences: Bool) -> [Tool] {
        let source = includeRelatedReferences ? catalog.tools + (catalog.relatedReferenceTools ?? []) : catalog.tools
        return source.filter { $0.category != "accessibility" && !$0.tags.contains("developer-studio") }
            + catalog.accessibilityDiscoveryTools().filter { $0.category == "accessibility" }
            + catalog.developerStudioTools()
    }

    private func index(includeRelatedReferences: Bool) -> Index {
        if let existing = indexes[includeRelatedReferences] { return existing }
        let ordered = candidateTools(includeRelatedReferences: includeRelatedReferences).sorted { left, right in
            let leftPlanned = left.status == "planned"
            let rightPlanned = right.status == "planned"
            if leftPlanned != rightPlanned { return !leftPlanned }
            if left.popularity != right.popularity { return left.popularity > right.popularity }
            let leftName = left.name.lowercased()
            let rightName = right.name.lowercased()
            return leftName == rightName ? left.id < right.id : leftName < rightName
        }
        let documents = ordered.map { tool -> Document in
            let nameTokens = Set(tokenize(tool.name))
            let fieldTokens = Set(tokenize(([tool.id, tool.category, tool.subcategory ?? ""] + tool.keywords + tool.tags).joined(separator: " ")))
            let aliases = Set(tool.keywords.map { normalizeSearchText($0) }.filter { !$0.isEmpty })
            return Document(
                tool: tool,
                normalizedName: normalizeSearchText(tool.name),
                nameTokens: nameTokens,
                fieldTokens: fieldTokens,
                aliasPhrases: aliases
            )
        }
        var namePrefixes: [String: [Int]] = [:]
        var fieldPrefixes: [String: [Int]] = [:]
        for (documentIndex, document) in documents.enumerated() {
            addPrefixes(document.nameTokens, index: documentIndex, to: &namePrefixes)
            addPrefixes(document.fieldTokens, index: documentIndex, to: &fieldPrefixes)
        }
        let built = Index(documents: documents, namePrefixes: namePrefixes, fieldPrefixes: fieldPrefixes)
        indexes[includeRelatedReferences] = built
        return built
    }

    private func score(_ tool: Tool, query: String, expanded: Set<String>) -> Int {
        let name = tool.name.lowercased()
        if name == query || tool.id == query { return 2000 + tool.popularity }
        if name.hasPrefix(query) { return 1400 + tool.popularity }
        if tool.id.contains(query) || name.contains(query) { return 1000 + tool.popularity }
        let haystack = ([tool.name, tool.description, tool.category, tool.subcategory ?? "", tool.id] + tool.keywords + tool.tags)
            .joined(separator: " ").lowercased()
        var hits = 0
        for token in expanded {
            if name.contains(token) { hits += 8 }
            else if tool.keywords.contains(where: { $0.lowercased().contains(token) }) { hits += 5 }
            else if haystack.contains(token) { hits += 2 }
        }
        return hits == 0 ? 0 : hits * 40 + tool.popularity
    }

    private func addPrefixes(_ tokens: Set<String>, index documentIndex: Int, to target: inout [String: [Int]]) {
        var prefixes = Set<String>()
        for token in tokens {
            let maximum = min(token.count, maximumPrefixLength)
            guard maximum >= minimumPrefixLength else { continue }
            for length in minimumPrefixLength...maximum {
                let end = token.index(token.startIndex, offsetBy: length)
                prefixes.insert(String(token[..<end]))
            }
        }
        for prefix in prefixes {
            target[prefix, default: []].append(documentIndex)
        }
    }

    private func readCandidates(_ postings: [String: [Int]], variant: String, documents: [Document], into result: inout Set<Int>) {
        let key = String(variant.prefix(maximumPrefixLength))
        guard let posting = postings[key] else { return }
        var added = 0
        for documentIndex in posting {
            let document = documents[documentIndex]
            guard hasPrefix(document.nameTokens, variants: [variant]) || hasPrefix(document.fieldTokens, variants: [variant]) else { continue }
            result.insert(documentIndex)
            added += 1
            if added >= maximumCandidatesPerTerm { break }
        }
    }

    private func hasPrefix(_ tokens: Set<String>, variants: [String]) -> Bool {
        tokens.contains { token in variants.contains { token.hasPrefix($0) } }
    }

    private func suggestionTerms(_ query: String) -> [String] {
        let all = tokenize(query)
        let useful = all.filter { !nativeSearchSuggestionStopWords.contains($0) }
        return Array(Set(useful.isEmpty ? all : useful)).sorted()
    }

    private func tokenize(_ value: String) -> [String] {
        let accepted = CharacterSet.alphanumerics.union(CharacterSet(charactersIn: "%+"))
        return value.lowercased().unicodeScalars
            .split { !accepted.contains($0) }
            .map { String(String.UnicodeScalarView($0)) }
            .filter { $0.count >= minimumPrefixLength || $0 == "%" }
    }

    private func normalizeSearchText(_ value: String) -> String {
        tokenize(value).joined(separator: " ")
    }

    private func touch(_ key: String, order: inout [String]) {
        order.removeAll { $0 == key }
        order.append(key)
    }

    private func remember(
        _ value: [Tool],
        key: String,
        cache: inout [String: [Tool]],
        order: inout [String],
        maximum: Int
    ) {
        cache[key] = value
        touch(key, order: &order)
        while order.count > maximum {
            let removed = order.removeFirst()
            cache.removeValue(forKey: removed)
        }
    }
}
