package com.chastech.env

import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.compose.ui.test.onNodeWithText
import org.junit.Rule
import org.junit.Test

class MainActivityLaunchTest {
    @get:Rule val composeRule = createAndroidComposeRule<MainActivity>()

    @Test
    fun launchShowsNativeCatalogHome() {
        composeRule.onNodeWithText("A focused toolkit for everyday work.").assertIsDisplayed()
        composeRule.onNodeWithText("Search for a tool").assertIsDisplayed()
        composeRule.onNodeWithText("Trending tools").assertIsDisplayed()
    }
}
