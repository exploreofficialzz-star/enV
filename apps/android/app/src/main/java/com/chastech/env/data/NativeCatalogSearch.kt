package com.chastech.env.data

import java.text.Normalizer
import java.util.Locale
import kotlin.math.ln
import kotlin.math.max
import kotlin.math.min
import kotlin.math.round

/**
 * Deterministic native port of src/lib/search.ts.
 *
 * The index is created once per Catalog (see Catalog.webSearch) and preserves Web's
 * field weights, IDF, coverage gate, aliases, typo/prefix expansion and stable ranking.
 * This is lexical metadata retrieval only; it does not claim a tool is functionally verified.
 */
internal class NativeCatalogSearchIndex(tools: List<ToolRecord>) {
    private enum class Field(val weight: Int) {
        NAME(10), ID(7), KEYWORD(6), ALIAS(5), TAG(4), SUBCATEGORY(4), CATEGORY(3), DESCRIPTION(2)
    }

    private enum class MatchKind { EXACT, SYNONYM, FUZZY, PREFIX }

    private data class StemInfo(val weight: Int, val field: Field, val surface: String)
    private data class Variant(val stems: List<String>, val weight: Double, val kind: MatchKind, val label: String)
    private data class Term(val surface: String, val stem: String, val variants: List<Variant>, val idfValue: Double)
    private data class Doc(
        val tool: ToolRecord,
        val stems: Map<String, StemInfo>,
        val surfaces: Set<String>,
        val normalizedName: String,
        val normalizedId: String,
        val nameTokenCount: Int,
        val aliasPhrases: Set<String>,
        val stemmedName: String,
    )
    private data class Ranked(val doc: Doc, val score: Double)

    private val docs: List<Doc>
    private val postings = LinkedHashMap<String, MutableList<Int>>()
    private val vocabulary = LinkedHashMap<String, Int>()
    private val surfaceVocabulary = LinkedHashMap<String, String>()

    init {
        docs = tools.map(::buildDoc)
        docs.forEachIndexed { index, doc ->
            doc.stems.keys.forEach { key -> postings.getOrPut(key) { mutableListOf() }.add(index) }
        }
        postings.forEach { (key, indices) -> vocabulary[key] = indices.size }
        docs.forEach { doc ->
            doc.surfaces.forEach { surface -> surfaceVocabulary.putIfAbsent(surface, stem(surface)) }
        }
    }

    fun search(query: String, limit: Int): List<ToolRecord> {
        if (limit <= 0) return emptyList()
        val normalized = normalizeText(query)
        if (normalized.isEmpty()) {
            return docs.asSequence()
                .sortedWith(
                    compareBy<Doc>({ if (it.tool.status == "planned") 1 else 0 })
                        .thenByDescending { it.tool.popularity }
                        .thenBy { normalizeText(it.tool.name) }
                        .thenBy { it.tool.id }
                )
                .take(limit)
                .map { it.tool }
                .toList()
        }

        val interpreted = interpret(normalized)
        if (interpreted.terms.isEmpty()) return emptyList()
        val candidateIndices = LinkedHashSet<Int>()
        interpreted.terms.forEach { term ->
            term.variants.forEach { variant ->
                variant.stems.forEach { key -> postings[key]?.forEach(candidateIndices::add) }
            }
        }

        val ranked = candidateIndices.mapNotNull { index ->
            val doc = docs[index]
            val scored = score(doc, interpreted.terms, interpreted.phrase, interpreted.fullPhrase) ?: return@mapNotNull null
            Ranked(doc, scored)
        }
        return ranked.sortedWith(
            compareBy<Ranked>({ if (it.doc.tool.status == "planned") 1 else 0 })
                .thenByDescending { it.score }
                .thenByDescending { it.doc.tool.popularity }
                .thenBy { normalizeText(it.doc.tool.name) }
                .thenBy { it.doc.tool.id }
        ).take(limit).map { it.doc.tool }
    }

    private data class InterpretedQuery(
        val terms: List<Term>,
        val phrase: String,
        val fullPhrase: String,
    )

