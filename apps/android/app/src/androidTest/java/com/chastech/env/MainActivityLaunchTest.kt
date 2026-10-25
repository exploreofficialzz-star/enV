package com.chastech.env

import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.onAllNodesWithText
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.compose.ui.test.onNodeWithText
import org.junit.Rule
import org.junit.Test

class MainActivityLaunchTest {
    @get:Rule val composeRule = createAndroidComposeRule<MainActivity>()

    @Test
    fun launchShowsNativeCatalogHome() {
        // CatalogGate reads and parses the bundled catalog asynchronously on Dispatchers.IO.
        // Wait for the real home content instead of racing the initial launch screen.
        composeRule.waitUntil(timeoutMillis = 15_000) {
            composeRule.onAllNodesWithText("A focused toolkit for\neveryday work.")
                .fetchSemanticsNodes().isNotEmpty()
        }
        composeRule.onNodeWithText("A focused toolkit for\neveryday work.").assertIsDisplayed()
        composeRule.onNodeWithText("Search for a tool").assertIsDisplayed()
        composeRule.onNodeWithText("AI Agent").assertIsDisplayed()
        composeRule.onNodeWithText("Total token = 100").assertIsDisplayed()
        composeRule.onNodeWithText("Trending tools").assertIsDisplayed()
        listOf("Home", "Tools", "Search", "Saved", "Account").forEach { label ->
            composeRule.onNodeWithText(label).assertDoesNotExist()
        }
    }
}
