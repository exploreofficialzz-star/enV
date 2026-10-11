import assert from "node:assert/strict";
import test from "node:test";
import {
  advanceProductivityTimer,
  createProductivityTimer,
  displayedMilliseconds,
  formatCountdown,
  formatStopwatch,
  pauseProductivityTimer,
  recordProductivityLap,
  resetProductivityTimer,
  setFocusDurations,
  skipProductivityPhase,
  startProductivityTimer,
  toggleProductivityTimer,
} from "./timer-engine.ts";

test("stopwatch pauses, resumes from monotonic elapsed time, records cumulative laps, and resets", () => {
  let timer = createProductivityTimer("stopwatch");
  timer = startProductivityTimer(timer, 10_000);
  assert.equal(displayedMilliseconds(timer, 11_234), 1_234);
  timer = pauseProductivityTimer(timer, 12_000);
  assert.equal(timer.valueMs, 2_000);
  assert.equal(timer.running, false);
  timer = startProductivityTimer(timer, 50_000);
  timer = recordProductivityLap(timer, 51_250);
  assert.deepEqual(timer.lapsMs, [3_250]);
  timer = pauseProductivityTimer(timer, 52_000);
  assert.equal(timer.valueMs, 4_000);
  assert.deepEqual(resetProductivityTimer(timer).lapsMs, []);
  assert.equal(resetProductivityTimer(timer).valueMs, 0);
});

test("Pomodoro catches up after suspension and increments the round only when returning to focus", () => {
  let timer = startProductivityTimer(createProductivityTimer("pomodoro"), 0);
  timer = advanceProductivityTimer(timer, 25 * 60_000);
  assert.equal(timer.phase, "break");
  assert.equal(timer.round, 1);
  assert.equal(timer.valueMs, 5 * 60_000);
  timer = advanceProductivityTimer(timer, 30 * 60_000 + 25_000);
  assert.equal(timer.phase, "focus");
  assert.equal(timer.round, 2);
  assert.equal(timer.valueMs, 25 * 60_000 - 25_000);
});

test("Pomodoro Skip moves between phases and increments the round on break-to-focus", () => {
  let timer = createProductivityTimer("pomodoro");
  timer = skipProductivityPhase(timer, 0);
  assert.equal(timer.phase, "break");
  assert.equal(timer.round, 1);
  timer = skipProductivityPhase(timer, 0);
  assert.equal(timer.phase, "focus");
  assert.equal(timer.round, 2);
  assert.equal(timer.valueMs, 25 * 60_000);
});

test("Focus Timer retains configurable defaults, clamps durations, and resumes instead of restarting", () => {
  let timer = createProductivityTimer("focus");
  assert.equal(timer.valueMs, 50 * 60_000);
  timer = setFocusDurations(timer, 30, 7);
  assert.equal(timer.valueMs, 30 * 60_000);
  assert.equal(timer.focusMinutes, 30);
  assert.equal(timer.breakMinutes, 7);
  timer = startProductivityTimer(timer, 100);
  timer = advanceProductivityTimer(timer, 5 * 60_000 + 100);
  timer = pauseProductivityTimer(timer, 5 * 60_000 + 100);
  assert.equal(timer.valueMs, 25 * 60_000);
  timer = startProductivityTimer(timer, 900_000);
  assert.equal(timer.valueMs, 25 * 60_000);
  timer = resetProductivityTimer(timer);
  assert.equal(timer.valueMs, 30 * 60_000);
  assert.equal(timer.breakMinutes, 7);
  assert.equal(setFocusDurations(timer, 0, 999).focusMinutes, 1);
  assert.equal(setFocusDurations(timer, 0, 999).breakMinutes, 240);
});

test("time formatting stays stable at boundaries and uses ceiling for countdown display", () => {
  assert.equal(formatStopwatch(1_239), "00:01.23");
  assert.equal(formatStopwatch(3_600_000), "60:00.00");
  assert.equal(formatCountdown(1), "00:01");
  assert.equal(formatCountdown(60_000), "01:00");
  assert.equal(formatCountdown(-1), "00:00");
});

test("timer operations do not start a stopped stopwatch by recording a lap", () => {
  const timer = recordProductivityLap(createProductivityTimer("stopwatch"), 10_000);
  assert.equal(timer.running, false);
  assert.deepEqual(timer.lapsMs, []);
  assert.equal(toggleProductivityTimer(timer, 1_000).running, true);
});
