/** Local color-key removal. This does not infer a subject or segment a photograph. */
export interface StudioImageOptions {
  /** Omit to detect up to three dominant colors on the opaque image border. */
  keyColor?: string;
  /** Color distance that becomes fully transparent, from 0 to 255. */
  tolerance?: number;
  /** Additional color distance over which foreground alpha fades, from 0 to 100. */
  softness?: number;
  /** Edge keeps enclosed matching details; global also removes matching interior holes. */
  mode?: "edge" | "global";
  /** Suppression of green/blue color spill on partially keyed edges, from 0 to 1. */
  spill?: number;
}

type Color = readonly [number, number, number];
export interface StudioImageMaskResult {
  pixels: Uint8ClampedArray;
  removedPixels: number;
  remainingPixels: number;
  /** Fraction of the original visible alpha removed, rather than a count of transparent input pixels. */
  removedFraction: number;
  sampledColors: string[];
  warning?: string;
}

const clamp = (value: number, min: number, max: number) => Number.isFinite(value) ? Math.max(min, Math.min(max, value)) : min;
const rgbDistance = (a: Color, b: Color) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
const hex = (color: Color) => "#" + color.map(channel => Math.round(channel).toString(16).padStart(2, "0")).join("");

function parseKey(value: string): Color {
  const normalized = value.trim().replace(/^#/, "");
  if (!/^(?:[a-f\d]{3}|[a-f\d]{6})$/i.test(normalized)) throw new Error("Choose a valid key color.");
  const full = normalized.length === 3 ? normalized.split("").map(character => character + character).join("") : normalized;
  return [parseInt(full.slice(0, 2), 16), parseInt(full.slice(2, 4), 16), parseInt(full.slice(4, 6), 16)];
}

function borderSamples(pixels: Uint8ClampedArray, width: number, height: number): Color[] {
  const samples: Color[] = [];
  const add = (x: number, y: number) => {
    const offset = (y * width + x) * 4;
    if (pixels[offset + 3] >= 200) samples.push([pixels[offset], pixels[offset + 1], pixels[offset + 2]]);
  };
  for (let x = 0; x < width; x++) { add(x, 0); if (height > 1) add(x, height - 1); }
  for (let y = 1; y < height - 1; y++) { add(0, y); if (width > 1) add(width - 1, y); }
  return samples;
}

/** Palette clusters use real border neighborhoods; independent channel medians can invent a color absent from the image. */
function borderPalette(samples: Color[], tolerance: number, corners: Color[]): Color[] {
  const buckets = new Map<number, { count: number; red: number; green: number; blue: number }>();
  for (const [red, green, blue] of samples) {
    const key = (red >> 5) * 64 + (green >> 5) * 8 + (blue >> 5);
    const bucket = buckets.get(key) || { count: 0, red: 0, green: 0, blue: 0 };
    bucket.count++; bucket.red += red; bucket.green += green; bucket.blue += blue;
    buckets.set(key, bucket);
  }
  const colors: Color[] = [];
  for (const bucket of [...buckets.values()].sort((a, b) => b.count - a.count)) {
    if (colors.length === 3 || bucket.count < Math.max(1, samples.length * 0.08)) break;
    const color: Color = [bucket.red / bucket.count, bucket.green / bucket.count, bucket.blue / bucket.count];
    // A foreground object often touches one border. A secondary automatic key must also occur
    // at a corner, or occupy a substantial part of the border, before it can erase that object.
    if (colors.length && bucket.count < samples.length * 0.3 && !corners.some(corner => rgbDistance(corner, color) <= Math.max(12, tolerance))) continue;
    if (!colors.some(other => rgbDistance(other, color) <= Math.max(12, tolerance))) colors.push(color);
  }
  return colors;
}

/** Saturated chroma keys follow the key's hue through light and shadow. Neutral keys retain RGB/luminance distance. */
function colorDistance(color: Color, key: Color, chroma: boolean): number {
  const maxKey = Math.max(...key), minKey = Math.min(...key);
  if (!chroma || maxKey === 0 || (maxKey - minKey) / maxKey < 0.25) return rgbDistance(color, key);
  const colorTotal = color[0] + color[1] + color[2];
  if (colorTotal < 12) return rgbDistance(color, key);
  const keyTotal = key[0] + key[1] + key[2];
  return Math.hypot(...color.map((channel, index) => 255 * (channel / colorTotal - key[index] / keyTotal)));
}

export function removeStudioImageBackground(
  source: Uint8ClampedArray, width: number, height: number,
  options: StudioImageOptions = {}, chroma = false,
): StudioImageMaskResult {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1 || source.length !== width * height * 4) {
    throw new Error("Image pixel dimensions are invalid.");
  }
  const pixels = source.slice(), count = width * height;
  const tolerance = clamp(options.tolerance ?? 40, 0, 255), softness = clamp(options.softness ?? 24, 0, 100);
  const mode = options.mode ?? (chroma ? "global" : "edge"), spill = clamp(options.spill ?? (chroma ? 0.6 : 0), 0, 1);
  const samples = borderSamples(source, width, height);
  const corners = [0, width - 1, (height - 1) * width, count - 1].flatMap(index => source[index * 4 + 3] >= 200 ? [[source[index * 4], source[index * 4 + 1], source[index * 4 + 2]] as Color] : []);
  const colors = options.keyColor ? [parseKey(options.keyColor)] : borderPalette(samples, tolerance, corners);
  let warning: string | undefined;
  if (!options.keyColor && samples.length) {
    const matched = samples.filter(color => colors.some(key => rgbDistance(color, key) <= tolerance + softness)).length;
    if (matched / samples.length < 0.6) warning = "The image border contains several colors. Pick the background color or use a plain backdrop for a cleaner cutout.";
  }
  const distances = new Float32Array(count).fill(Infinity);
  for (let index = 0; index < count; index++) {
    const offset = index * 4;
    if (source[offset + 3] < 8) { distances[index] = 0; continue; }
    const color: Color = [source[offset], source[offset + 1], source[offset + 2]];
    for (const key of colors) distances[index] = Math.min(distances[index], colorDistance(color, key, chroma));
  }
  const eligible = new Uint8Array(count);
  const range = tolerance + softness;
  if (colors.length && mode === "global") {
    for (let index = 0; index < count; index++) if (distances[index] <= range) eligible[index] = 1;
  } else if (colors.length) {
    const queue = new Int32Array(count); let head = 0, tail = 0;
    const push = (index: number) => {
      if (!eligible[index] && distances[index] <= range) { eligible[index] = 1; queue[tail++] = index; }
    };
    for (let x = 0; x < width; x++) { push(x); push((height - 1) * width + x); }
    for (let y = 0; y < height; y++) { push(y * width); push(y * width + width - 1); }
    // Flood through the entire soft color band so a multi-pixel antialiased edge fades consistently.
    while (head < tail) {
      const index = queue[head++], x = index % width, y = Math.floor(index / width);
      if (x > 0) push(index - 1); if (x + 1 < width) push(index + 1);
      if (y > 0) push(index - width); if (y + 1 < height) push(index + width);
    }
  }
  let originalAlpha = 0, removedAlpha = 0, removedPixels = 0, remainingPixels = 0;
  for (let index = 0; index < count; index++) {
    const offset = index * 4, alpha = source[offset + 3]; originalAlpha += alpha;
    if (eligible[index]) {
      const position = softness ? clamp((distances[index] - tolerance) / softness, 0, 1) : distances[index] <= tolerance ? 0 : 1;
      const keep = position * position * (3 - 2 * position);
      pixels[offset + 3] = Math.round(alpha * keep);
      if (chroma && spill && keep > 0 && keep < 1 && colors.length === 1) {
        const key = colors[0];
        const channel = key[1] >= key[0] && key[1] >= key[2] ? 1 : key[2] >= key[0] ? 2 : 0;
        const others = [0, 1, 2].filter(value => value !== channel);
        if (key[channel] - Math.max(key[others[0]], key[others[1]]) > 40) {
          const neutral = (pixels[offset + others[0]] + pixels[offset + others[1]]) / 2;
          pixels[offset + channel] -= Math.max(0, pixels[offset + channel] - neutral) * spill * (1 - keep);
        }
      }
    }
    const removed = alpha - pixels[offset + 3];
    if (removed > 0) { removedPixels++; removedAlpha += removed; }
    if (pixels[offset + 3] > 8) remainingPixels++;
  }
  return { pixels, removedPixels, remainingPixels, removedFraction: originalAlpha ? removedAlpha / originalAlpha : 0, sampledColors: colors.map(hex), ...(warning ? { warning } : {}) };
}
