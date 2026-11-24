package com.chastech.env.data

import java.io.File
import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Test

class NativeCatalogSearchTest {
    private fun repositoryRoot(): File {
        var current = File(System.getProperty("user.dir")).absoluteFile
        repeat(12) {
            if (File(current, "apps/shared/catalog.json").isFile &&
                File(current, "audit/discovery/search-eval/native-golden.v1.json").isFile
            ) return current
            current = current.parentFile ?: return@repeat
        }
        throw IllegalStateException("Could not locate the enV repository root from ${System.getProperty("user.dir")}.")
    }

    @Test fun nativeSearchMatchesTheCommittedWebGoldenQueries() {
        val root = repositoryRoot()
        val catalog = Catalog.fromJson(File(root, "apps/shared/catalog.json").readText())
            .withMusicDownloader()
            .withSongMetadataAnalyzer()
            .withABook()
            .withZipArchive()
            .withFileWorkspaceTools()
            .withCameraStudio()
            .withDateTimeExtensions()
        val searchable = catalog.searchableToolsForSearch(includeRelatedReferences = true)
        val fixture = JSONObject(File(root, "audit/discovery/search-eval/native-golden.v1.json").readText())
        val expectedPoolSize = fixture.getInt("poolSize")
        assertEquals("Android searchable pool must match the Web golden corpus.", expectedPoolSize, searchable.size)

        val cases = fixture.getJSONArray("cases")
        for (index in 0 until cases.length()) {
            val testCase = cases.getJSONObject(index)
            val query = testCase.getString("query")
            val expectedJson = testCase.getJSONArray("top10")
            val expected = (0 until expectedJson.length()).map { expectedJson.getString(it) }
            val actual = catalog.webSearch(query, limit = 10, includeRelatedReferences = true).map { it.id }
            assertEquals("Native/Web search mismatch for query: '$query'", expected, actual)
        }
    }

    @Test fun relatedReferencePoolIsIncludedOnlyWhenRequested() {
        val root = repositoryRoot()
        val catalog = Catalog.fromJson(File(root, "apps/shared/catalog.json").readText())
            .withMusicDownloader()
            .withSongMetadataAnalyzer()
            .withABook()
            .withZipArchive()
            .withFileWorkspaceTools()
            .withCameraStudio()
            .withDateTimeExtensions()
        val referenceOnly = catalog.relatedReferenceTools.firstOrNull {
            it.category != "accessibility" &&
                "developer-studio" !in it.tags &&
                it.id != "audio-analyze-studio" &&
                catalog.tools.none { base -> base.id == it.id }
        } ?: error("Expected at least one Web-only related-reference record in the native catalog.")

        val defaultIDs = catalog.webSearch("", Int.MAX_VALUE).map { it.id }.toSet()
        val extendedIDs = catalog.webSearch("", Int.MAX_VALUE, includeRelatedReferences = true).map { it.id }.toSet()
        assertEquals(false, referenceOnly.id in defaultIDs)
        assertEquals(true, referenceOnly.id in extendedIDs)
    }

    @Test fun nonPositiveSearchLimitsReturnNoTools() {
        val base = Catalog(1, "test", CatalogCounts(0, 0, 0, 0), emptyList(), emptyList())
        assertEquals(emptyList<ToolRecord>(), base.webSearch("anything", 0))
        assertEquals(emptyList<ToolRecord>(), base.webSearch("anything", -1))
    }
}
