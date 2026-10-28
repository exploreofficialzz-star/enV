package com.chastech.env.data

import android.content.Context
import android.content.SharedPreferences
import org.json.JSONArray
import org.json.JSONObject

class FavoritesStore(context: Context) {
    private val preferences: SharedPreferences = context.getSharedPreferences("env_preferences", Context.MODE_PRIVATE)
    private val key = "favorite_tool_ids"
    private val recentKey = "recent_tool_ids"
    private val usageKey = "tool_use_counts"
    private val themeKey = "theme_mode"

    fun getFavorites(): Set<String> {
        val stored = preferences.getStringSet(key, emptySet())?.toSet() ?: emptySet()
        if ("audio-analyze-studio" !in stored) return stored
        val migrated = stored - "audio-analyze-studio" + "song-metadata-analyzer"
        preferences.edit().putStringSet(key, migrated).apply()
        return migrated
    }

    fun isFavorite(toolId: String): Boolean = toolId in getFavorites()

    fun toggle(toolId: String): Set<String> {
        val next = getFavorites().toMutableSet().apply { if (!add(toolId)) remove(toolId) }.toSet()
        preferences.edit().putStringSet(key, next).apply()
        return next
    }

    fun getRecent(): List<String> = runCatching {
        val array = JSONArray(preferences.getString(recentKey, "[]") ?: "[]")
        (0 until array.length()).map { array.optString(it) }.filter { it.isNotBlank() && it != "null" }.map { if (it == "audio-analyze-studio") "song-metadata-analyzer" else it }.distinct().take(24)
    }.getOrDefault(emptyList())

    fun getMostUsed(limit: Int = 10): List<String> {
        val recent = getRecent()
        val counts = runCatching { JSONObject(preferences.getString(usageKey, "{}") ?: "{}") }.getOrElse { JSONObject() }
        if (counts.has("audio-analyze-studio")) { counts.put("song-metadata-analyzer", counts.optInt("song-metadata-analyzer") + counts.optInt("audio-analyze-studio")); counts.remove("audio-analyze-studio") }
        val candidates = (recent + counts.keys().asSequence().toList()).distinct()
        val recency = recent.withIndex().associate { it.value to it.index }
        return candidates.sortedWith(
            compareByDescending<String> { counts.optInt(it, 0) }
                .thenBy { recency[it] ?: Int.MAX_VALUE }
                .thenBy { it },
        ).take(limit.coerceAtLeast(0))
    }

    fun recordRecent(toolId: String): List<String> {
        if (toolId.isBlank()) return getRecent()
        val next = (listOf(toolId) + getRecent().filterNot { it == toolId }).take(24)
        val counts = runCatching { JSONObject(preferences.getString(usageKey, "{}") ?: "{}") }.getOrElse { JSONObject() }
        counts.put(toolId, (counts.optInt(toolId, 0) + 1).coerceAtMost(1_000_000))
        preferences.edit()
            .putString(recentKey, JSONArray(next).toString())
            .putString(usageKey, counts.toString())
            .apply()
        return next
    }

    fun getThemeMode(): String = preferences.getString(themeKey, "system")
        ?.takeIf { it == "system" || it == "light" || it == "dark" } ?: "system"

    fun setThemeMode(mode: String) {
        require(mode == "system" || mode == "light" || mode == "dark")
        preferences.edit().putString(themeKey, mode).apply()
    }
}
