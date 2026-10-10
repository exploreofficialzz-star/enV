package com.chastech.env.data

import java.text.Normalizer
import java.util.Locale
import org.json.JSONArray
import org.json.JSONObject

/** Native catalog models intentionally read known fields and safely ignore future keys. */
data class CatalogCounts(val total: Int, val active: Int, val planned: Int, val categories: Int)
data class Category(val id: String, val name: String, val description: String, val blurb: String, val icon: String)
data class EngineInfo(val type: String, val id: String, val extras: Map<String, String> = emptyMap())
data class ToolRecord(
    val id: String,
    val name: String,
    val slug: String,
    val description: String,
    val category: String,
    val keywords: List<String>,
    val tags: List<String>,
    val icon: String,
    val popularity: Int,
    val featured: Boolean,
    val clientSide: Boolean,
    val requiresBackend: Boolean,
    val requiresAuth: Boolean,
    val status: String,
    val related: List<String>,
    val engine: EngineInfo,
    val subcategory: String? = null,
    val disclaimer: String? = null,
)

data class Catalog(
    val schemaVersion: Int,
    val catalogVersion: String,
    val counts: CatalogCounts,
    val categories: List<Category>,
    val tools: List<ToolRecord>,
    val relatedReferenceTools: List<ToolRecord> = emptyList(),
){
    val browserActiveToolCount: Int
        get() = (tools + relatedReferenceTools).count { it.status == "active" || it.status == "beta" }

    companion object {}
}

private fun JSONObject.stringOrEmpty(key: String) = optString(key, "")
private fun JSONObject.stringList(key: String): List<String> = optJSONArray(key)?.let { array ->
    buildList(array.length()) { for (i in 0 until array.length()) add(array.optString(i)) }
} ?: emptyList()

fun JSONObject.toCategory() = Category(
    id = stringOrEmpty("id"),
    name = stringOrEmpty("name"),
    description = NativeCopy.text(stringOrEmpty("description")),
    blurb = NativeCopy.text(stringOrEmpty("blurb")),
    icon = stringOrEmpty("icon"),
)

fun JSONObject.toToolRecord(): ToolRecord {
    val engineJson = optJSONObject("engine") ?: JSONObject()
    val knownEngineKeys = setOf("type", "id")
    val extras = engineJson.keys().asSequence().filterNot(knownEngineKeys::contains).associateWith { engineJson.optString(it) }
    return ToolRecord(
        id = stringOrEmpty("id"), name = stringOrEmpty("name"), slug = stringOrEmpty("slug"),
        description = NativeCopy.text(stringOrEmpty("description")), category = stringOrEmpty("category"),
        subcategory = optString("subcategory").takeIf { it.isNotBlank() },
        disclaimer = optString("disclaimer").takeIf { it.isNotBlank() },
        keywords = stringList("keywords"), tags = stringList("tags"), icon = stringOrEmpty("icon"),
        popularity = optInt("popularity", 0), featured = optBoolean("featured", false),
        clientSide = optBoolean("clientSide", false), requiresBackend = optBoolean("requiresBackend", false),
        requiresAuth = optBoolean("requiresAuth", false), status = stringOrEmpty("status"),
        related = stringList("related"), engine = EngineInfo(engineJson.stringOrEmpty("type"), engineJson.stringOrEmpty("id"), extras)
    )
}

fun Catalog.Companion.fromJson(raw: String): Catalog {
    val root = JSONObject(raw)
    val categoriesJson = root.optJSONArray("categories") ?: JSONArray()
    val toolsJson = root.optJSONArray("tools") ?: JSONArray()
    val categories = buildList(categoriesJson.length()) { for (i in 0 until categoriesJson.length()) add(categoriesJson.getJSONObject(i).toCategory()) }
    val allTools = buildList(toolsJson.length()) { for (i in 0 until toolsJson.length()) {
        val tool = toolsJson.getJSONObject(i).toToolRecord()
        add(tool)
    } }
    val tools = allTools.filterNot { NativeCopy.isWebRuntimeOnly(it.id) }
    val relatedReferenceTools = allTools.filter { NativeCopy.isWebRuntimeOnly(it.id) }
    val planned = tools.count { it.status.equals("planned", ignoreCase = true) }
    val active = tools.count { it.status.equals("active", ignoreCase = true) }
    return Catalog(
        schemaVersion = root.optInt("schemaVersion", 1), catalogVersion = root.stringOrEmpty("catalogVersion"),
        counts = CatalogCounts(
            total = tools.size,
            active = active,
            planned = planned,
            categories = categories.size,
        ),
        categories = categories,
        tools = tools,
        relatedReferenceTools = relatedReferenceTools,
    )
}