    private fun interpret(normalized: String): InterpretedQuery {
        val all = normalized.split(' ').filter { it.length > 1 || it == "%" }
        val content = all.filterNot { it in STOP_WORDS }
        val surfaces = if (content.isNotEmpty()) content else all
        val terms = surfaces.mapIndexed { index, surface ->
            val key = stem(surface)
            val variants = mutableListOf(Variant(listOf(key), 1.0, MatchKind.EXACT, surface))
            val df = vocabulary[key] ?: 0
            SYNONYMS[surface].orEmpty().forEach { synonym ->
                val synonymStems = tokenize(synonym).map(::stem)
                if (synonymStems.isNotEmpty()) variants += Variant(synonymStems, 0.7, MatchKind.SYNONYM, synonym)
            }
            if (df == 0 && key.length >= 3) {
                val maxEdits = maxEdits(key.length)
                if (maxEdits > 0) {
                    val best = LinkedHashMap<String, Pair<Int, Int>>()
                    val bestOrder = mutableListOf<String>()
                    fun consider(candidateStem: String, distance: Int) {
                        if (distance > maxEdits) return
                        val candidateDf = vocabulary[candidateStem] ?: 0
                        val existing = best[candidateStem]
                        if (existing == null) {
                            bestOrder += candidateStem
                            best[candidateStem] = distance to candidateDf
                        } else if (distance < existing.first) {
                            best[candidateStem] = distance to candidateDf
                        }
                    }
                    surfaceVocabulary.forEach { (candidateSurface, candidateStem) ->
                        if (kotlin.math.abs(candidateSurface.length - surface.length) > maxEdits &&
                            kotlin.math.abs(candidateStem.length - key.length) > maxEdits
                        ) return@forEach
                        if (candidateSurface.firstOrNull() != surface.firstOrNull() &&
                            candidateStem.firstOrNull() != key.firstOrNull()
                        ) return@forEach
                        val distance = min(
                            boundedDistance(surface, candidateSurface, maxEdits),
                            boundedDistance(key, candidateStem, maxEdits),
                        )
                        consider(candidateStem, distance)
                    }
                    // The Web contract selects candidates by edit distance, corpus frequency, then ID.
                    // Sorting is independent of native catalogue serialization order.
                    bestOrder.sortedWith(
                        compareBy<String> { best.getValue(it).first }
                            .thenByDescending { best.getValue(it).second }
                            .thenBy { it }
                    ).take(3).forEach { candidate ->
                        val value = best.getValue(candidate)
                        variants += Variant(
                            listOf(candidate),
                            if (value.first == 1) 0.55 else 0.4,
                            MatchKind.FUZZY,
                            candidate,
                        )
                    }
                }
                if (index == surfaces.lastIndex && surfaces.size <= 2) {
                    vocabulary.entries.asSequence()
                        .filter { (candidate, _) -> candidate.length > key.length && candidate.startsWith(key) }
                        .sortedWith(compareByDescending<Map.Entry<String, Int>> { it.value }.thenBy { it.key })
                        .take(8)
                        .forEach { (candidate, _) ->
                            variants += Variant(listOf(candidate), 0.65, MatchKind.PREFIX, candidate)
                        }
                }
            }
            val idfDf = if (df > 0) df else variants.drop(1)
                .mapNotNull { vocabulary[it.stems.firstOrNull()] }
                .firstOrNull { it > 0 } ?: 0
            Term(surface, key, variants, idf(idfDf))
        }
        return InterpretedQuery(terms, surfaces.joinToString(" "), all.joinToString(" "))
    }

