package com.chastech.env.data

import java.util.LinkedHashMap
import java.util.Locale
import kotlin.math.min

private const val MIN_PREFIX_LENGTH = 2
private const val MAX_PREFIX_LENGTH = 12
private const val MAX_CANDIDATES_PER_TERM = 220
private const val SUGGESTION_CACHE_LIMIT = 100
private const val SEARCH_CACHE_LIMIT = 32

private val searchSuggestionStopWords = setOf(
    "a", "an", "the", "to", "of", "for", "my", "me", "i", "do", "how", "can", "you", "what", "is", "are",
    "make", "create", "generate", "convert", "change", "turn", "find", "show", "please", "want", "need",
    "online", "free", "tool", "tools", "with", "from", "into", "in", "on", "and", "or", "it", "this", "that",
    "using", "use", "best", "app", "something", "some", "get", "be",
)

private data class SearchSuggestionDocument(
    val tool: ToolRecord,
    val normalizedName: String,
    val nameTokens: Set<String>,
    val fieldTokens: Set<String>,
    val aliasPhrases: Set<String>,
)

private data class SearchSuggestionIndex(
    val documents: List<SearchSuggestionDocument>,
    val namePrefixes: Map<String, List<Int>>,
    val fieldPrefixes: Map<String, List<Int>>,
)

internal class CatalogSearchEngine(private val catalog: Catalog) {
    private val candidatesWithoutRelated: List<ToolRecord> = buildCandidates(includeRelatedReferences = false)
    private val candidatesWithRelated: List<ToolRecord> = buildCandidates(includeRelatedReferences = true)

    private val suggestionIndexes = mutableMapOf<Boolean, SearchSuggestionIndex>()
    private val suggestionResults = object : LinkedHashMap<String, List<ToolRecord>>(16, 0.75f, true) {
        override fun removeEldestEntry(eldest: MutableMap.MutableEntry<String, List<ToolRecord>>?): Boolean =
            size > SUGGESTION_CACHE_LIMIT
    }
    private val fullSearchResults = object : LinkedHashMap<String, List<ToolRecord>>(16, 0.75f, true) {
        override fun removeEldestEntry(eldest: MutableMap.MutableEntry<String, List<ToolRecord>>?): Boolean =
            size > SEARCH_CACHE_LIMIT
    }

    private fun buildCandidates(includeRelatedReferences: Boolean): List<ToolRecord> {
        val source = if (includeRelatedReferences) catalog.tools + catalog.relatedReferenceTools else catalog.tools
        return source.filter { tool ->
            tool.category != "accessibility" && tool.tags.none { it == "developer-studio" }
        } + catalog.accessibilityDiscoveryTools().filter { it.category == "accessibility" } + catalog.developerStudioTools()
    }

    @Synchronized
    fun prepare() {
        indexFor(includeRelatedReferences = false)
        indexFor(includeRelatedReferences = true)
    }

    @Synchronized
    fun search(query: String, limit: Int, includeRelatedReferences: Boolean): List<ToolRecord> {
        val normalizedQuery = query.trim().lowercase(Locale.ROOT)
        val key = normalizedQuery + "\u0000" + limit + "\u0000" + if (includeRelatedReferences) "1" else "0"
        fullSearchResults[key]?.let { return it }

        val candidates = if (includeRelatedReferences) candidatesWithRelated else candidatesWithoutRelated
        if (normalizedQuery.isEmpty()) {
            return candidates.sortedByDescending { it.popularity }.take(limit).also { fullSearchResults[key] = it }
        }

        val tokens = tokenize(normalizedQuery)
        val expanded = (tokens + tokens.flatMap { webSearchSynonyms[it].orEmpty() }).toSet()
        fun score(tool: ToolRecord): Int {
            val name = tool.name.lowercase(Locale.ROOT)
            if (name == normalizedQuery || tool.id == normalizedQuery) return 2000 + tool.popularity
            if (name.startsWith(normalizedQuery)) return 1400 + tool.popularity
            if (tool.id.contains(normalizedQuery) || name.contains(normalizedQuery)) return 1000 + tool.popularity

            val haystack = listOf(tool.name, tool.description, tool.category, tool.subcategory.orEmpty(), tool.id)
                .plus(tool.keywords).plus(tool.tags).joinToString(" ").lowercase(Locale.ROOT)
            var hits = 0
            expanded.forEach { token ->
                when {
                    name.contains(token) -> hits += 8
                    tool.keywords.any { it.lowercase(Locale.ROOT).contains(token) } -> hits += 5
                    haystack.contains(token) -> hits += 2
                }
            }
            return if (hits == 0) 0 else hits * 40 + tool.popularity
        }

        val results = candidates.mapIndexed { index, tool -> Triple(index, tool, score(tool)) }
            .filter { it.third > 0 }
            .sortedWith(compareByDescending<Triple<Int, ToolRecord, Int>> { it.third }.thenBy { it.first })
            .take(limit)
            .map { it.second }
        fullSearchResults[key] = results
        return results
    }

