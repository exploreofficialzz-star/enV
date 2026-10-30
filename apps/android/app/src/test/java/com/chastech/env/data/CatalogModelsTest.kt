package com.chastech.env.data

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class CatalogModelsTest {
    @Test fun runtimeMusicDownloaderAdditionIsUniqueAndSearchable() {
        val base = Catalog(1, "test", CatalogCounts(0, 0, 0, 1), emptyList(), emptyList())
        val catalog = base.withMusicDownloader()
        assertEquals(1, catalog.tools.count { it.id == "music-downloader" })
        assertEquals(1, catalog.counts.total)
        assertEquals(1, catalog.counts.active)
        assertEquals("music-downloader", catalog.search("music downloader").first().id)
        assertEquals("music-downloader", catalog.search("Audiomack").first().id)
        assertEquals("music-downloader", catalog.search("Boomplay").first().id)
        assertEquals("music-downloader", catalog.search("YouTube Music").first().id)
        assertEquals(catalog, catalog.withMusicDownloader())
    }

    @Test fun accessibilitySearchUsesEightStudiosAndKeepsLegacyAliases() {
        val ids = listOf("contrast-checker", "alt-text-checker", "focus-state-checker", "text-readability-checker", "aria-checker", "motion-checker", "keyboard-navigation-checker", "form-checker")
        val sources = ids.map { id -> ToolRecord(id, id, id, "", "accessibility", emptyList(), emptyList(), "Accessibility", 10, false, true, false, false, "active", emptyList(), EngineInfo("custom", id)) }
        val catalog = Catalog(1, "test", CatalogCounts(8, 8, 0, 1), emptyList(), sources)
        val studios = catalog.search("", "accessibility")
        assertEquals(8, studios.size)
        assertEquals(8, studios.map { it.id }.distinct().size)
        assertEquals("focus-state-checker", catalog.search("focus ring", "accessibility").first().id)
        assertEquals("focus-state-checker", catalog.accessibilityStudioForId("focus-state-generator")?.id)
        assertEquals(7, catalog.relatedTools(studios.first { it.id == "aria-checker" }, 20).count { it.category == "accessibility" })
    }

    @Test fun developerCategoryProjectsFifteenNativeStudiosWithoutDroppingSourceTools() {
        val sources = NativeDeveloperStudios.specs.distinctBy { it.sourceId }.map { spec ->
            ToolRecord(spec.sourceId, spec.sourceId, spec.sourceId, "source", "developer", emptyList(), emptyList(), "Code", 10, false, true, false, false, "active", emptyList(), EngineInfo("developer", spec.sourceId, mapOf("op" to (spec.modes.firstOrNull()?.op ?: spec.sourceId))))
        }
        val catalog = Catalog(1, "test", CatalogCounts(sources.size, sources.size, 0, 1), emptyList(), sources)
        val studios = catalog.developerStudioTools()
        assertEquals(15, studios.size)
        assertEquals(15, studios.map { it.id }.distinct().size)
        assertTrue(studios.any { it.id == "the-world-lab" })
        val uxUiStudio = NativeDeveloperStudios.specs.first { it.id == "ux-ui-studio" }
        assertTrue(uxUiStudio.modes.map { it.key }.containsAll(listOf("workspace", "components", "icons", "tokens", "presets")))
        assertTrue(studios.all { it.engine.type == "developer" })
        assertTrue(NativeDeveloperStudios.specs.all { it.modes.isNotEmpty() && it.modes.map { mode -> mode.key }.distinct().size == it.modes.size })
        assertTrue(NativeDeveloperStudios.specs.any { spec -> spec.modes.any { it.key == "base64" && it.decodeOp == "base64-decoder" } })
        assertEquals("diff", NativeDeveloperStudios.modeForLegacySlug(NativeDeveloperStudios.forLegacySlug("json-diff"), "json-diff"))
        assertEquals("file", NativeDeveloperStudios.modeForLegacySlug(NativeDeveloperStudios.forLegacySlug("file-hash-calculator"), "file-hash-calculator"))
        assertEquals("dockerfile", NativeDeveloperStudios.modeForLegacySlug(NativeDeveloperStudios.forLegacySlug("developer-dockerfile-helper"), "developer-dockerfile-helper"))
        assertEquals("developer-gitignore-generator", studios.first { it.id == "devops-studio" }.engine.extras["op"])
        assertEquals(15, catalog.search("", "developer").count { "developer-studio" in it.tags })
        assertTrue(catalog.tools.any { it.id == "json-formatter" })
        assertTrue(NativeDeveloperStudios.specs.first { it.id == "json-studio" }.modes.any { it.key == "schema" })
        assertTrue(NativeDeveloperStudios.specs.first { it.id == "markup-studio" }.modes.any { it.key == "samples" })
        val legacyHash = ToolRecord("sha256-hash", "SHA-256", "sha256-hash", "", "developer", emptyList(), emptyList(), "Code", 1, false, true, false, false, "active", emptyList(), EngineInfo("codec", "sha256-hash"))
        val legacySample = ToolRecord("lorem-ipsum-generator", "Lorem Ipsum", "lorem-ipsum-generator", "", "developer", emptyList(), emptyList(), "Code", 1, false, true, false, false, "active", emptyList(), EngineInfo("generator", "lorem-ipsum-generator"))
        assertEquals("hash-studio", catalog.developerStudioForLegacyTool(legacyHash)?.id)
        assertEquals("markup-studio", catalog.developerStudioForLegacyTool(legacySample)?.id)
        assertEquals(null, catalog.developerStudioForLegacyTool(studios.first()))
    }

    @Test fun parsesKnownFieldsAndIgnoresUnknownKeys() {
        val catalog = Catalog.fromJson("""
            {"schemaVersion":1,"catalogVersion":"test","counts":{"total":1,"active":1,"planned":0,"categories":1},
             "categories":[{"id":"text","name":"Text","description":"d","blurb":"b","icon":"Type","future":true}],
             "tools":[{"id":"x","name":"Text Counter","slug":"text-counter","description":"Count words","category":"text","keywords":["words"],"tags":["local"],"icon":"Type","popularity":42,"featured":true,"clientSide":true,"requiresBackend":false,"requiresAuth":false,"status":"active","disclaimer":"finance","related":[],"engine":{"type":"custom","id":"x","newSetting":{"safe":true}},"futureField":{"ignored":true}}]}
        """.trimIndent())
        assertEquals(1, catalog.tools.size)
        assertEquals("custom", catalog.tools.single().engine.type)
        assertTrue(catalog.tools.single().engine.extras["newSetting"].orEmpty().contains("safe"))
        assertEquals("Estimates based on your inputs — not financial advice.", catalog.tools.single().nativeDisclaimerText())
    }

    @Test fun searchesNameDescriptionKeywordsTagsAndRanksRelevanceBeforePopularity() {
        val catalog = Catalog.fromJson("""
            {"counts":{},"categories":[],"tools":[
              {"id":"a","name":"Alpha","description":"other","category":"x","keywords":["needle"],"tags":[],"popularity":2,"status":"active"},
              {"id":"b","name":"Beta","description":"needle description","category":"x","keywords":[],"tags":[],"popularity":9,"status":"active"},
              {"id":"c","name":"Gamma","description":"other","category":"y","keywords":[],"tags":["needle"],"popularity":99,"status":"active"}]}
        """.trimIndent())
        assertEquals(listOf("a", "c", "b"), catalog.search("needle").map { it.id })
        assertEquals(listOf("a", "b"), catalog.search("needle", "x").map { it.id })
    }

    @Test fun favoriteSetToggleIsDeterministic() {
        val initial = emptySet<String>()
        val added = initial + "tool-a"
        val removed = added - "tool-a"
        assertTrue("tool-a" in added)
        assertEquals(emptySet<String>(), removed)
    }

    @Test fun relatedToolsPreserveCatalogOrderAndUseAlphabeticalCategoryFallback() {
        val catalog = Catalog.fromJson("""
            {"counts":{},"categories":[],"tools":[
              {"id":"current","name":"Current","category":"text","related":["zeta","planned","missing"],"status":"active"},
              {"id":"zeta","name":"Zeta","category":"text","status":"active"},
              {"id":"planned","name":"Aardvark planned","category":"text","status":"planned"},
              {"id":"alpha","name":"Álpha","category":"text","status":"active"},
              {"id":"bravo","name":"Bravo","category":"text","status":"active"},
              {"id":"other","name":"Alpha","category":"other","status":"active"}]}
        """.trimIndent())

        assertEquals(listOf("zeta", "alpha", "bravo"), catalog.relatedTools(catalog.tools.first()).map { it.id })
    }
}
