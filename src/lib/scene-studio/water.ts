/**
 * Water surface height as a closed-form function of position and time, so a wave looks identical on every device
 * and on every frame regardless of order. Three crossing sine waves; `flow` drifts the whole pattern sideways (+X).
 */
export interface WaveParams {
  /** Wave height in metres (the crest-to-trough scale is about twice this). */
  waveHeight: number;
  waveSpeed: number;
  flow: number;
}

export function waveHeightAt(x: number, z: number, time: number, p: WaveParams): number {
  const xs = x - p.flow * time;
  const t = time * p.waveSpeed;
  const a = Math.sin(xs * 0.9 + z * 0.35 + t * 1.3);
  const b = Math.sin(xs * 0.4 - z * 0.8 + t * 0.9 + 1.7);
  const c = Math.sin(xs * 1.7 + z * 1.3 + t * 2.1 + 4.1);
  return p.waveHeight * (0.5 * a + 0.3 * b + 0.2 * c);
}
