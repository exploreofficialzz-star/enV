package com.chastech.env

import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.assertIsEnabled
import androidx.compose.ui.test.junit4.createAndroidComposeRule
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
        composeRule.onNodeWithContentDescription("Home").assertIsDisplayed().assertIsEnabled()
        composeRule.onNodeWithContentDescription("Saved tools").assertIsDisplayed().assertIsEnabled()
        composeRule.onNodeWithContentDescription("Tools").assertIsDisplayed().assertIsEnabled()
        composeRule.onNodeWithContentDescription("More options").assertIsDisplayed().assertIsEnabled()

        composeRule.onNodeWithContentDescription("More options").performClick()
        composeRule.onNodeWithText("Search tools").assertIsDisplayed().performClick()
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
