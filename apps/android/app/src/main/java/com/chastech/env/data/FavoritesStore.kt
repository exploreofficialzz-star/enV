package com.chastech.env.data

import android.content.Context
import android.content.SharedPreferences

class FavoritesStore(context: Context) {
    private val preferences: SharedPreferences = context.getSharedPreferences("env_preferences", Context.MODE_PRIVATE)
    private val key = "favorite_tool_ids"
    private val themeKey = "theme_mode"

    fun getFavorites(): Set<String> = preferences.getStringSet(key, emptySet())?.toSet() ?: emptySet()

    fun isFavorite(toolId: String): Boolean = toolId in getFavorites()

    fun toggle(toolId: String): Set<String> {
        val next = getFavorites().toMutableSet().apply { if (!add(toolId)) remove(toolId) }.toSet()
        preferences.edit().putStringSet(key, next).apply()
        return next
    }

    fun getThemeMode(): String = preferences.getString(themeKey, "system")
        ?.takeIf { it == "system" || it == "light" || it == "dark" } ?: "system"

    fun setThemeMode(mode: String) {
        require(mode == "system" || mode == "light" || mode == "dark")
        preferences.edit().putString(themeKey, mode).apply()
    }
}
