package com.chastech.env

import androidx.compose.ui.test.assertCountEquals
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.compose.ui.test.onAllNodesWithText
import androidx.compose.ui.test.onNodeWithText
import org.junit.Rule
import org.junit.Test

class MainActivityLaunchTest {
    @get:Rule val composeRule = createAndroidComposeRule<MainActivity>()

    private fun awaitHomeScreenReady() {
        // CatalogGate reads the shared catalog on Dispatchers.IO; wait for its real
        // destination rather than racing the launch screen.
        composeRule.waitUntil(timeoutMillis = 15_000) {
            composeRule.onAllNodesWithText("Search for a tool")
                .fetchSemanticsNodes().isNotEmpty()
        }
    }

    @Test
    fun launchShowsNativeCatalogHome() {
        awaitHomeScreenReady()
        composeRule.onAllNodesWithText("A focused toolkit for\neveryday work.").assertCountEquals(0)
        composeRule.onNodeWithText("Search for a tool").assertIsDisplayed()
        composeRule.onNodeWithText("AI Agent").assertIsDisplayed()
        composeRule.onNodeWithText("Total token = 100").assertIsDisplayed()
        composeRule.onNodeWithText("Trending tools").assertIsDisplayed()
        listOf("Home", "Tools", "Search", "Saved", "Account").forEach { label ->
            composeRule.onAllNodesWithText(label).assertCountEquals(0)
        }
    }

}
