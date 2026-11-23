import test from "node:test";
import assert from "node:assert/strict";
import { captionMeasure, composeFrame, cssFont, drawCaption, drawLayers, needsTransparent3D } from "./compose2d.ts";
import type { Ctx2D } from "./compose2d.ts";
import { captionGroups, estimateSpokenLines, captionAt } from "./captions.ts";
import { createFrameSampler } from "./frame-state.ts";
import { parseScene } from "./index.ts";
import type { Scene } from "./types.ts";

/** A canvas stand-in that writes down everything done to it, including property changes. */
function recorder(widthOf: (text: string, font: string) => number = (t) => t.length * 10) {
  const log: string[] = [];
  const state: Record<string, unknown> = { font: "10px sans-serif" };
  const ctx: Record<string, unknown> = {};
  for (const prop of ["fillStyle", "strokeStyle", "lineWidth", "globalAlpha", "font", "textAlign", "textBaseline", "lineJoin", "miterLimit"]) {
    Object.defineProperty(ctx, prop, {
      get: () => state[prop],
      set: (v) => {
        state[prop] = v;
        log.push(`${prop}=${typeof v === "number" ? Math.round(v * 1e6) / 1e6 : v}`);
      },
    });
  }
  const stack: Record<string, unknown>[] = [];
  const call = (name: string) => (...args: unknown[]) => {
    log.push(`${name}(${args.map((a) => (typeof a === "number" ? Math.round(a * 1e6) / 1e6 : typeof a === "object" ? "[picture]" : a)).join(",")})`);
  };
  for (const m of ["translate", "rotate", "scale", "fillRect", "strokeRect", "beginPath", "ellipse", "fill", "stroke", "fillText", "strokeText", "drawImage"]) ctx[m] = call(m);
  ctx.save = () => {
    stack.push({ ...state });
    log.push("save");
  };
  ctx.restore = () => {
    Object.assign(state, stack.pop());
    log.push("restore");
  };
  ctx.measureText = (text: string) => ({ width: widthOf(text, String(state.font)) });
  return { ctx: ctx as unknown as Ctx2D, log };
}

const sceneOf = (json: object): Scene => {
  const r = parseScene(JSON.stringify(json));
  assert.ok(r.ok && r.scene, JSON.stringify(r.issues));
  return r.scene!;
};
const layersAt = (scene: Scene, frame: number) => createFrameSampler(scene)(frame).layers;
const frame = { width: 1080, height: 1920 };
const noImages = { images: new Map() };

test("cssFont: family groups with a weight, and unknown names fall back to sans", () => {
  assert.match(cssFont("sans", 64), /^700 64px system-ui/);
  assert.match(cssFont("display", 80), /^900 80px Impact/);
  assert.match(cssFont("mono", 20), /^400 20px ui-monospace/);
  assert.match(cssFont("serif", 30), /^700 30px Georgia/);
  assert.equal(cssFont("wingdings", 12), cssFont("sans", 12));
});

test("a rect layer: translate to the position, rotate clockwise, scale, draw around the anchor", () => {
  const scene = sceneOf({ layers: [{ id: "r", type: "rect", position: [100, 200], size: [50, 40], anchor: [0.5, 0.5], rotation: 90, scale: [2, 1], opacity: 0.5, color: "#ff0000" }] });
  const { ctx, log } = recorder();
  drawLayers(ctx, layersAt(scene, 0), "front", frame, noImages);
  assert.deepEqual(log, ["save", "globalAlpha=0.5", "translate(100,200)", `rotate(${Math.round((Math.PI / 2) * 1e6) / 1e6})`, "scale(2,1)", "fillStyle=#ff0000", "fillRect(-25,-20,50,40)", "restore"]);
});

