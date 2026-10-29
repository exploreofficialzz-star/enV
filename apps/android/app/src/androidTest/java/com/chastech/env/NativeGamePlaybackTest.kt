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
        assertTrue("Native renderer reported shader compilation failure.\n$relevant",
            !logs.contains("Fragment shader active uniforms exceed GL_MAX_FRAGMENT_UNIFORM_VECTORS"))
        SystemClock.sleep(2_000)
        val screenshot = automation.takeScreenshot()
        assertNotNull("Native game did not produce a screen image", screenshot)
        val image = requireNotNull(screenshot)
        val colors = mutableSetOf<Int>()
        for (y in 1..7) for (x in 1..7) {
            colors += image.getPixel(image.width * x / 8, image.height * y / 8)
        }
        assertTrue("Native game screen did not contain visible scene content", colors.size >= 4)
        image.recycle()
    }
}