    @Synchronized
    fun suggestions(query: String, limit: Int, includeRelatedReferences: Boolean): List<ToolRecord> {
        val normalizedQuery = query.trim().lowercase(Locale.ROOT)
        val cacheKey = normalizedQuery + "\u0000" + limit + "\u0000" + if (includeRelatedReferences) "1" else "0"
        suggestionResults[cacheKey]?.let { return it }
        if (limit <= 0) return emptyList<ToolRecord>().also { suggestionResults[cacheKey] = it }

        val terms = suggestionTerms(normalizedQuery)
        if (terms.isEmpty()) return emptyList<ToolRecord>().also { suggestionResults[cacheKey] = it }

        val index = indexFor(includeRelatedReferences)
        val variantsByTerm = terms.map { term ->
            val related = webSearchSynonyms[term].orEmpty().flatMap(::tokenize)
            (listOf(term) + related).filter { it.length >= MIN_PREFIX_LENGTH }.distinct()
        }
        val candidateIndexes = LinkedHashSet<Int>()
        variantsByTerm.flatten().forEach { variant ->
            readCandidates(index.namePrefixes, variant, index.documents, candidateIndexes)
            readCandidates(index.fieldPrefixes, variant, index.documents, candidateIndexes)
        }

        val minimumMatchedTerms = when (terms.size) {
            1 -> 1
            2 -> 2
            else -> maxOf(2, terms.size - 1)
        }
        val ranked = candidateIndexes.mapNotNull { documentIndex ->
            val document = index.documents[documentIndex]
            var matchedTerms = 0
            var matchedNameTerms = 0
            for (termIndex in terms.indices) {
                val variants = variantsByTerm[termIndex]
                val nameMatch = hasPrefix(document.nameTokens, variants)
                val fieldMatch = hasPrefix(document.fieldTokens, variants)
                if (nameMatch || fieldMatch) matchedTerms += 1
                if (nameMatch) matchedNameTerms += 1
            }
            if (matchedTerms < minimumMatchedTerms) return@mapNotNull null

            val exactName = document.normalizedName == normalizedQuery
            val namePhrasePrefix = document.normalizedName.startsWith(normalizedQuery)
            val namePhraseContains = normalizedQuery.length >= 3 && document.normalizedName.contains(normalizedQuery)
            val aliasPrefix = document.aliasPhrases.any { it.startsWith(normalizedQuery) }
            val popularity = document.tool.popularity.coerceIn(0, 10000)
            val plannedPenalty = if (document.tool.status == "planned") 100 else 0
            val score = (if (exactName) 500 else 0) +
                (if (namePhrasePrefix) 140 else 0) +
                (if (namePhraseContains) 35 else 0) +
                (if (aliasPrefix) 80 else 0) +
                matchedNameTerms * 24 +
                matchedTerms * 10 +
                min(5, popularity / 2000) -
                plannedPenalty
            document to score
        }.sortedWith(
            compareByDescending<Pair<SearchSuggestionDocument, Int>> { it.second }
                .thenBy { it.first.normalizedName }
                .thenBy { it.first.tool.id },
        ).take(limit).map { it.first.tool }

        suggestionResults[cacheKey] = ranked
        return ranked
    }