test("anchor [0,0] puts the box's top-left corner on the position", () => {
  const scene = sceneOf({ layers: [{ id: "r", type: "rect", position: [10, 20], size: [30, 40], anchor: [0, 0], color: "#00ff00" }] });
  const { ctx, log } = recorder();
  drawLayers(ctx, layersAt(scene, 0), "front", frame, noImages);
  assert.ok(log.includes("fillRect(0,0,30,40)"), log.join("\n"));
});

test("a solid layer fills the whole picture and ignores position, scale and rotation", () => {
  const scene = sceneOf({ layers: [{ id: "bg", type: "solid", color: "#102030", position: [500, 500], rotation: 45, scale: 3 }] });
  const { ctx, log } = recorder();
  drawLayers(ctx, layersAt(scene, 0), "front", frame, noImages);
  assert.deepEqual(log, ["save", "globalAlpha=1", "fillStyle=#102030", "fillRect(0,0,1080,1920)", "restore"]);
});

test("an ellipse is inscribed in its box; strokes use the stroke colour and width", () => {
  const scene = sceneOf({ layers: [{ id: "e", type: "ellipse", position: [100, 100], size: [60, 40], color: "#ffffff", strokeColor: "#000000", strokeWidth: 4 }] });
  const { ctx, log } = recorder();
  drawLayers(ctx, layersAt(scene, 0), "front", frame, noImages);
  assert.ok(log.includes("ellipse(0,0,30,20,0,0,6.283185)"), log.join("\n"));
  assert.ok(log.indexOf("fill()") < log.indexOf("stroke()"));
  assert.ok(log.includes("lineWidth=4") && log.includes("strokeStyle=#000000"));
});

test("layers are drawn in scene order, and only the requested plane", () => {
  const scene = sceneOf({
    layers: [
      { id: "one", type: "rect", color: "#111111", plane: "back" },
      { id: "two", type: "rect", color: "#222222" },
      { id: "three", type: "rect", color: "#333333", plane: "back" },
      { id: "four", type: "rect", color: "#444444" },
    ],
  });
  const layers = layersAt(scene, 0);
  const back = recorder();
  drawLayers(back.ctx, layers, "back", frame, noImages);
  assert.deepEqual(back.log.filter((l) => l.startsWith("fillStyle")), ["fillStyle=#111111", "fillStyle=#333333"]);
  const front = recorder();
  drawLayers(front.ctx, layers, "front", frame, noImages);
  assert.deepEqual(front.log.filter((l) => l.startsWith("fillStyle")), ["fillStyle=#222222", "fillStyle=#444444"]);
  assert.equal(needsTransparent3D(scene), true);
  assert.equal(needsTransparent3D(sceneOf({ layers: [{ id: "x", type: "rect" }] })), false);
  assert.equal(needsTransparent3D(sceneOf({})), false);
});

test("invisible layers (opacity 0) draw nothing", () => {
  const scene = sceneOf({ layers: [{ id: "ghost", type: "rect", opacity: 0 }] });
  const { ctx, log } = recorder();
  drawLayers(ctx, layersAt(scene, 0), "front", frame, noImages);
  assert.deepEqual(log, []);
});

test("a text layer: outline first, then the fill; centred on the anchor; explicit line breaks make lines", () => {
  const scene = sceneOf({
    layers: [{ id: "t", type: "text", text: "Hello\nWorld", position: [540, 960], fontSize: 100, font: "display", color: "#ffffff", strokeColor: "#000000", strokeWidth: 6 }],
  });
  const { ctx, log } = recorder((t) => t.length * 50);
  drawLayers(ctx, layersAt(scene, 0), "front", frame, noImages);
  assert.ok(log.some((l) => l.startsWith("font=900 100px Impact")));
  assert.ok(log.includes("textAlign=center") && log.includes("textBaseline=middle"));
  // two lines, 120 px apart, the block's centre (anchor 0.5) on the position: lines at y = -60 + 60 and 60 + 60... i.e. -60 and +60
  assert.ok(log.includes("strokeText(Hello,0,-60)"), log.join("\n"));
  assert.ok(log.includes("fillText(Hello,0,-60)"));
  assert.ok(log.includes("strokeText(World,0,60)"));
  assert.ok(log.indexOf("strokeText(Hello,0,-60)") < log.indexOf("fillText(Hello,0,-60)"));
  assert.ok(log.includes("lineWidth=12")); // visible outline 6 px → stroke width 12 (half is hidden under the fill)
  assert.ok(log.includes("translate(540,960)"));
});

