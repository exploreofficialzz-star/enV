package com.chastech.env

import org.json.JSONArray
import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Test

class NativeMusicDataSandboxTest {
    @Test fun parentFolderLimitsIncludeSubfolders() {
        val folders = listOf(
            JSONObject().put("id", "root").put("parent", "").put("maxSongs", 1).put("maxMB", 10),
            JSONObject().put("id", "child").put("parent", "root").put("maxSongs", 10).put("maxMB", 10),
        )
        val tracks = listOf(JSONObject().put("folder", "child").put("size", 100))
        assertThrows(IllegalArgumentException::class.java) { nativeSandboxFolderCapacity("child", folders, tracks, 100) }
        assertEquals(setOf("root", "child"), sandboxNativeDescendants("root", folders))
    }

    @Test fun reviewedTrainingRecordsRequireRightsAndRealDescriptions() {
        val tags = JSONObject().put("id", "song_01").put("genre", "Afro-fusion").put("language", JSONArray(listOf("Yoruba")))
            .put("license", "owned").put("source", "Permission on file").put("descriptions", JSONArray(listOf("Warm guitar", "Soft percussion")))
        val track = JSONObject().put("tags", tags).put("audio", "one.wav").put("lyrics", "Ẹ káàrọ̀").put("clearance", "cleared").put("reviewed", true)
        assertTrue(sandboxNativeReady(track))
        track.put("tagsDraft", "{")
        assertFalse(sandboxNativeReady(track))
        track.remove("tagsDraft"); track.put("clearance", "pending")
        assertFalse(sandboxNativeReady(track))
        track.put("clearance", "cleared"); tags.put("descriptions", JSONArray(listOf("", "Warm guitar")))
        assertFalse(sandboxNativeReady(track))
        track.put("audio", ""); assertTrue(sandboxNativeReady(track))
        tags.put("tempo_bpm", 401); assertFalse(sandboxNativeReady(track))
    }

    @Test fun trainingTextKeepsUnicodeAndExcludesPrivateMetadata() {
        val tags = JSONObject().put("genre", "Jazz").put("mood", JSONArray(listOf("calm"))).put("language", JSONArray(listOf("Yoruba")))
            .put("source", "private permission").put("license", "owned").put("tempo_bpm", 120)
        val caption = nativeSandboxCaption(tags)
        assertEquals("Jazz, calm, sung in Yoruba", caption)
        assertEquals("[Verse]\nẸ káàrọ̀", nativeSandboxLyrics("[verse 1 | Yoruba]\nẸ káàrọ̀"))
        assertThrows(IllegalStateException::class.java) { validateNativeSandboxTags(JSONObject().put("mood", "not an array")) }
    }
    @Test fun derivedTempoBandsNeverOverwriteHumanTags() {
        assertEquals("slow", nativeSandboxTempoBand(89.9))
        assertEquals("mid", nativeSandboxTempoBand(90.0))
        assertEquals("fast", nativeSandboxTempoBand(130.0))
        assertEquals("", nativeSandboxTempoBand(Double.NaN))
        val tags = JSONObject().put("tempo_bpm", 110)
        val track = JSONObject().put("tags", tags)
        nativeSandboxSuggestTempoBand(track)
        assertEquals("mid", tags.optString("tempo_band"))
        tags.put("tempo_bpm", 150); nativeSandboxSuggestTempoBand(track)
        assertEquals("fast", tags.optString("tempo_band"))
        tags.put("tempo_band", "human choice"); track.put("tempoBandEdited", true)
        nativeSandboxSuggestTempoBand(track)
        assertEquals("human choice", tags.optString("tempo_band"))
    }
}