    private fun score(doc: Doc, terms: List<Term>, phrase: String, fullPhrase: String): Double? {
        var base = 0.0
        var matchedIdf = 0.0
        val totalIdf = terms.sumOf { it.idfValue }.takeIf { it > 0.0 } ?: 1.0
        var strongMatch = false
        var namedTerms = 0

        for (term in terms) {
            var best = 0.0
            var bestField = Field.DESCRIPTION
            var bestStrong = false
            for (variant in term.variants) {
                var weakestWeight = Int.MAX_VALUE
                var weakestField = Field.DESCRIPTION
                var matchedAll = true
                for (key in variant.stems) {
                    val info = doc.stems[key]
                    if (info == null) {
                        matchedAll = false
                        break
                    }
                    if (info.weight < weakestWeight) {
                        weakestWeight = info.weight
                        weakestField = info.field
                    }
                }
                if (!matchedAll) continue
                val surfaceBonus = if (variant.kind == MatchKind.EXACT) {
                    if (term.surface in doc.surfaces) 1.0 else 0.92
                } else 1.0
                val df = vocabulary[variant.stems.first()] ?: 0
                val variantIdf = if (variant.kind == MatchKind.EXACT) term.idfValue else idf(df)
                val value = variant.weight * surfaceBonus * weakestWeight * variantIdf
                if (value > best) {
                    best = value
                    bestField = weakestField
                    bestStrong = weakestWeight >= Field.TAG.weight
                }
            }
            if (best > 0.0) {
                base += best
                matchedIdf += term.idfValue
                if (bestStrong) strongMatch = true
                if (bestField == Field.NAME || bestField == Field.ID) namedTerms += 1
            }
        }
        if (base == 0.0) return null
        val coverage = matchedIdf / totalIdf
        val minimumCoverage = if (terms.size == 2) 0.75 else 0.6
        if (terms.size >= 2 && (coverage < minimumCoverage || !strongMatch)) return null

        var score = base * (0.4 + 0.6 * coverage)
        if (terms.isNotEmpty() && namedTerms == terms.size) score += 30.0
        if (phrase.isNotEmpty() && " ${doc.normalizedName} ".contains(" $phrase ")) score += 40.0
        if (phrase.isNotEmpty() && doc.normalizedName.startsWith(phrase)) score += 20.0
        if (fullPhrase in doc.aliasPhrases || phrase in doc.aliasPhrases) score += 250.0
        val conversionInput = fullPhrase.replace(Regex("^(convert|change|turn|transform|save)\\s+"), "")
        val conversion = Regex("^(\\S+) to (\\S+)$").matchEntire(conversionInput)
        if (conversion != null) {
            val from = conversion.groupValues[1]
            val to = conversion.groupValues[2]
            val padded = " ${doc.stemmedName} "
            if (padded.contains(" ${stemPhrase("$from to $to")} ")) score += 60.0
            else if (padded.contains(" ${stemPhrase("$to to $from")} ")) score -= 15.0
        }
        val normalizedIdFromFull = fullPhrase.replace(" ", "-")
        val normalizedIdFromPhrase = phrase.replace(" ", "-")
        if (doc.normalizedName == fullPhrase || doc.normalizedName == phrase ||
            doc.normalizedId == normalizedIdFromFull || doc.normalizedId == normalizedIdFromPhrase
        ) score += 400.0
        score -= 0.6 * min(4, max(0, doc.nameTokenCount - namedTerms))
        return round(score * 1_000_000.0) / 1_000_000.0
    }
    private fun buildDoc(tool: ToolRecord): Doc {
        val stems = LinkedHashMap<String, StemInfo>()
        val surfaces = LinkedHashSet<String>()
        fun add(value: String, field: Field) {
            tokenize(value).forEach { surface ->
                surfaces += surface
                val key = stem(surface)
                val existing = stems[key]
                if (existing == null || existing.weight < field.weight) stems[key] = StemInfo(field.weight, field, surface)
            }
        }
        add(tool.name, Field.NAME)
        val aliasPhrases = LinkedHashSet<String>()
        SEARCH_ALIASES[tool.id].orEmpty().forEach { phrase ->
            aliasPhrases += normalizeText(phrase)
            add(phrase, Field.ALIAS)
        }
        add(tool.id, Field.ID)
        tool.keywords.forEach { add(it, Field.KEYWORD) }
        tool.tags.forEach { add(it, Field.TAG) }
        add(tool.subcategory.orEmpty(), Field.SUBCATEGORY)
        add(tool.category, Field.CATEGORY)
        add(tool.description, Field.DESCRIPTION)
        return Doc(
            tool = tool,
            stems = stems,
            surfaces = surfaces,
            normalizedName = normalizeText(tool.name),
            normalizedId = tool.id.lowercase(Locale.ROOT),
            nameTokenCount = tokenize(tool.name).size,
            aliasPhrases = aliasPhrases,
            stemmedName = stemPhrase(tool.name),
        )
    }

    private fun idf(df: Int): Double = ln(1.0 + docs.size.toDouble() / (1.0 + df.toDouble()))

    private fun normalizeText(value: String): String = Normalizer.normalize(value, Normalizer.Form.NFKD)
        .replace(Regex("\\p{M}+"), "")
        .lowercase(Locale.ROOT)
        .replace("&", " and ")
        .replace(Regex("[^a-z0-9%+#\\s]+"), " ")
        .replace(Regex("\\s+"), " ")
        .trim()

    private fun tokenize(value: String): List<String> = normalizeText(value).split(' ')
        .filter { it.length > 1 || it == "%" }

