export type PalettePixelBuffer = ArrayLike<number>;

type Pixel = { r: number; g: number; b: number; count: number };
type Rgb = Pick<Pixel, "r" | "g" | "b">;
type Channel = "r" | "g" | "b";

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Number.isFinite(value) ? value : min));
}

function colorHex(color: Rgb): string {
  return "#" + [color.r, color.g, color.b]
    .map((channel) => Math.round(clamp(channel, 0, 255)).toString(16).padStart(2, "0"))
    .join("");
}

function channelRange(pixels: Pixel[], channel: Channel): number {
  let minimum = 255;
  let maximum = 0;
  for (const pixel of pixels) {
    minimum = Math.min(minimum, pixel[channel]);
    maximum = Math.max(maximum, pixel[channel]);
  }
  return maximum - minimum;
}

/** Extract a deterministic dominant-color palette using median-cut quantization. */
export function extractDominantColors(
  rgba: PalettePixelBuffer,
  count = 5,
  alphaThreshold = 160,
): string[] {
  const target = Math.round(clamp(count, 1, 8));
  const threshold = clamp(alphaThreshold, 0, 255);
  const histogram = new Map<string, Pixel>();

  for (let index = 0; index + 3 < rgba.length; index += 4) {
    const alpha = Number(rgba[index + 3]);
    if (!Number.isFinite(alpha) || alpha < threshold) continue;
    const rawRed = Number(rgba[index]);
    const rawGreen = Number(rgba[index + 1]);
    const rawBlue = Number(rgba[index + 2]);
    if (![rawRed, rawGreen, rawBlue].every(Number.isFinite)) continue;
    const red = Math.round(clamp(rawRed, 0, 255));
    const green = Math.round(clamp(rawGreen, 0, 255));
    const blue = Math.round(clamp(rawBlue, 0, 255));
    const hex = colorHex({ r: red, g: green, b: blue });
    const previous = histogram.get(hex);
    if (previous) previous.count += 1;
    else histogram.set(hex, { r: red, g: green, b: blue, count: 1 });
  }

  if (histogram.size === 0) return [];
  const pixels = [...histogram.values()];
  const boxes: Pixel[][] = [pixels];

  while (boxes.length < target) {
    let selectedIndex = -1;
    let selectedChannel: Channel = "r";
    let selectedScore = 0;

    boxes.forEach((box, index) => {
      if (box.length < 2) return;
      const ranges: Array<[Channel, number]> = [
        ["r", channelRange(box, "r")],
        ["g", channelRange(box, "g")],
        ["b", channelRange(box, "b")],
      ];
      ranges.sort((a, b) => b[1] - a[1]);
      const population = box.reduce((sum, pixel) => sum + pixel.count, 0);
      const score = ranges[0][1] * Math.sqrt(population);
      if (score > selectedScore) {
        selectedScore = score;
        selectedIndex = index;
        selectedChannel = ranges[0][0];
      }
    });

    if (selectedIndex < 0 || selectedScore <= 0) break;
    const selected = boxes[selectedIndex];
    selected.sort((a, b) => a[selectedChannel] - b[selectedChannel]);
    const totalWeight = selected.reduce((sum, pixel) => sum + pixel.count, 0);
    let accumulated = 0;
    let midpoint = 1;
    let bestDistance = Number.POSITIVE_INFINITY;
    for (let index = 1; index < selected.length; index += 1) {
      accumulated += selected[index - 1].count;
      const distance = Math.abs(accumulated - totalWeight / 2);
      if (distance < bestDistance) {
        bestDistance = distance;
        midpoint = index;
      }
    }
    boxes.splice(selectedIndex, 1, selected.slice(0, midpoint), selected.slice(midpoint));
  }

  const colors = boxes
    .map((box) => {
      const total = box.reduce((sum, pixel) => ({
        r: sum.r + pixel.r * pixel.count,
        g: sum.g + pixel.g * pixel.count,
        b: sum.b + pixel.b * pixel.count,
        count: sum.count + pixel.count,
      }), { r: 0, g: 0, b: 0, count: 0 });
      return {
        count: total.count,
        color: colorHex({
          r: total.r / total.count,
          g: total.g / total.count,
          b: total.b / total.count,
        }),
      };
    })
    .sort((a, b) => b.count - a.count);

  return [...new Set(colors.map(({ color }) => color))].slice(0, target);
}
