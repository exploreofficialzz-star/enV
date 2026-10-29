package com.chastech.env

import android.os.ParcelFileDescriptor
import android.os.SystemClock
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.test.platform.app.InstrumentationRegistry
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test

/** Exercises the native game activity, not just the Android launcher. */
class NativeGamePlaybackTest {
    @get:Rule val compose = createAndroidComposeRule<NativeGamePreviewActivity>()

    private fun logcat(): String {
        val automation = InstrumentationRegistry.getInstrumentation().uiAutomation
        val descriptor = automation.executeShellCommand("logcat -d -t 8000")
        return ParcelFileDescriptor.AutoCloseInputStream(descriptor).bufferedReader().use { it.readText() }
    }

    @Test
    fun starterSceneLoadsInTheNativeRuntime() {
        val automation = InstrumentationRegistry.getInstrumentation().uiAutomation
        automation.executeShellCommand("logcat -c").close()
        compose.onNodeWithText("Play preset").performClick()
        val deadline = SystemClock.elapsedRealtime() + 120_000
        var logs = ""
        while (SystemClock.elapsedRealtime() < deadline) {
            SystemClock.sleep(2_000)
            logs = logcat()
            if (logs.contains("ENV_GAME_READY")) break
        }
        val relevant = logs.lineSequence().filter {
            it.contains("godot", ignoreCase = true) || it.contains("shader", ignoreCase = true) ||
                it.contains("ENV_GAME") || it.contains("FATAL EXCEPTION")
        }.toList().takeLast(30).joinToString("\n")
        assertTrue("Native game did not finish loading.\n$relevant", logs.contains("ENV_GAME_READY"))
        val frameDeadline = SystemClock.elapsedRealtime() + 30_000
        var colors = emptySet<Int>()
        var screenshot: android.graphics.Bitmap? = null
        while (SystemClock.elapsedRealtime() < frameDeadline) {
            SystemClock.sleep(2_000)
            screenshot?.recycle()
            screenshot = automation.takeScreenshot()
            val image = screenshot ?: continue
            colors = buildSet {
                for (y in 1..7) for (x in 1..7) {
                    add(image.getPixel(image.width * x / 8, image.height * y / 8))
                }
            }
            if (colors.size >= 4) break
        }
        assertNotNull("Native game did not produce a screen image", screenshot)
        val image = requireNotNull(screenshot)
        // Gradle uninstalls the app before the outer CI script can pull app-owned files.
        // Capture via the shell into shared storage so failure evidence survives uninstall.
        val capture = automation.executeShellCommand("screencap -p /sdcard/Download/env-game-preview.png")
        ParcelFileDescriptor.AutoCloseInputStream(capture).use { it.readBytes() }
        println("Native frame: ${image.width}x${image.height}, sampled colors=${colors.size}")
        image.recycle()
        assertTrue("Native game screen did not contain visible scene content; sampled colors=${colors.size}", colors.size >= 4)
    }
}
