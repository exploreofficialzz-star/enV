/**
 * 2D drawing for Scene Studio: background, 2D layers, captions, and putting the 3D picture between them.
 * It draws on any object shaped like a canvas 2D context, so it runs in the browser (the preview and the video
 * export use the very same function) and in Node tests with a recording stand-in.
 *
 * Layer rules (2D convention: pixels, origin top-left, +y down, clockwise degrees):
 *  - `position` is where the layer's anchor point sits on the picture; scale and rotation turn around that point.
 *  - The box is `size` wide and high; `anchor` is a 0..1 point inside it (default the centre).
 *  - solid: fills the whole picture and ignores position, size, anchor, scale and rotation.
 *  - text: centred lines of `fontSize` px. With `size[0]` above 0 the text wraps to that width; otherwise only
 *    explicit line breaks apply. The box is the measured text. `strokeWidth` is the visible outline width.
 *  - image: drawn to fit inside the box without stretching (centred).
 *  - Fonts are family groups, not exact files, so letter shapes differ a little between devices:
 *    sans, serif, display (heavy, for headlines) and mono.
 */
import { captionAt } from "./captions.ts";
import type { CaptionDraw, CaptionGroup, CaptionOptions } from "./captions.ts";
import { wrapWords } from "./captions.ts";
import type { LayerState } from "./frame-state.ts";
import type { CaptionSettings, Scene } from "./types.ts";

type Ctx2DMembers =
  | "save" | "restore" | "translate" | "rotate" | "scale"
  | "fillStyle" | "strokeStyle" | "lineWidth" | "globalAlpha" | "font" | "textAlign" | "textBaseline" | "lineJoin" | "miterLimit"
  | "fillRect" | "strokeRect" | "beginPath" | "ellipse" | "fill" | "stroke" | "fillText" | "strokeText" | "drawImage" | "measureText";
/** The part of CanvasRenderingContext2D this file uses. */
export type Ctx2D = Pick<CanvasRenderingContext2D, Ctx2DMembers>;

/** Anything drawImage accepts that also knows its size (a loaded picture, a canvas). */
export interface Drawable {
  width: number;
  height: number;
}

const FONT_STACKS: Record<string, { family: string; weight: string }> = {
  sans: { family: 'system-ui, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif', weight: "700" },
  serif: { family: 'Georgia, Cambria, "Times New Roman", serif', weight: "700" },
  display: { family: 'Impact, "Arial Black", "Helvetica Neue", Arial, sans-serif', weight: "900" },
  mono: { family: 'ui-monospace, Menlo, Consolas, "Courier New", monospace', weight: "400" },
};

export const cssFont = (font: string, sizePx: number): string => {
  const f = FONT_STACKS[font] ?? FONT_STACKS.sans;
  return `${f.weight} ${sizePx}px ${f.family}`;
};

const CAPTION_FONT = (sizePx: number) => `800 ${sizePx}px ${FONT_STACKS.sans.family}`;
const LINE_HEIGHT = 1.2;
const DEG = Math.PI / 180;

/** True when something must be drawn behind the 3D picture, so the 3D picture has to be see-through. */
export const needsTransparent3D = (scene: Pick<Scene, "layers">): boolean => scene.layers.some((l) => l.plane === "back");

function wrapLines(ctx: Ctx2D, text: string, font: string, maxWidth: number): string[] {
  ctx.font = font;
  const out: string[] = [];
  for (const paragraph of text.split(/\r?\n/)) {
    const words = paragraph.split(/\s+/).filter((w) => w.length > 0);
    if (words.length === 0) {
      out.push("");
      continue;
    }
    if (!(maxWidth > 0)) {
      out.push(words.join(" "));
      continue;
    }
    const space = ctx.measureText(" ").width;
    const rows = wrapWords(words.map((w) => ctx.measureText(w).width), space, maxWidth);
    for (const row of rows) out.push(row.map((i) => words[i]).join(" "));
  }
  return out;
}

export interface LayerAssets {
  /** Loaded pictures by the layer's `asset` name. */
  images: ReadonlyMap<string, Drawable>;
}