test("a text layer with a width wraps its words to that width", () => {
  const scene = sceneOf({ layers: [{ id: "t", type: "text", text: "one two three four", position: [0, 0], size: [210, 0], fontSize: 50, color: "#ffffff" }] });
  const { ctx, log } = recorder((t) => t.length * 10);
  drawLayers(ctx, layersAt(scene, 0), "front", frame, noImages);
  // widths 30, 30, 50, 40 and a space of 10: all four words need 180, which fits in 210
  assert.equal(log.filter((l) => l.startsWith("fillText")).length, 1);
  const narrow = recorder((t) => t.length * 10);
  const scene2 = sceneOf({ layers: [{ id: "t", type: "text", text: "one two three four", position: [0, 0], size: [90, 0], fontSize: 50, color: "#ffffff" }] });
  drawLayers(narrow.ctx, layersAt(scene2, 0), "front", frame, noImages);
  const rows = narrow.log.filter((l) => l.startsWith("fillText"));
  assert.equal(rows.length, 3, rows.join("\n")); // "one two" (70), then "three" (50) and "four" (40) cannot share a row of 90 because together they need 100
});

test("an image layer fits inside its box without stretching; a missing picture shows a grey box", () => {
  const scene = sceneOf({ layers: [{ id: "i", type: "image", asset: "logo.png", position: [100, 100], size: [200, 100], anchor: [0, 0] }] });
  const picture = { width: 100, height: 100 };
  const a = recorder();
  drawLayers(a.ctx, layersAt(scene, 0), "front", frame, { images: new Map([["logo.png", picture]]) });
  assert.ok(a.log.includes("drawImage([picture],50,0,100,100)"), a.log.join("\n")); // 100×100 centred in 200×100
  const b = recorder();
  drawLayers(b.ctx, layersAt(scene, 0), "front", frame, noImages);
  assert.ok(b.log.includes("fillStyle=#5b6472") && b.log.includes("fillRect(0,0,200,100)"));
  assert.ok(!b.log.some((l) => l.startsWith("drawImage")));
  assert.ok(b.log.includes("globalAlpha=0.5"));
});

test("captions: outline then fill for every word, the popping word scaled about its own centre", () => {
  const groups = captionGroups(estimateSpokenLines([{ speaker: "ana", text: "Catch the ball", start: 0 }]), 3);
  const draw = captionAt(groups, groups[0].words[1].start + 0.07, { enabled: true, style: "pop", placement: "bottomCenter", highlightColor: "#ffd400", wordsPerGroup: 3, anchorY: 0.78, fontScale: 1, speakerColors: {} }, frame)!;
  const { ctx, log } = recorder();
  drawCaption(ctx, draw);
  const fills = log.filter((l) => l.startsWith("fillText"));
  assert.deepEqual(fills.map((l) => l.slice(9, -5)), ["Catch", "the", "ball"]);
  const strokeIndex = log.findIndex((l) => l.startsWith("strokeText(Catch"));
  const fillIndex = log.findIndex((l) => l.startsWith("fillText(Catch"));
  assert.ok(strokeIndex > 0 && strokeIndex < fillIndex);
  assert.ok(log.some((l) => l === "scale(1.12,1.12)"), log.join("\n")); // "the" is mid-pop
  assert.ok(log.includes("fillStyle=#ffd400"));
  assert.ok(log.includes(`font=800 ${draw.fontSize}px system-ui, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif`));
  assert.ok(log.includes(`lineWidth=${draw.strokeWidth * 2}`));
  // saves and restores balance
  assert.equal(log.filter((l) => l === "save").length, log.filter((l) => l === "restore").length);
});