    private fun stemPhrase(value: String): String = tokenize(formatNorm(normalizeText(value))).joinToString(" ") { stem(it) }

    private fun formatNorm(value: String): String = value.replace(Regex("\\bjpeg\\b"), "jpg").replace(Regex("\\btif\\b"), "tiff")

    private fun stem(token: String): String {
        if (token.length <= 3 || token.any(Char::isDigit)) return token
        var output = when {
            token.length > 4 && token.endsWith("ies") -> token.dropLast(3) + "y"
            token.length > 3 && Regex("(ses|xes|zes|ches|shes)$").containsMatchIn(token) -> token.dropLast(2)
            token.length > 3 && token.endsWith("s") && !token.endsWith("ss") && !token.endsWith("us") && !token.endsWith("is") -> token.dropLast(1)
            else -> token
        }
        listOf("ion", "ing", "ers", "er", "or", "ed", "e").firstOrNull { suffix ->
            output.endsWith(suffix) && output.length - suffix.length >= 4
        }?.let { suffix -> output = output.dropLast(suffix.length) }
        return output
    }

    private fun maxEdits(length: Int): Int = when {
        length >= 9 -> 2
        length >= 4 -> 1
        else -> 0
    }

    private fun boundedDistance(a: String, b: String, maxEdits: Int): Int {
        if (a == b) return 0
        if (kotlin.math.abs(a.length - b.length) > maxEdits) return maxEdits + 1
        val rows = Array(a.length + 1) { IntArray(b.length + 1) }
        for (i in 0..a.length) rows[i][0] = i
        for (j in 0..b.length) rows[0][j] = j
        for (i in 1..a.length) {
            var best = maxEdits + 1
            for (j in 1..b.length) {
                val cost = if (a[i - 1] == b[j - 1]) 0 else 1
                var value = minOf(rows[i - 1][j] + 1, rows[i][j - 1] + 1, rows[i - 1][j - 1] + cost)
                if (i > 1 && j > 1 && a[i - 1] == b[j - 2] && a[i - 2] == b[j - 1]) {
                    value = minOf(value, rows[i - 2][j - 2] + 1)
                }
                rows[i][j] = value
                best = minOf(best, value)
            }
            if (best > maxEdits) return maxEdits + 1
        }
        return rows[a.length][b.length]
    }

    companion object {
        private val STOP_WORDS = setOf(
            "a","an","the","to","of","for","my","me","i","do","how","can","you","what","is","are","make",
            "online","free","tool","tools","with","from","into","in","on","and","or","it","this","that","using",
            "use","want","need","please","best","app","something","some","get","be"
        )
        private val SYNONYMS = mapOf(
            "photo" to listOf("image","picture","pic"), "picture" to listOf("image","photo"), "pic" to listOf("image","photo"),
            "img" to listOf("image"), "compress" to listOf("minify","shrink","optimize","size"), "smaller" to listOf("compress","shrink","reduce"),
            "shrink" to listOf("compress","reduce"), "reduce" to listOf("compress","shrink"), "resize" to listOf("scale","dimensions","size"),
            "json" to listOf("javascript object"), "pwd" to listOf("password"), "pass" to listOf("password"), "bmi" to listOf("body mass","weight"),
            "percent" to listOf("percentage","%"), "qr" to listOf("qrcode","barcode"), "regexp" to listOf("regex"), "regular" to listOf("regex"),
            "uuid" to listOf("guid"), "hash" to listOf("checksum","digest","sha","md5"), "color" to listOf("colour","hex","rgb"),
            "colour" to listOf("color"), "mockup" to listOf("fake","demo","chat","screenshot"), "invoice" to listOf("bill","receipt"),
            "pdf" to listOf("document"), "encode" to listOf("encoding","base64"), "decode" to listOf("decoding"),
            "a11y" to listOf("accessibility"), "contrast" to listOf("color contrast","wcag"), "alt" to listOf("alt-text","image description"),
            "focus" to listOf("focus ring","focus state"), "aria" to listOf("accessible name","accessibility tree"),
            "tab" to listOf("keyboard navigation","tab order"), "animation" to listOf("motion","reduced motion"),
            "readability" to listOf("plain language","text spacing"), "merge" to listOf("combine","join"),
            "combine" to listOf("merge","join"), "join" to listOf("merge","combine"), "split" to listOf("separate","divide"),
            "change" to listOf("convert"), "transform" to listOf("convert"), "create" to listOf("generate"),
            "scan" to listOf("read","reader"), "scanner" to listOf("reader","scan"), "calc" to listOf("calculator"),
            "jpeg" to listOf("jpg"), "jpg" to listOf("jpeg"), "tiff" to listOf("tif"), "tif" to listOf("tiff")
        )
        private val SEARCH_ALIASES = mapOf(
            "pdf-merger" to listOf("pdf joiner"),
            "image-compressor" to listOf("image size reducer", "reduce image size"),
            "image-resizer" to listOf("change image size"),
            "qr-generator" to listOf("qr maker", "qr code maker"),
            "json-formatter" to listOf("json viewer", "format json online"),
            "video-to-mp3" to listOf("mp4 to mp3", "convert mp4 to mp3"),
            "video-trimmer" to listOf("trim mp4", "cut video", "video cutter"),
            "video-to-gif" to listOf("mp4 to gif"),
            "exif-remover" to listOf("strip exif", "remove metadata from photo"),
            "heic-converter" to listOf("iphone photo to jpg", "heic to jpg"),
            "file-png-to-jpg-converter" to listOf("png to jpeg"),
            "lorem-ipsum-generator" to listOf("dummy text", "placeholder text"),
            "regex-tester" to listOf("test regular expression", "regexp tester")
        )
    }
}

