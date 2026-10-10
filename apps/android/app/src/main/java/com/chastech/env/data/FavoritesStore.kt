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

    fun getFavorites(): Set<String> = preferences.getStringSet(key, emptySet())?.toSet() ?: emptySet()

    fun isFavorite(toolId: String): Boolean = toolId in getFavorites()

    fun toggle(toolId: String): Set<String> {
        val next = getFavorites().toMutableSet().apply { if (!add(toolId)) remove(toolId) }.toSet()
        preferences.edit().putStringSet(key, next).apply()
        return next
    }

    fun getRecent(): List<String> = runCatching {
        val array = JSONArray(preferences.getString(recentKey, "[]") ?: "[]")
        (0 until array.length()).map { array.optString(it) }.filter { it.isNotBlank() && it != "null" }.distinct().take(24)
    }.getOrDefault(emptyList())

    fun getMostUsed(limit: Int = 8): List<String> {
        val recent = getRecent()
        val counts = runCatching { JSONObject(preferences.getString(usageKey, "{}") ?: "{}") }.getOrElse { JSONObject() }
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
