import type { LabRun } from "./model.ts";

export type ScientificTimeTrace = Readonly<{
  metric: "positionM" | "capacitorVoltageV" | "maximumTemperatureK";
  label: string;
  unit: string;
  points: string;
  samplesPlotted: number;
  minimum: number;
  maximum: number;
  x0: number;
  x1: number;
  y0: number;
  y1: number;
}>;

/** A deliberately light read-only chart, derived only from recorded solver state.
 * Never interpolates or fabricates a scientific sample. Plot-line geometry is
 * presentation only; the actual source sample times remain authoritative.
 */
export function buildScientificTimeTrace(run: LabRun): ScientificTimeTrace {
  if (!run.samples.length || !(run.time.simulatedDurationSeconds > 0)) {
    throw new Error("A time trace requires a recorded, bounded scientific run.");
  }
  const metric: ScientificTimeTrace["metric"] = run.modelId === "damped-oscillator"
    ? "positionM" : run.modelId === "rc-circuit" ? "capacitorVoltageV"
      : run.modelId === "heat-rod" ? "maximumTemperatureK"
        : (() => { throw new Error("Unknown scientific quantity for this run."); })();
  const label = metric === "positionM" ? "Position" :
    metric === "capacitorVoltageV" ? "Capacitor voltage" : "Hottest cell";
  const unit = metric === "positionM" ? "m" :
    metric === "capacitorVoltageV" ? "V" : "K";
  const MAX_POINTS = 301;
  const stride = Math.max(1, Math.ceil((run.samples.length - 1) / (MAX_POINTS - 1)));
  const sampled = run.samples.filter((_, index) =>
    index % stride === 0 || index === run.samples.length - 1);
  const values = sampled.map(sample => sample[metric]);
  if (values.some(value => typeof value !== "number" || !Number.isFinite(value))) {
    throw new Error("Scientific run contains an invalid or missing observation.");
  }
  const numbers = values as number[];
  const minimum = Math.min(...numbers);
  const maximum = Math.max(...numbers);
  const x0 = 34, x1 = 670, y0 = 10, y1 = 164;
  const range = Math.max(maximum - minimum, Math.abs(minimum) * 1e-12, 1e-9);
  const minPad = minimum - (maximum === minimum ? range : 0.06 * range);
  const maxPad = maximum + (maximum === minimum ? range : 0.06 * range);
  const xWidth = x1 - x0;
  const yHeight = y1 - y0;
  const points = sampled.map((sample, i) => {
    const value = numbers[i];
    const x = x0 + xWidth * Math.min(1, Math.max(0,
      sample.simulatedSeconds / run.time.simulatedDurationSeconds));
    const y = y1 - yHeight * (value - minPad) / (maxPad - minPad);
    return x.toFixed(2) + "," + y.toFixed(2);
  }).join(" ");
  return Object.freeze({
    metric, label, unit, points, samplesPlotted: sampled.length,
    minimum, maximum, x0, x1, y0, y1,
  });
}