/** Web-only records retained in the native search corpus solely to preserve Web IDF and ranking parity.
 * They are removed from returned results and are not added to the native catalogue or route registry.
 */
internal val webOnlySearchReferenceIds = setOf("scene-studio", "smartphone-prototype-lab")

private val webOnlySearchReferenceTools = listOf(
    ToolRecord(
        id = "scene-studio",
        name = "Scene Studio",
        slug = "scene-studio",
        description = "Create local 2D and 3D animated scenes with structured scene data, validation, preview, captions, audio layers, project-bundle saving and MP4 export where browser support allows.",
        category = "video",
        keywords = listOf("scene studio", "3d", "2d", "animation", "video maker", "scene", "ai video", "chatbot", "json scene", "captions", "subtitles", "mp4", "render", "export video", "cinematic", "no code", "motion graphics", "babylon"),
        tags = listOf("3d", "2d", "animation", "video", "captions", "ai", "creator", "no code"),
        icon = "Clapperboard",
        popularity = 1250,
        featured = false,
        clientSide = true,
        requiresBackend = false,
        requiresAuth = false,
        status = "active",
        related = listOf("video-trimmer", "video-compressor", "video-poster-generator"),
        engine = EngineInfo("custom", "scene-studio"),
        subcategory = "Scene editing",
    ),
    ToolRecord(
        id = "smartphone-prototype-lab",
        name = "Smartphone Prototype Lab",
        slug = "smartphone-prototype-lab",
        description = "Explore a generic smartphone as an interactive 3D production model. Inspect the display stack, motherboard packages, cameras, power systems, materials and factory assembly sequence.",
        category = "design",
        keywords = listOf("smartphone", "phone", "prototype", "3d", "3d model", "product engineering", "manufacturing", "production", "hardware", "electronics", "motherboard", "pcb", "soc", "cpu", "gpu", "npu", "ram", "storage", "display", "oled", "lcd", "camera", "battery", "assembly"),
        tags = listOf("smartphone", "3d", "engineering", "manufacturing", "hardware", "electronics", "product design"),
        icon = "Smartphone",
        popularity = 1350,
        featured = false,
        clientSide = true,
        requiresBackend = false,
        requiresAuth = false,
        status = "active",
        related = emptyList(),
        engine = EngineInfo("custom", "smartphone-prototype-lab"),
        subcategory = "Product engineering",
    ),
)

/** The Web and assistant use the same pool; legacy related-reference records are included exactly once. */
internal fun Catalog.searchableToolsForSearch(includeRelatedReferences: Boolean): List<ToolRecord> {
    val source = if (includeRelatedReferences) tools + relatedReferenceTools else tools
    val general = source.filter {
        it.category != "accessibility" &&
            "developer-studio" !in it.tags &&
            it.id != "audio-analyze-studio"
    }
    val accessibility = accessibilityDiscoveryTools().filter { it.category == "accessibility" }
    // Preserve the exact Web corpus for IDF/ranking, while the public native search wrapper
    // filters these Web-only references from every returned result.
    return (general + accessibility + developerStudioTools() + webOnlySearchReferenceTools).distinctBy { it.id }
}
