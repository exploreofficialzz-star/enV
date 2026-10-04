package com.chastech.env.data

import android.content.Context
import android.content.SharedPreferences

class FavoritesStore(context: Context) {
    private val preferences: SharedPreferences = context.getSharedPreferences("env_preferences", Context.MODE_PRIVATE)
    private val key = "favorite_tool_ids"

    fun getFavorites(): Set<String> = preferences.getStringSet(key, emptySet())?.toSet() ?: emptySet()

    fun isFavorite(toolId: String): Boolean = toolId in getFavorites()

    fun toggle(toolId: String): Set<String> {
        val next = getFavorites().toMutableSet().apply { if (!add(toolId)) remove(toolId) }.toSet()
        preferences.edit().putStringSet(key, next).apply()
        return next
    }
}
