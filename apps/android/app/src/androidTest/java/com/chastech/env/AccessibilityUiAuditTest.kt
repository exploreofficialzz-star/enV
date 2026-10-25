package com.chastech.env

import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.assertIsEnabled
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.compose.ui.test.onAllNodesWithText
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.onRoot
import androidx.compose.ui.test.tryPerformAccessibilityChecks
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.junit4.accessibility.enableAccessibilityChecks
import androidx.test.filters.SdkSuppress
import org.junit.Rule
import org.junit.Test

/** Instrumentation checks against the actual native activity, not the source-snippet engine. */
class AccessibilityUiAuditTest {
    @get:Rule
    val composeRule = createAndroidComposeRule<MainActivity>()

    private fun awaitHomeScreenReady() {
        // The activity first shows a launch state while CatalogGate reads its bundled
        // catalog on Dispatchers.IO. Wait for the actual home tree before testing it.
        composeRule.waitUntil(timeoutMillis = 15_000) {
            composeRule.onAllNodesWithText("A focused toolkit for\neveryday work.")
                .fetchSemanticsNodes().isNotEmpty()
        }
    }

    private fun awaitTextVisible(text: String) {
        composeRule.waitUntil(timeoutMillis = 5_000) {
            composeRule.onAllNodesWithText(text).fetchSemanticsNodes().isNotEmpty()
        }
    }

    @Test
    fun primaryActionsExposeNamesAndSearchNavigationWorks() {
        awaitHomeScreenReady()
        composeRule.onNodeWithContentDescription("Home").assertIsDisplayed().assertIsEnabled()
        composeRule.onNodeWithContentDescription("Saved tools").assertIsDisplayed().assertIsEnabled()
        composeRule.onNodeWithContentDescription("Tools").assertIsDisplayed().assertIsEnabled()
        composeRule.onNodeWithContentDescription("More options").assertIsDisplayed().assertIsEnabled()

        composeRule.onNodeWithContentDescription("More options").performClick()
        awaitTextVisible("Search tools")
        composeRule.onNodeWithText("Search tools").assertIsDisplayed().performClick()
        awaitTextVisible("Find a tool by name, category, or keyword.")
        composeRule.onNodeWithText("Find a tool by name, category, or keyword.").assertIsDisplayed()
        awaitTextVisible("Start typing to see matching tools.")
        composeRule.onNodeWithText("Start typing to see matching tools.").assertIsDisplayed()
    }

    @Test
    @SdkSuppress(minSdkVersion = 34)
    fun homeScreenHasUsableSearchAndFrameworkAccessibilityChecks() {
        awaitHomeScreenReady()
        composeRule.onNodeWithText("Search for a tool").assertIsDisplayed()
        composeRule.onNodeWithText("Trending tools").assertIsDisplayed()
        composeRule.onNodeWithText("A focused toolkit for\neveryday work.").assertIsDisplayed()

        // Compose 1.8+ runs Android Accessibility Test Framework checks on the real semantics tree.
        // Failures are diagnostic evidence (labels, target size, contrast, traversal), not source heuristics.
        composeRule.enableAccessibilityChecks()
        composeRule.onRoot().tryPerformAccessibilityChecks()
    }
}
