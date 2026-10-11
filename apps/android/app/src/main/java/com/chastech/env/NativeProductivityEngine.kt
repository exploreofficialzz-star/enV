package com.chastech.env

/** Pure timer logic; callers supply a monotonic timestamp (Android uses elapsedRealtime()). */
object NativeProductivityEngine {
    enum class Mode { STOPWATCH, FOCUS, POMODORO }
    enum class Phase { FOCUS, BREAK }

    data class State(
        val mode: Mode,
        val running: Boolean,
        val hasStarted: Boolean,
        /** Stopwatch accumulated time, or countdown time remaining in the active phase. */
        val valueMs: Long,
        val anchorMs: Long?,
        val phase: Phase,
        val round: Int,
        val focusMinutes: Int,
        val breakMinutes: Int,
        val lapsMs: List<Long>,
    )

    val supportedToolIds: Set<String> = setOf("focus-timer", "pomodoro-timer", "stopwatch")

    fun supports(toolId: String): Boolean = toolId in supportedToolIds

    fun modeFor(toolId: String): Mode? = when (toolId) {
        "focus-timer" -> Mode.FOCUS
        "pomodoro-timer" -> Mode.POMODORO
        "stopwatch" -> Mode.STOPWATCH
        else -> null
    }

    fun create(mode: Mode, focusMinutes: Int = 50, breakMinutes: Int = 10): State {
        val focus = focusMinutes.coerceIn(1, 240)
        val pause = breakMinutes.coerceIn(1, 240)
        val initial = if (mode == Mode.STOPWATCH) 0L else durationMs(mode, Phase.FOCUS, focus, pause)
        return State(mode, false, false, initial, null, Phase.FOCUS, 1, focus, pause, emptyList())
    }

    fun createForTool(toolId: String): State? = modeFor(toolId)?.let(::create)

    private fun durationMs(mode: Mode, phase: Phase, focusMinutes: Int, breakMinutes: Int): Long {
        val minutes = when (mode) {
            Mode.POMODORO -> if (phase == Phase.FOCUS) 25 else 5
            Mode.FOCUS -> if (phase == Phase.FOCUS) focusMinutes else breakMinutes
            Mode.STOPWATCH -> 0
        }
        return minutes * 60_000L
    }

    private fun phaseDurationMs(state: State, phase: Phase = state.phase): Long =
        durationMs(state.mode, phase, state.focusMinutes, state.breakMinutes)

    /** Advances through every elapsed phase so background/suspended time is not lost. */
    fun advance(state: State, nowMs: Long): State {
        val anchor = state.anchorMs ?: return state
        if (!state.running) return state
        val delta = (nowMs - anchor).coerceAtLeast(0L)
        if (state.mode == Mode.STOPWATCH) return state.copy(valueMs = state.valueMs + delta, anchorMs = nowMs)

        var value = state.valueMs - delta
        var phase = state.phase
        var round = state.round
        while (value <= 0L) {
            phase = if (phase == Phase.FOCUS) Phase.BREAK else Phase.FOCUS
            if (phase == Phase.FOCUS && state.mode == Mode.POMODORO) round += 1
            value += phaseDurationMs(state, phase)
        }
        return state.copy(valueMs = value, phase = phase, round = round, anchorMs = nowMs)
    }

    fun start(state: State, nowMs: Long): State {
        if (state.running) return advance(state, nowMs)
        return state.copy(running = true, hasStarted = true, anchorMs = nowMs)
    }

    fun pause(state: State, nowMs: Long): State {
        val advanced = advance(state, nowMs)
        if (!advanced.running) return advanced
        return advanced.copy(running = false, anchorMs = null)
    }

    fun toggle(state: State, nowMs: Long): State =
        if (state.running) pause(state, nowMs) else start(state, nowMs)

    fun skip(state: State, nowMs: Long): State {
        if (state.mode == Mode.STOPWATCH) return state
        val current = advance(state, nowMs)
        val phase = if (current.phase == Phase.FOCUS) Phase.BREAK else Phase.FOCUS
        val round = if (phase == Phase.FOCUS && current.mode == Mode.POMODORO) current.round + 1 else current.round
        return current.copy(
            hasStarted = true,
            phase = phase,
            round = round,
            valueMs = phaseDurationMs(current, phase),
            anchorMs = if (current.running) nowMs else null,
        )
    }

    fun reset(state: State): State = state.copy(
        running = false,
        hasStarted = false,
        valueMs = if (state.mode == Mode.STOPWATCH) 0L else phaseDurationMs(state, Phase.FOCUS),
        anchorMs = null,
        phase = Phase.FOCUS,
        round = 1,
        lapsMs = emptyList(),
    )

    fun setFocusDurations(state: State, focusMinutes: Int, breakMinutes: Int): State {
        if (state.mode != Mode.FOCUS) return state
        val focus = focusMinutes.coerceIn(1, 240)
        val pause = breakMinutes.coerceIn(1, 240)
        val elapsedInPhase = (phaseDurationMs(state) - state.valueMs).coerceAtLeast(0L)
        val updated = state.copy(focusMinutes = focus, breakMinutes = pause)
        if (state.running) return updated
        return updated.copy(valueMs = (phaseDurationMs(updated) - elapsedInPhase).coerceAtLeast(0L))
    }

    fun lap(state: State, nowMs: Long): State {
        if (state.mode != Mode.STOPWATCH || !state.running) return state
        val advanced = advance(state, nowMs)
        return advanced.copy(lapsMs = advanced.lapsMs + advanced.valueMs)
    }

    fun displayedMs(state: State, nowMs: Long): Long {
        if (!state.running) return state.valueMs
        val anchor = state.anchorMs ?: return state.valueMs
        val delta = (nowMs - anchor).coerceAtLeast(0L)
        return if (state.mode == Mode.STOPWATCH) state.valueMs + delta else (state.valueMs - delta).coerceAtLeast(0L)
    }

    fun formatStopwatch(milliseconds: Long): String {
        val centiseconds = milliseconds.coerceAtLeast(0L) / 10L
        val hundredths = centiseconds % 100L
        val seconds = centiseconds / 100L % 60L
        val minutes = centiseconds / 6_000L
        return String.format(java.util.Locale.ROOT, "%02d:%02d.%02d", minutes, seconds, hundredths)
    }

    fun formatCountdown(milliseconds: Long): String {
        val totalSeconds = ((milliseconds.coerceAtLeast(0L) + 999L) / 1_000L)
        val minutes = totalSeconds / 60L
        val seconds = totalSeconds % 60L
        return String.format(java.util.Locale.ROOT, "%02d:%02d", minutes, seconds)
    }
}
