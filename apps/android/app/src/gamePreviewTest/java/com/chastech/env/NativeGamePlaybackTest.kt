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

    /** Close only the emulator's unrelated Messages ANR. Never suppress an enV failure. */
    private fun dismissMessagesAnr(): Boolean {
        val automation = InstrumentationRegistry.getInstrumentation().uiAutomation
        val root = automation.rootInActiveWindow ?: return false
        val unrelated = root.findAccessibilityNodeInfosByText("Messages isn't responding")
            .isNotEmpty()
        if (!unrelated) return false
        val label = root.findAccessibilityNodeInfosByText("Close app").firstOrNull()
            ?: error("The unrelated emulator Messages ANR has no close control")
        var target: android.view.accessibility.AccessibilityNodeInfo? = label
        while (target != null && !target.isClickable) target = target.parent
        require(target != null && target.performAction(
            android.view.accessibility.AccessibilityNodeInfo.ACTION_CLICK
        )) { "Failed to dismiss unrelated emulator Messages ANR" }
        SystemClock.sleep(600)
        return true
    }

    @Test
    fun starterSceneLoadsInTheNativeRuntime() {
        val automation = InstrumentationRegistry.getInstrumentation().uiAutomation
        automation.executeShellCommand("logcat -c").close()
        // The emulator is fresh on each CI run; suppress Android's one-time immersive-mode tutorial.
        val confirmation = automation.executeShellCommand("settings put secure immersive_mode_confirmations confirmed")
        ParcelFileDescriptor.AutoCloseInputStream(confirmation).use { it.readBytes() }
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
        // Some Android images still show the tutorial; dismiss it as a user would.
        repeat(5) {
            val button = automation.rootInActiveWindow?.findAccessibilityNodeInfosByText("Got it")?.firstOrNull()
            if (button != null) button.performAction(android.view.accessibility.AccessibilityNodeInfo.ACTION_CLICK)
            SystemClock.sleep(300)
        }
        val frameDeadline = SystemClock.elapsedRealtime() + 30_000
        var colors = emptySet<Int>()
        var screenshot: android.graphics.Bitmap? = null
        while (SystemClock.elapsedRealtime() < frameDeadline) {
            SystemClock.sleep(2_000)
            if (dismissMessagesAnr()) {
                // Do not count system alert pixels as a successfully rendered game.
                screenshot?.recycle()
                screenshot = null
                colors = emptySet()
                continue
            }
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
        assertTrue("Native game screen did not contain visible scene content; sampled colors=${colors.size}", colors.size >= 4)
        // A preloaded emulator app can present its own ANR after capture. Reject
        // it before sending movement events so the game, not a dialog, gets input.
        assertTrue("Unrelated system ANR continued to obscure the game.",
            !dismissMessagesAnr())
        // Hold the on-screen right arrow and compare only the scene, excluding UI controls.
        val x = (image.width * 0.25).toInt()
        var start = -1
        var bestStart = -1
        var bestLength = 0
        for (py in image.height / 2..image.height) {
            val color = if (py < image.height) image.getPixel(x, py) else 0
            val red = android.graphics.Color.red(color)
            val green = android.graphics.Color.green(color)
            val blue = android.graphics.Color.blue(color)
            val dark = py < image.height && red < 150 && green < 150 && blue < 150 &&
                maxOf(red, green, blue) - minOf(red, green, blue) < 45
            if (dark && start < 0) start = py
            if (!dark && start >= 0) {
                if (py - start > bestLength) {
                    bestStart = start
                    bestLength = py - start
                }
                start = -1
            }
        }
        assertTrue("Could not locate the on-screen movement control", bestLength > image.height / 30)
        val y = bestStart + bestLength / 2
        val swipe = automation.executeShellCommand("input swipe $x $y $x $y 1500")
        ParcelFileDescriptor.AutoCloseInputStream(swipe).use { it.readBytes() }
        SystemClock.sleep(500)
        val after = requireNotNull(automation.takeScreenshot())
        var changed = 0
        val step = maxOf(4, image.height / 80)
        for (py in image.height / 5 until image.height * 4 / 5 step step) {
            for (px in image.width / 5 until image.width * 4 / 5 step step) {
                if (image.getPixel(px, py) != after.getPixel(px, py)) changed++
            }
        }
        val afterCapture = automation.executeShellCommand("screencap -p /sdcard/Download/env-game-after.png")
        ParcelFileDescriptor.AutoCloseInputStream(afterCapture).use { it.readBytes() }
        image.recycle()
        after.recycle()
        assertTrue("Touch movement did not change the rendered scene; changed samples=$changed", changed > 25)
    }
}
