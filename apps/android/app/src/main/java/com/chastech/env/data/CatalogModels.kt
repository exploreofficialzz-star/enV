package com.chastech.env.data

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
)

data class Catalog(
    val schemaVersion: Int,
    val catalogVersion: String,
    val counts: CatalogCounts,
    val categories: List<Category>,
    val tools: List<ToolRecord>,
){
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
    val tools = buildList(toolsJson.length()) { for (i in 0 until toolsJson.length()) add(toolsJson.getJSONObject(i).toToolRecord()) }
        .filterNot { NativeCopy.isWebRuntimeOnly(it.id) }
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
    )
}

fun Catalog.search(query: String, categoryId: String? = null): List<ToolRecord> {
    val needle = query.trim().lowercase()
    return tools.asSequence().filter { categoryId == null || it.category == categoryId }.filter { tool ->
        needle.isEmpty() || sequenceOf(tool.name, tool.description, tool.id, tool.slug).plus(tool.keywords.asSequence()).plus(tool.tags.asSequence()).any { it.lowercase().contains(needle) }
    }.sortedWith(compareByDescending<ToolRecord> { it.popularity }.thenBy { it.name }).toList()
}

fun Catalog.featuredOrPopular(limit: Int = 8): List<ToolRecord> = tools.asSequence()
    .filter { it.featured || it.status == "active" }.sortedWith(compareByDescending<ToolRecord> { it.featured }.thenByDescending { it.popularity }.thenBy { it.name }).take(limit).toList()
