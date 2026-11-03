package com.chastech.env

import androidx.compose.material3.MaterialTheme
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test

class NativeLaunchScreenTest {
    @get:Rule
    val composeRule = createComposeRule()

    @Test
    fun launchScreenShowsDevelopmentNoticeAndExitAction() {
        var exitRequested = false
        composeRule.setContent {
            MaterialTheme {
                NativeLaunchScreen(darkMode = false, onExit = { exitRequested = true })
            }
        }

        composeRule.onNodeWithText("enV is still under development").assertIsDisplayed()
        composeRule.onNodeWithText("Exit app").assertIsDisplayed().performClick()
        composeRule.runOnIdle { assertTrue(exitRequested) }
    }
}