private val webSearchSynonyms = mapOf(
    "photo" to listOf("image", "picture", "pic"), "picture" to listOf("image", "photo"), "pic" to listOf("image", "photo"),
    "img" to listOf("image"), "compress" to listOf("minify", "shrink", "optimize", "size"), "resize" to listOf("scale", "dimensions", "size"),
    "json" to listOf("javascript object"), "pwd" to listOf("password"), "pass" to listOf("password"), "bmi" to listOf("body mass", "weight"),
    "percent" to listOf("percentage", "%"), "qr" to listOf("qrcode", "barcode"), "uuid" to listOf("guid"),
    "hash" to listOf("checksum", "digest", "sha", "md5"), "color" to listOf("colour", "hex", "rgb"),
    "mockup" to listOf("fake", "demo", "chat", "screenshot"), "invoice" to listOf("bill", "receipt"), "pdf" to listOf("document"),
    "encode" to listOf("encoding", "base64"), "decode" to listOf("decoding"),
)

fun Catalog.webSearch(query: String, limit: Int = Int.MAX_VALUE, includeRelatedReferences: Boolean = false): List<ToolRecord> {
    val q = query.trim().lowercase()
    val candidates = if (includeRelatedReferences) tools + relatedReferenceTools else tools
    if (q.isEmpty()) return candidates.sortedByDescending { it.popularity }.take(limit)
    val tokens = q.split(Regex("[^a-z0-9%+]+" )).filter { it.length > 1 || it == "%" }
    val expanded = (tokens + tokens.flatMap { webSearchSynonyms[it].orEmpty() }).toSet()
    fun score(tool: ToolRecord): Int {
        val name = tool.name.lowercase()
        if (name == q || tool.id == q) return 2000 + tool.popularity
        if (name.startsWith(q)) return 1400 + tool.popularity
        if (tool.id.contains(q) || name.contains(q)) return 1000 + tool.popularity
        val hay = listOf(tool.name, tool.description, tool.category, tool.subcategory.orEmpty(), tool.id).plus(tool.keywords).plus(tool.tags).joinToString(" ").lowercase()
        var hits = 0
        expanded.forEach { token ->
            if (name.contains(token)) hits += 8
            else if (tool.keywords.any { it.lowercase().contains(token) }) hits += 5
            else if (hay.contains(token)) hits += 2
        }
        return if (hits == 0) 0 else hits * 40 + tool.popularity
    }
    return candidates.map { it to score(it) }.filter { it.second > 0 }.sortedByDescending { it.second }.take(limit).map { it.first }
}

fun Catalog.search(query: String, categoryId: String? = null): List<ToolRecord> {
    val needle = query.trim().lowercase()
    return (tools + relatedReferenceTools).asSequence().filter { categoryId == null || it.category == categoryId }.filter { tool ->
        needle.isEmpty() || sequenceOf(tool.name, tool.description, tool.id, tool.slug).plus(tool.keywords.asSequence()).plus(tool.tags).any { it.lowercase().contains(needle) }
    }.sortedWith(compareByDescending<ToolRecord> { it.popularity }.thenBy { it.name }).toList()
}

private fun relatedAlphabeticalKey(value: String): String =
    Normalizer.normalize(value, Normalizer.Form.NFKD)
        .replace(Regex("\\p{M}+"), "")
        .lowercase(Locale.ROOT)
        .replace(Regex("[^a-z0-9]+"), " ")
        .trim()

/** Mirrors the web registry: preserve declared related IDs, then fill from the same category alphabetically. */
fun Catalog.relatedTools(tool: ToolRecord, limit: Int = 6): List<ToolRecord> {
    val relatedCandidates = tools + relatedReferenceTools
    val byId = relatedCandidates.associateBy { it.id }
    val related = tool.related.mapNotNull(byId::get).filter { it.status != "planned" }
    if (related.size >= limit) return related.take(limit)
    val seen = (setOf(tool.id) + related.map { it.id })
    val rest = relatedCandidates.asSequence()
        .filter { it.category == tool.category && it.id !in seen && it.status != "planned" }
        .sortedWith(compareBy<ToolRecord>({ relatedAlphabeticalKey(it.name) }, { it.id }))
        .toList()
    return (related + rest).take(limit)
}

fun ToolRecord.nativeDisclaimerText(): String? = when (disclaimer) {
    "health" -> "Estimates only — not medical advice."
    "finance" -> "Estimates based on your inputs — not financial advice."
    "earnings" -> "Editable assumptions. Not a prediction of actual payouts."
    "mockup" -> "DEMO / MOCKUP / FICTIONAL — not authentic evidence."
    "estimate" -> "Approximate result. Check assumptions before relying on it."
    else -> null
}

fun Catalog.featuredOrPopular(limit: Int = 8): List<ToolRecord> = (tools + relatedReferenceTools).asSequence()
    .filter { it.featured || it.status == "active" }.sortedWith(compareByDescending<ToolRecord> { it.featured }.thenByDescending { it.popularity }.thenBy { it.name }).take(limit).toList()
