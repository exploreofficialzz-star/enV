export type SvgColorOptions = { color: string };
export type BlobSvgOptions = { seed: number; points: number; color: string };
export type WaveSvgOptions = {
  amplitude: number;
  layers: number;
  frequency: number;
  phase: number;
  baseline: number;
  fill: string;
  secondary: string;
  background: string;
  transparent: boolean;
};

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(Number.isFinite(value) ? value : min, min), max);
}

function safeHex(value: string, fallback: string): string {
  const candidate = value.trim();
  if (/^#[0-9a-f]{6}$/i.test(candidate)) return candidate;
  if (/^#[0-9a-f]{3}$/i.test(candidate)) {
    return "#" + candidate.slice(1).split("").map((channel) => channel + channel).join("");
  }
  return fallback;
}

export function buildPatternSvg(size: number, opacity: number, color: string): string {
  const safeSize = Math.round(clamp(size, 6, 160));
  const safeOpacity = clamp(opacity, 0, 1);
  const safeColor = safeHex(color, "#0d9f8a");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${safeSize}" height="${safeSize}" viewBox="0 0 ${safeSize} ${safeSize}"><path d="M0 0L${safeSize} ${safeSize}M${safeSize} 0L0 ${safeSize}" stroke="${safeColor}" stroke-opacity="${safeOpacity}" stroke-width="1"/></svg>`;
}

export function buildBlobSvg({ seed, points, color }: BlobSvgOptions): string {
  const safeSeed = Math.round(clamp(seed, 1, 999));
  const count = Math.round(clamp(points, 8, 18));
  const safeColor = safeHex(color, "#0d9f8a");
  const coordinates = Array.from({ length: count }, (_, index) => {
    const angle = (index / count) * Math.PI * 2;
    const radius = 34 + ((safeSeed * (index + 3) * 13) % 20);
    return { x: 50 + Math.cos(angle) * radius, y: 50 + Math.sin(angle) * radius };
  });
  const middle = (a: { x: number; y: number }, b: { x: number; y: number }) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
  const start = middle(coordinates[coordinates.length - 1], coordinates[0]);
  const curve = coordinates.map((point, index) => {
    const next = coordinates[(index + 1) % coordinates.length];
    const end = middle(point, next);
    return `Q ${point.x.toFixed(2)} ${point.y.toFixed(2)} ${end.x.toFixed(2)} ${end.y.toFixed(2)}`;
  }).join(" ");
  const path = `M ${start.x.toFixed(2)} ${start.y.toFixed(2)} ${curve} Z`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="480" height="480" viewBox="0 0 100 100"><path fill="${safeColor}" d="${path}"/></svg>`;
}

export function buildWaveSvg(options: WaveSvgOptions): string {
  const amplitude = clamp(options.amplitude, 0, 58);
  const layerCount = Math.round(clamp(options.layers, 1, 3));
  const frequency = Math.round(clamp(options.frequency, 1, 5));
  const phase = clamp(options.phase, 0, 360) * Math.PI / 180;
  const baseline = clamp(options.baseline, 30, 140);
  const fill = safeHex(options.fill, "#0d9f8a");
  const secondary = safeHex(options.secondary, "#7c4dff");
  const background = safeHex(options.background, "#ffffff");
  const paths = Array.from({ length: layerCount }, (_, index) => {
    const offset = (layerCount - index - 1) * amplitude * 0.32;
    const height = Math.max(0, amplitude * (1 - index * 0.16));
    const segmentCount = frequency * 4;
    const layerPhase = phase + index * 0.42;
    const points = Array.from({ length: segmentCount + 1 }, (_, pointIndex) => {
      const progress = pointIndex / segmentCount;
      const angle = progress * frequency * Math.PI * 2 + layerPhase;
      return {
        x: progress * 1440,
        y: baseline + offset - Math.sin(angle) * height,
        derivative: -Math.cos(angle) * height * frequency * Math.PI * 2 / segmentCount,
      };
    });
    let path = `M 0 ${points[0].y.toFixed(2)}`;
    for (let pointIndex = 0; pointIndex < segmentCount; pointIndex += 1) {
      const start = points[pointIndex];
      const end = points[pointIndex + 1];
      const dx = end.x - start.x;
      const controlOneY = start.y + start.derivative / 3;
      const controlTwoY = end.y - end.derivative / 3;
      path += ` C ${(start.x + dx / 3).toFixed(2)} ${controlOneY.toFixed(2)} ${(end.x - dx / 3).toFixed(2)} ${controlTwoY.toFixed(2)} ${end.x.toFixed(2)} ${end.y.toFixed(2)}`;
    }
    path += " L1440 160 L0 160 Z";
    const color = index % 2 === 0 ? fill : secondary;
    return `<path fill="${color}" opacity="${1 - index * 0.12}" d="${path}"/>`;
  }).join("");
  const canvas = options.transparent ? "" : `<rect width="1440" height="160" fill="${background}"/>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1440" height="240" viewBox="0 0 1440 160" preserveAspectRatio="none">${canvas}${paths}</svg>`;
}

export function buildNoiseDataUrl(color: string, density: number, strength = 1): string {
  const safeColor = safeHex(color, "#111827").slice(1);
  const red = parseInt(safeColor.slice(0, 2), 16) / 255;
  const green = parseInt(safeColor.slice(2, 4), 16) / 255;
  const blue = parseInt(safeColor.slice(4, 6), 16) / 255;
  const matrix = `${red} 0 0 0 0 0 ${green} 0 0 0 0 0 ${blue} 0 0 0 0 0 1 0`;
  const safeDensity = clamp(density, 0.1, 3);
  const safeStrength = clamp(strength, 0, 1);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="160" height="160"><filter id="n"><feTurbulence type="fractalNoise" baseFrequency="${safeDensity}" numOctaves="2" stitchTiles="stitch" result="noise"/><feColorMatrix in="noise" type="matrix" values="${matrix}"/></filter><rect width="100%" height="100%" filter="url(#n)" opacity="${safeStrength}"/></svg>`;
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
}
