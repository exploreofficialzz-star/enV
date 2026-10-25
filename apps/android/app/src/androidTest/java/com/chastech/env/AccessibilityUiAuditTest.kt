package com.chastech.env

import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.assertIsEnabled
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.compose.ui.test.onAllNodesWithContentDescription
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

    @Test
    fun primaryActionsExposeNamesAndSearchNavigationWorks() {
        // The native catalog is parsed off the UI thread before EnVApp (and its navigation
        // controls) replaces the launch screen. Wait for that explicit ready-state signal.
        composeRule.waitUntil(timeoutMillis = 15_000) {
            composeRule.onAllNodesWithContentDescription("Home")
                .fetchSemanticsNodes().isNotEmpty()
        }
        composeRule.onNodeWithContentDescription("Home").assertIsDisplayed().assertIsEnabled()
        composeRule.onNodeWithContentDescription("Saved tools").assertIsDisplayed().assertIsEnabled()
        composeRule.onNodeWithContentDescription("Tools").assertIsDisplayed().assertIsEnabled()
        composeRule.onNodeWithContentDescription("More options").assertIsDisplayed().assertIsEnabled()

        // Search is opened from the actual home search action, not from the overflow menu.
        // Keep this navigation assertion tied to the screen's real, user-visible entry point.
        composeRule.onNodeWithContentDescription("Search all tools").assertIsDisplayed().performClick()
        composeRule.onNodeWithText("Find a tool by name, category, or keyword.").assertIsDisplayed()
        composeRule.onNodeWithText("Start typing to see matching tools.").assertIsDisplayed()
    }

    @Test
    @SdkSuppress(minSdkVersion = 34)
    fun homeScreenHasUsableSearchAndFrameworkAccessibilityChecks() {
        composeRule.onNodeWithText("Search for a tool").assertIsDisplayed()
        composeRule.onNodeWithText("Trending tools").assertIsDisplayed()
        composeRule.onNodeWithText("A focused toolkit for\neveryday work.").assertIsDisplayed()

        // Compose 1.8+ runs Android Accessibility Test Framework checks on the real semantics tree.
        // Failures are diagnostic evidence (labels, target size, contrast, traversal), not source heuristics.
        composeRule.enableAccessibilityChecks()
        composeRule.onRoot().tryPerformAccessibilityChecks()
    }
}