test("captionMeasure uses the caption font and leaves the context's own state alone", () => {
  const { ctx, log } = recorder((t, font) => t.length * (font.startsWith("800 40px") ? 7 : 1));
  const w = captionMeasure(ctx)("abcd", 40);
  assert.equal(w, 28);
  assert.equal((ctx as unknown as { font: string }).font, "10px sans-serif"); // restored
  assert.ok(log[0] === "save" && log[log.length - 1] === "restore");
});

function floodScene() {
  return sceneOf({
    settings: { width: 720, height: 1280, fps: 10, duration: 6, background: "#05070d" },
    layers: [
      { id: "back", type: "rect", color: "#111111", plane: "back" },
      { id: "front", type: "rect", color: "#eeeeee" },
    ],
    dialogue: [{ speaker: "ana", text: "Hello brave world", start: 1 }],
    captions: { enabled: true, style: "pop" },
  });
}

test("composeFrame draws background, back layers, the 3D picture, front layers, then captions — in that order", () => {
  const scene = floodScene();
  const sampler = createFrameSampler(scene);
  const groups = captionGroups(estimateSpokenLines(scene.dialogue, scene.voices), scene.captions.wordsPerGroup);
  const { ctx, log } = recorder();
  composeFrame({ ctx, scene, layers: sampler(15).layers, picture3d: { width: 720, height: 1280 }, transparent3d: true, time: 1.5, captionGroups: groups, assets: noImages });
  const at = (needle: string) => log.findIndex((l) => l.includes(needle));
  const bg = at("fillStyle=#05070d");
  const back = at("fillStyle=#111111");
  const picture = at("drawImage");
  const front = at("fillStyle=#eeeeee");
  const caption = at("fillText(");
  assert.ok(bg >= 0 && bg < back && back < picture && picture < front && front < caption, JSON.stringify({ bg, back, picture, front, caption }));
  assert.ok(log.includes("drawImage([picture],0,0,720,1280)"));
});

test("composeFrame: an opaque 3D picture is drawn first, with no background or back layers on top of it", () => {
  const scene = sceneOf({ settings: { width: 720, height: 1280 }, layers: [{ id: "front", type: "rect", color: "#eeeeee" }] });
  const { ctx, log } = recorder();
  composeFrame({ ctx, scene, layers: createFrameSampler(scene)(0).layers, picture3d: { width: 720, height: 1280 }, transparent3d: false, time: 0, captionGroups: [], assets: noImages });
  assert.ok(log[0].startsWith("drawImage"));
  assert.ok(!log.some((l) => l.includes("fillStyle=#000000")) || log.indexOf("fillStyle=#eeeeee") > 0);
});

test("composeFrame with no 3D picture paints the background itself, and draws no caption outside speech", () => {
  const scene = floodScene();
  const { ctx, log } = recorder();
  composeFrame({ ctx, scene, layers: createFrameSampler(scene)(0).layers, picture3d: null, transparent3d: false, time: 0, captionGroups: [], assets: noImages });
  assert.ok(log.includes("fillStyle=#05070d"));
  assert.ok(!log.some((l) => l.startsWith("drawImage")));
  assert.ok(!log.some((l) => l.startsWith("fillText")));
});

test("composeFrame is repeatable: the same frame draws the same calls", () => {
  const scene = floodScene();
  const sampler = createFrameSampler(scene);
  const groups = captionGroups(estimateSpokenLines(scene.dialogue, scene.voices), scene.captions.wordsPerGroup);
  const run = () => {
    const { ctx, log } = recorder();
    composeFrame({ ctx, scene, layers: sampler(17).layers, picture3d: { width: 720, height: 1280 }, transparent3d: true, time: 1.7, captionGroups: groups, assets: noImages });
    return log;
  };
  assert.deepEqual(run(), run());
});
