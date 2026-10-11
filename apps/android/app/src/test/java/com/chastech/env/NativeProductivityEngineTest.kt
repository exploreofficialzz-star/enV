package com.chastech.env

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class NativeProductivityEngineTest {
    @Test fun onlyTheThreeImplementedProductivityToolsAreSupported() {
        assertEquals(setOf("focus-timer", "pomodoro-timer", "stopwatch"), NativeProductivityEngine.supportedToolIds)
        NativeProductivityEngine.supportedToolIds.forEach { assertTrue(NativeProductivityEngine.supports(it)) }
        assertFalse(NativeProductivityEngine.supports("focus-music"))
        assertNull(NativeProductivityEngine.modeFor("focus-music"))
    }

    @Test fun stopwatchUsesMonotonicTimeAcrossPauseResumeAndLaps() {
        var state = NativeProductivityEngine.create(NativeProductivityEngine.Mode.STOPWATCH)
        state = NativeProductivityEngine.start(state, 10_000L)
        assertEquals(1_234L, NativeProductivityEngine.displayedMs(state, 11_234L))
        state = NativeProductivityEngine.pause(state, 12_000L)
        assertEquals(2_000L, state.valueMs)
        assertFalse(state.running)
        assertNull(state.anchorMs)
        state = NativeProductivityEngine.start(state, 50_000L)
        state = NativeProductivityEngine.lap(state, 51_250L)
        assertEquals(listOf(3_250L), state.lapsMs)
        state = NativeProductivityEngine.pause(state, 52_000L)
        assertEquals(4_000L, state.valueMs)
        state = NativeProductivityEngine.reset(state)
        assertEquals(0L, state.valueMs)
        assertTrue(state.lapsMs.isEmpty())
        assertFalse(state.hasStarted)
    }

    @Test fun pomodoroCatchesUpAcrossFocusBreakBoundariesAndCountsCompletedRounds() {
        var state = NativeProductivityEngine.start(NativeProductivityEngine.create(NativeProductivityEngine.Mode.POMODORO), 0L)
        state = NativeProductivityEngine.advance(state, 25 * 60_000L)
        assertEquals(NativeProductivityEngine.Phase.BREAK, state.phase)
        assertEquals(1, state.round)
        assertEquals(5 * 60_000L, state.valueMs)
        state = NativeProductivityEngine.advance(state, 30 * 60_000L + 25_000L)
        assertEquals(NativeProductivityEngine.Phase.FOCUS, state.phase)
        assertEquals(2, state.round)
        assertEquals(25 * 60_000L - 25_000L, state.valueMs)
    }

    @Test fun pomodoroSkipCountsRoundOnlyWhenReturningFromBreakToFocus() {
        var state = NativeProductivityEngine.create(NativeProductivityEngine.Mode.POMODORO)
        state = NativeProductivityEngine.skip(state, 0L)
        assertEquals(NativeProductivityEngine.Phase.BREAK, state.phase)
        assertEquals(1, state.round)
        state = NativeProductivityEngine.skip(state, 0L)
        assertEquals(NativeProductivityEngine.Phase.FOCUS, state.phase)
        assertEquals(2, state.round)
        assertEquals(25 * 60_000L, state.valueMs)
    }

    @Test fun focusDefaultsAndEditableDurationsSurviveResetAndResume() {
        var state = NativeProductivityEngine.create(NativeProductivityEngine.Mode.FOCUS)
        assertEquals(50 * 60_000L, state.valueMs)
        state = NativeProductivityEngine.setFocusDurations(state, 30, 7)
        assertEquals(30 * 60_000L, state.valueMs)
        state = NativeProductivityEngine.start(state, 100L)
        state = NativeProductivityEngine.pause(state, 5 * 60_000L + 100L)
        assertEquals(25 * 60_000L, state.valueMs)
        state = NativeProductivityEngine.start(state, 900_000L)
        assertEquals(25 * 60_000L, state.valueMs)
        state = NativeProductivityEngine.reset(state)
        assertEquals(30 * 60_000L, state.valueMs)
        assertEquals(7, state.breakMinutes)
        state = NativeProductivityEngine.setFocusDurations(state, 0, 999)
        assertEquals(1, state.focusMinutes)
        assertEquals(240, state.breakMinutes)
    }

    @Test fun formattingUsesCentisecondsAndCeilingCountdowns() {
        assertEquals("00:01.23", NativeProductivityEngine.formatStopwatch(1_239L))
        assertEquals("60:00.00", NativeProductivityEngine.formatStopwatch(3_600_000L))
        assertEquals("00:01", NativeProductivityEngine.formatCountdown(1L))
        assertEquals("01:00", NativeProductivityEngine.formatCountdown(60_000L))
        assertEquals("00:00", NativeProductivityEngine.formatCountdown(-1L))
    }
}