    private fun indexFor(includeRelatedReferences: Boolean): SearchSuggestionIndex {
        suggestionIndexes[includeRelatedReferences]?.let { return it }
        val candidates = if (includeRelatedReferences) candidatesWithRelated else candidatesWithoutRelated
        val ordered = candidates.sortedWith(
            compareBy<ToolRecord> { it.status == "planned" }
                .thenByDescending { it.popularity }
                .thenBy { it.name.lowercase(Locale.ROOT) }
                .thenBy { it.id },
        )
        val documents = ordered.map { tool ->
            val aliases = webSearchSynonyms.entries.filter { (_, values) ->
                values.any { alias -> tool.keywords.any { it.equals(alias, ignoreCase = true) } }
            }.map { it.key }
            val nameTokens = tokenize(tool.name).toSet()
            val fieldTokens = tokenize(
                listOf(tool.id, tool.category, tool.subcategory.orEmpty())
                    .plus(tool.keywords).plus(tool.tags).joinToString(" "),
            ).toSet()
            SearchSuggestionDocument(
                tool = tool,
                normalizedName = normalizeSearchText(tool.name),
                nameTokens = nameTokens,
                fieldTokens = fieldTokens,
                aliasPhrases = aliases.map(::normalizeSearchText).toSet(),
            )
        }
        val namePrefixes = mutableMapOf<String, MutableList<Int>>()
        val fieldPrefixes = mutableMapOf<String, MutableList<Int>>()
        documents.forEachIndexed { index, document ->
            addPrefixes(namePrefixes, document.nameTokens, index)
            addPrefixes(fieldPrefixes, document.fieldTokens, index)
        }
        return SearchSuggestionIndex(
            documents,
            namePrefixes.mapValues { it.value.toList() },
            fieldPrefixes.mapValues { it.value.toList() },
        ).also { suggestionIndexes[includeRelatedReferences] = it }
    }

    private fun addPrefixes(target: MutableMap<String, MutableList<Int>>, tokens: Set<String>, docIndex: Int) {
        val prefixes = mutableSetOf<String>()
        tokens.forEach { token ->
            for (length in MIN_PREFIX_LENGTH..min(token.length, MAX_PREFIX_LENGTH)) {
                prefixes += token.substring(0, length)
            }
        }
        prefixes.forEach { prefix -> target.getOrPut(prefix) { mutableListOf() }.add(docIndex) }
    }

    private fun readCandidates(
        postings: Map<String, List<Int>>,
        variant: String,
        documents: List<SearchSuggestionDocument>,
        result: MutableSet<Int>,
    ) {
        val posting = postings[variant.take(MAX_PREFIX_LENGTH)] ?: return
        var added = 0
        for (docIndex in posting) {
            val document = documents[docIndex]
            if (!hasPrefix(document.nameTokens, listOf(variant)) && !hasPrefix(document.fieldTokens, listOf(variant))) continue
            result += docIndex
            added += 1
            if (added >= MAX_CANDIDATES_PER_TERM) break
        }
    }

    private fun suggestionTerms(query: String): List<String> {
        val tokens = tokenize(query)
        val useful = tokens.filterNot { it in searchSuggestionStopWords }
        return (if (useful.isNotEmpty()) useful else tokens).distinct()
    }

    private fun hasPrefix(tokens: Set<String>, variants: List<String>): Boolean =
        tokens.any { token -> variants.any { token.startsWith(it) } }

    private fun tokenize(value: String): List<String> =
        value.lowercase(Locale.ROOT).split(Regex("[^a-z0-9%+]+"))
            .filter { it.length >= MIN_PREFIX_LENGTH || it == "%" }

    private fun normalizeSearchText(value: String): String = tokenize(value).joinToString(" ")
}
