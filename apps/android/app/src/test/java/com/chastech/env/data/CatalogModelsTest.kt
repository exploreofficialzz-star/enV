package com.chastech.env.data

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class CatalogModelsTest {
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

    @Test fun searchesNameDescriptionKeywordsTagsAndSortsByPopularity() {
        val catalog = Catalog.fromJson("""
            {"counts":{},"categories":[],"tools":[
              {"id":"a","name":"Alpha","description":"other","category":"x","keywords":["needle"],"tags":[],"popularity":2,"status":"active"},
              {"id":"b","name":"Beta","description":"needle description","category":"x","keywords":[],"tags":[],"popularity":9,"status":"active"},
              {"id":"c","name":"Gamma","description":"other","category":"y","keywords":[],"tags":["needle"],"popularity":99,"status":"active"}]}
        """.trimIndent())
        assertEquals(listOf("c", "b", "a"), catalog.search("needle").map { it.id })
        assertEquals(listOf("b", "a"), catalog.search("needle", "x").map { it.id })
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
