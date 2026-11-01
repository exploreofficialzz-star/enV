export type PalettePixelBuffer = ArrayLike<number>;

type Pixel = { r: number; g: number; b: number };
type Channel = "r" | "g" | "b";

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Number.isFinite(value) ? value : min));
}

function colorHex(color: Pixel): string {
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
  const pixels: Pixel[] = [];

  for (let index = 0; index + 3 < rgba.length; index += 4) {
    const alpha = Number(rgba[index + 3]);
    if (!Number.isFinite(alpha) || alpha < threshold) continue;
    const red = Number(rgba[index]);
    const green = Number(rgba[index + 1]);
    const blue = Number(rgba[index + 2]);
    if (![red, green, blue].every(Number.isFinite)) continue;
    pixels.push({
      r: Math.round(clamp(red, 0, 255)),
      g: Math.round(clamp(green, 0, 255)),
      b: Math.round(clamp(blue, 0, 255)),
    });
  }

  if (pixels.length === 0) return [];
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
      const score = ranges[0][1] * Math.sqrt(box.length);
      if (score > selectedScore) {
        selectedScore = score;
        selectedIndex = index;
        selectedChannel = ranges[0][0];
      }
    });

    if (selectedIndex < 0 || selectedScore <= 0) break;
    const selected = boxes[selectedIndex];
    selected.sort((a, b) => a[selectedChannel] - b[selectedChannel]);
    const midpoint = Math.max(1, Math.min(selected.length - 1, Math.floor(selected.length / 2)));
    boxes.splice(selectedIndex, 1, selected.slice(0, midpoint), selected.slice(midpoint));
  }

  const colors = boxes
    .map((box) => {
      const total = box.reduce((sum, pixel) => ({
        r: sum.r + pixel.r,
        g: sum.g + pixel.g,
        b: sum.b + pixel.b,
      }), { r: 0, g: 0, b: 0 });
      return {
        count: box.length,
        color: colorHex({
          r: total.r / box.length,
          g: total.g / box.length,
          b: total.b / box.length,
        }),
      };
    })
    .sort((a, b) => b.count - a.count);

  return [...new Set(colors.map(({ color }) => color))].slice(0, target);
}
