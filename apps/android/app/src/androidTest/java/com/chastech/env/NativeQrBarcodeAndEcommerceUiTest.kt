package com.chastech.env

import android.Manifest
import android.content.pm.PackageManager
import androidx.compose.foundation.layout.Column
import androidx.compose.material3.MaterialTheme
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.test.platform.app.InstrumentationRegistry
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.core.content.ContextCompat
import org.junit.Assert.assertEquals
import org.junit.Rule
import org.junit.Test

class NativeQrBarcodeAndEcommerceUiTest {
    @get:Rule val composeRule = createComposeRule()

    @Test
    fun qrBarcodeReaderRendersWithoutRequestingCameraUntilStartIsTapped() {
        composeRule.setContent {
            MaterialTheme {
                Column { NativeBarcodeReaderTool() }
            }
        }

        composeRule.onNodeWithText("QR & barcode reader").assertIsDisplayed()
        composeRule.onNodeWithText("Start camera").assertIsDisplayed()
        composeRule.onNodeWithText("Read image").assertIsDisplayed()
        composeRule.onNodeWithText("Scan results · 0").assertIsDisplayed()

        val permission = ContextCompat.checkSelfPermission(
            InstrumentationRegistry.getInstrumentation().targetContext,
            Manifest.permission.CAMERA,
        )
        assertEquals(PackageManager.PERMISSION_DENIED, permission)
    }

    @Test
    fun ecommerceNativeFormRunsAndShowsProductContribution() {
        composeRule.setContent {
            MaterialTheme {
                Column { NativeEcommerceToolForm("profit-calculator") }
            }
        }

        composeRule.onNodeWithText("Unit cost").assertIsDisplayed()
        composeRule.onNodeWithText("Selling price").assertIsDisplayed()
        composeRule.onNodeWithText("Run").assertIsDisplayed().performClick()
        composeRule.onNodeWithText("Estimated contribution profit: 35.00", substring = true).assertIsDisplayed()
        composeRule.onNodeWithText("Copy").assertIsDisplayed()
        composeRule.onNodeWithText("Save").assertIsDisplayed()
    }
}