function drawLayer(ctx: Ctx2D, layer: LayerState, frame: { width: number; height: number }, assets: LayerAssets): void {
  if (layer.opacity <= 0) return;
  ctx.save();
  ctx.globalAlpha = Math.min(1, Math.max(0, layer.opacity));
  const color = layer.color ?? "#ffffff";

  if (layer.type === "solid") {
    ctx.fillStyle = layer.color ?? "#000000";
    ctx.fillRect(0, 0, frame.width, frame.height);
    ctx.restore();
    return;
  }

  ctx.translate(layer.position[0], layer.position[1]);
  ctx.rotate(layer.rotation * DEG);
  ctx.scale(layer.scale[0], layer.scale[1]);

  if (layer.type === "text") {
    const text = layer.text ?? "";
    const font = cssFont(layer.font, layer.fontSize);
    const lines = wrapLines(ctx, text, font, layer.size[0]);
    ctx.font = font;
    const lineHeight = layer.fontSize * LINE_HEIGHT;
    const width = layer.size[0] > 0 ? layer.size[0] : Math.max(0, ...lines.map((l) => ctx.measureText(l).width));
    const height = layer.size[1] > 0 ? layer.size[1] : lines.length * lineHeight;
    const left = -layer.anchor[0] * width;
    const top = -layer.anchor[1] * height;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.lineJoin = "round";
    ctx.miterLimit = 2;
    lines.forEach((line, i) => {
      const x = left + width / 2;
      const y = top + lineHeight * (i + 0.5);
      if (layer.strokeWidth > 0 && layer.strokeColor) {
        ctx.strokeStyle = layer.strokeColor;
        ctx.lineWidth = layer.strokeWidth * 2;
        ctx.strokeText(line, x, y);
      }
      ctx.fillStyle = color;
      ctx.fillText(line, x, y);
    });
    ctx.restore();
    return;
  }

  const [w, h] = layer.size;
  const left = -layer.anchor[0] * w;
  const top = -layer.anchor[1] * h;
  if (layer.type === "rect") {
    ctx.fillStyle = color;
    ctx.fillRect(left, top, w, h);
    if (layer.strokeWidth > 0 && layer.strokeColor) {
      ctx.strokeStyle = layer.strokeColor;
      ctx.lineWidth = layer.strokeWidth;
      ctx.strokeRect(left, top, w, h);
    }
  } else if (layer.type === "ellipse") {
    ctx.beginPath();
    ctx.ellipse(left + w / 2, top + h / 2, Math.abs(w / 2), Math.abs(h / 2), 0, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();
    if (layer.strokeWidth > 0 && layer.strokeColor) {
      ctx.strokeStyle = layer.strokeColor;
      ctx.lineWidth = layer.strokeWidth;
      ctx.stroke();
    }
  } else if (layer.type === "image") {
    const image = layer.asset ? assets.images.get(layer.asset) : undefined;
    if (image && image.width > 0 && image.height > 0) {
      const fit = Math.min(w / image.width, h / image.height);
      const dw = image.width * fit;
      const dh = image.height * fit;
      ctx.drawImage(image as unknown as CanvasImageSource, left + (w - dw) / 2, top + (h - dh) / 2, dw, dh);
    } else {
      // the picture is missing: show where it goes
      ctx.fillStyle = "#5b6472";
      ctx.globalAlpha *= 0.5;
      ctx.fillRect(left, top, w, h);
    }
  }
  ctx.restore();
}

/** Draw layers of one plane, in scene order. */
export function drawLayers(ctx: Ctx2D, layers: readonly LayerState[], plane: "front" | "back", frame: { width: number; height: number }, assets: LayerAssets): void {
  for (const layer of layers) if (layer.plane === plane) drawLayer(ctx, layer, frame, assets);
}

/** Draw the words of a caption returned by `captionAt`. */
export function drawCaption(ctx: Ctx2D, draw: CaptionDraw): void {
  ctx.save();
  ctx.font = CAPTION_FONT(draw.fontSize);
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.lineJoin = "round";
  ctx.miterLimit = 2;
  for (const row of draw.rows) {
    for (const word of row.words) {
      ctx.save();
      ctx.translate(word.x + word.width / 2, row.y);
      ctx.scale(word.scale, word.scale);
      ctx.strokeStyle = draw.strokeColor;
      ctx.lineWidth = draw.strokeWidth * 2;
      ctx.strokeText(word.text, 0, 0);
      ctx.fillStyle = word.color;
      ctx.fillText(word.text, 0, 0);
      ctx.restore();
    }
  }
  ctx.restore();
}

/** Text width for caption layout, measured with the font the caption is drawn with. */
export function captionMeasure(ctx: Ctx2D): NonNullable<CaptionOptions["measure"]> {
  return (text, fontSize) => {
    ctx.save();
    ctx.font = CAPTION_FONT(fontSize);
    const width = ctx.measureText(text).width;
    ctx.restore();
    return width;
  };
}

export interface ComposeInput {
  ctx: Ctx2D;
  scene: Pick<Scene, "settings" | "captions">;
  /** From `createFrameSampler(scene)(frame).layers`. */
  layers: readonly LayerState[];
  /** The 3D picture for this frame, or null for a scene without 3D objects. */
  picture3d: Drawable | null;
  /** True when the 3D picture is see-through (the scene has back layers), so the background goes first. */
  transparent3d: boolean;
  time: number;
  captionGroups: readonly CaptionGroup[];
  assets: LayerAssets;
  speakerAnchors?: CaptionOptions["speakerAnchors"];
}

/** Draw one complete frame: background, back layers, 3D, front layers, captions. */
export function composeFrame(input: ComposeInput): void {
  const { ctx, scene, layers, picture3d } = input;
  const frame = { width: scene.settings.width, height: scene.settings.height };
  // without a 3D picture (a pure 2D scene) or with a see-through one, this file paints the background
  if (input.transparent3d || !picture3d) {
    ctx.save();
    ctx.globalAlpha = 1;
    ctx.fillStyle = scene.settings.background;
    ctx.fillRect(0, 0, frame.width, frame.height);
    ctx.restore();
    drawLayers(ctx, layers, "back", frame, input.assets);
  }
  if (picture3d) ctx.drawImage(picture3d as unknown as CanvasImageSource, 0, 0, frame.width, frame.height);
  drawLayers(ctx, layers, "front", frame, input.assets);
  const caption = captionAt(input.captionGroups, input.time, scene.captions as CaptionSettings, frame, { measure: captionMeasure(ctx), speakerAnchors: input.speakerAnchors });
  if (caption) drawCaption(ctx, caption);
}
