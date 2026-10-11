export type ProductivityMode = "stopwatch" | "focus" | "pomodoro";
export type TimerPhase = "focus" | "break";

export interface ProductivityTimerState {
  mode: ProductivityMode;
  running: boolean;
  hasStarted: boolean;
  /** Accumulated stopwatch time or time remaining in the current focus/break phase. */
  valueMs: number;
  /** Monotonic timestamp at which the current running interval was anchored. */
  anchorMs: number | null;
  phase: TimerPhase;
  round: number;
  focusMinutes: number;
  breakMinutes: number;
  lapsMs: number[];
}

export interface ProductivityTimerOptions {
  focusMinutes?: number;
  breakMinutes?: number;
}

const MINUTES_MIN = 1;
const MINUTES_MAX = 240;
const SECOND_MS = 1_000;

function clampMinutes(value: number | undefined, fallback: number): number {
  if (!Number.isFinite(value)) return fallback;
  return Math.min(MINUTES_MAX, Math.max(MINUTES_MIN, Math.floor(value!)));
}

function phaseDurationMs(state: ProductivityTimerState, phase = state.phase): number {
  const minutes = state.mode === "pomodoro"
    ? (phase === "focus" ? 25 : 5)
    : (phase === "focus" ? state.focusMinutes : state.breakMinutes);
  return minutes * 60 * SECOND_MS;
}

export function createProductivityTimer(
  mode: ProductivityMode,
  options: ProductivityTimerOptions = {},
): ProductivityTimerState {
  const focusMinutes = clampMinutes(options.focusMinutes, 50);
  const breakMinutes = clampMinutes(options.breakMinutes, 10);
  return {
    mode,
    running: false,
    hasStarted: false,
    valueMs: mode === "stopwatch" ? 0 : phaseDurationMs({ mode, focusMinutes, breakMinutes, phase: "focus" } as ProductivityTimerState),
    anchorMs: null,
    phase: "focus",
    round: 1,
    focusMinutes,
    breakMinutes,
    lapsMs: [],
  };
}

/** Advance a state from its monotonic anchor. This also catches up across app suspension. */
export function advanceProductivityTimer(
  state: ProductivityTimerState,
  nowMs: number,
): ProductivityTimerState {
  if (!state.running || state.anchorMs === null || !Number.isFinite(nowMs)) return state;
  const delta = Math.max(0, nowMs - state.anchorMs);
  if (state.mode === "stopwatch") {
    return { ...state, valueMs: state.valueMs + delta, anchorMs: nowMs };
  }

  let valueMs = state.valueMs - delta;
  let phase = state.phase;
  let round = state.round;
  // Each phase is at least one minute. The loop naturally handles a delayed tick,
  // app suspension, or return to foreground without losing elapsed time.
  while (valueMs <= 0) {
    phase = phase === "focus" ? "break" : "focus";
    if (phase === "focus" && state.mode === "pomodoro") round += 1;
    valueMs += phaseDurationMs(state, phase);
  }
  return { ...state, phase, round, valueMs, anchorMs: nowMs };
}

export function startProductivityTimer(
  state: ProductivityTimerState,
  nowMs: number,
): ProductivityTimerState {
  if (state.running) return advanceProductivityTimer(state, nowMs);
  return { ...state, running: true, hasStarted: true, anchorMs: nowMs };
}

export function pauseProductivityTimer(
  state: ProductivityTimerState,
  nowMs: number,
): ProductivityTimerState {
  const advanced = advanceProductivityTimer(state, nowMs);
  if (!advanced.running) return advanced;
  return { ...advanced, running: false, anchorMs: null };
}

export function toggleProductivityTimer(
  state: ProductivityTimerState,
  nowMs: number,
): ProductivityTimerState {
  return state.running
    ? pauseProductivityTimer(state, nowMs)
    : startProductivityTimer(state, nowMs);
}

export function skipProductivityPhase(
  state: ProductivityTimerState,
  nowMs: number,
): ProductivityTimerState {
  if (state.mode === "stopwatch") return state;
  const current = advanceProductivityTimer(state, nowMs);
  const phase = current.phase === "focus" ? "break" : "focus";
  return {
    ...current,
    phase,
    hasStarted: true,
    round: phase === "focus" && current.mode === "pomodoro" ? current.round + 1 : current.round,
    valueMs: phaseDurationMs(current, phase),
    anchorMs: current.running ? nowMs : null,
  };
}

export function resetProductivityTimer(
  state: ProductivityTimerState,
): ProductivityTimerState {
  return {
    ...state,
    running: false,
    hasStarted: false,
    valueMs: state.mode === "stopwatch" ? 0 : phaseDurationMs(state, "focus"),
    anchorMs: null,
    phase: "focus",
    round: 1,
    lapsMs: [],
  };
}

export function setFocusDurations(
  state: ProductivityTimerState,
  focusMinutes: number,
  breakMinutes: number,
): ProductivityTimerState {
  if (state.mode !== "focus") return state;
  const nextFocus = clampMinutes(focusMinutes, state.focusMinutes);
  const nextBreak = clampMinutes(breakMinutes, state.breakMinutes);
  const elapsedInPhase = Math.max(0, phaseDurationMs(state) - state.valueMs);
  const updated = { ...state, focusMinutes: nextFocus, breakMinutes: nextBreak };
  if (state.running) return updated;
  return {
    ...updated,
    valueMs: Math.max(0, phaseDurationMs(updated) - elapsedInPhase),
  };
}

export function recordProductivityLap(
  state: ProductivityTimerState,
  nowMs: number,
): ProductivityTimerState {
  if (state.mode !== "stopwatch" || !state.running) return state;
  const advanced = advanceProductivityTimer(state, nowMs);
  return { ...advanced, lapsMs: [...advanced.lapsMs, advanced.valueMs] };
}

export function displayedMilliseconds(state: ProductivityTimerState, nowMs: number): number {
  if (!state.running || state.anchorMs === null) return state.valueMs;
  if (state.mode === "stopwatch") return state.valueMs + Math.max(0, nowMs - state.anchorMs);
  return Math.max(0, state.valueMs - Math.max(0, nowMs - state.anchorMs));
}

export function formatStopwatch(milliseconds: number): string {
  const centiseconds = Math.floor(Math.max(0, milliseconds) / 10);
  const hundredths = centiseconds % 100;
  const seconds = Math.floor(centiseconds / 100) % 60;
  const minutes = Math.floor(centiseconds / 6_000);
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}.${String(hundredths).padStart(2, "0")}`;
}

export function formatCountdown(milliseconds: number): string {
  const totalSeconds = Math.max(0, Math.ceil(milliseconds / SECOND_MS));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}
