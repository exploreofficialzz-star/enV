/** Deterministic helpers for the local recorder, joiner and metronome tools. */
export type MetronomeDenominator = 2 | 4 | 8;

export function metronomeBeatDurationSeconds(bpm: number, denominator: MetronomeDenominator = 4): number {
  if (!Number.isFinite(bpm) || bpm < 30 || bpm > 300) throw new Error("BPM must be between 30 and 300.");
  if (![2, 4, 8].includes(denominator)) throw new Error("Time-signature denominator must be 2, 4 or 8.");
  return (60 / bpm) * (4 / denominator);
}

export function metronomeTotalBeats(beatsPerBar: number, bars: number): number {
  if (!Number.isInteger(beatsPerBar) || beatsPerBar < 1 || beatsPerBar > 12) throw new Error("Beats per bar must be an integer from 1 to 12.");
  if (!Number.isInteger(bars) || bars < 1 || bars > 128) throw new Error("Bar count must be an integer from 1 to 128.");
  return beatsPerBar * bars;
}

/** Estimates quarter-note-equivalent BPM from monotonic performance.now() timestamps; needs at least 3 taps. */
export function estimateTappedBpm(timestamps: readonly number[], denominator: MetronomeDenominator = 4, minBpm = 30, maxBpm = 300): number | null {
  if (![2, 4, 8].includes(denominator) || timestamps.length < 3 || timestamps.some((value) => !Number.isFinite(value))) return null;
  const taps = timestamps.slice(-8);
  const intervals = taps.slice(1).map((value, index) => value - taps[index]);
  if (intervals.some((interval) => interval < 200 || interval > 2000)) return null;
  intervals.sort((a, b) => a - b);
  const middle = Math.floor(intervals.length / 2);
  const medianMs = intervals.length % 2 ? intervals[middle] : (intervals[middle - 1] + intervals[middle]) / 2;
  const bpm = (60_000 / medianMs) * (4 / denominator);
  if (!Number.isFinite(bpm) || bpm < minBpm || bpm > maxBpm) return null;
  return Math.round(bpm);
}
