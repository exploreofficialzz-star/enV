import test from "node:test";
import assert from "node:assert/strict";
import { cameraBasis, projectToScreen, speakerAnchors } from "./camera-math.ts";
import { skyColorAt, SKY_PRESETS } from "./render-look.ts";
import type { CameraState } from "./frame-state.ts";
import type { Vec3 } from "./types.ts";

const near = (a: number, b: number, eps = 1e-9) => assert.ok(Math.abs(a - b) <= eps, `${a} vs ${b}`);
const nearVec = (a: readonly number[], b: readonly number[], eps = 1e-9) => a.forEach((v, i) => near(v, b[i], eps));

const camera = (over: Partial<CameraState> = {}): CameraState => ({
  type: "perspective", position: [0, 0, 5], lookAt: [0, 0, 0], fov: 60, roll: 0, orthoHeight: 0, shotIndex: null, ...over,
});

test("a camera on +Z looking at the origin looks down -Z with +X to the right and +Y up", () => {
  const b = cameraBasis(camera());
  nearVec(b.forward, [0, 0, -1]);
  nearVec(b.right, [1, 0, 0]);
  nearVec(b.up, [0, 1, 0]);
});

test("looking along +X from the origin: right is +Z", () => {
  const b = cameraBasis(camera({ position: [0, 0, 0], lookAt: [1, 0, 0] }));
  nearVec(b.forward, [1, 0, 0]);
  nearVec(b.right, [0, 0, 1]);
  nearVec(b.up, [0, 1, 0]);
});

test("the axes stay at right angles and unit length, whatever the view and roll", () => {
  const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  for (const [position, lookAt, roll] of [[[3, 2, 1], [0, 1, 0], 0], [[-4, 5, 2], [1, 0, -3], 12], [[0, 10, 0], [0, 0, 0], 0], [[0, -10, 0], [0, 0, 0], 3], [[1, 1, 1], [1, 1, 1], 0]] as [Vec3, Vec3, number][]) {
    const b = cameraBasis(camera({ position, lookAt, roll }));
    near(dot(b.forward, b.forward), 1);
    near(dot(b.right, b.right), 1);
    near(dot(b.up, b.up), 1);
    near(dot(b.forward, b.right), 0);
    near(dot(b.forward, b.up), 0);
    near(dot(b.right, b.up), 0);
  }
});

test("looking straight down puts the top of the picture toward -Z, straight up toward +Z", () => {
  const down = cameraBasis(camera({ position: [0, 10, 0], lookAt: [0, 0, 0] }));
  nearVec(down.forward, [0, -1, 0]);
  nearVec(down.right, [1, 0, 0]);
  nearVec(down.up, [0, 0, -1]);
  const up = cameraBasis(camera({ position: [0, -10, 0], lookAt: [0, 0, 0] }));
  nearVec(up.forward, [0, 1, 0]);
  nearVec(up.up, [0, 0, 1]);
});

test("roll tilts the picture's up toward its right", () => {
  const b = cameraBasis(camera({ roll: 90 }));
  nearVec(b.up, [1, 0, 0]);
  nearVec(b.right, [0, -1, 0]);
  const c = cameraBasis(camera({ roll: 30 }));
  near(c.up[0], Math.sin(Math.PI / 6));
  near(c.up[1], Math.cos(Math.PI / 6));
});

test("a camera exactly on its target falls back to looking down -Z", () => {
  nearVec(cameraBasis(camera({ position: [2, 2, 2], lookAt: [2, 2, 2] })).forward, [0, 0, -1]);
});

test("the point the camera looks at is the centre of the picture", () => {
  const p = projectToScreen([0, 0, 0], camera(), 1920, 1080)!;
  near(p.x, 960);
  near(p.y, 540);
  near(p.depth, 5);
});

test("perspective: a point at the edge of the field of view lands on the edge of the picture", () => {
  // fov 60 vertical, distance 5: half the visible height is 5 * tan(30°)
  const half = 5 * Math.tan(Math.PI / 6);
  const top = projectToScreen([0, half, 0], camera(), 1000, 500)!;
  near(top.x, 500);
  near(top.y, 0, 1e-6);
  const right = projectToScreen([half * 2, 0, 0], camera(), 1000, 500)!; // aspect 2 → twice as wide
  near(right.x, 1000, 1e-6);
  near(right.y, 250);
});

test("+X is to the right and +Y is up on screen, and a point farther away is nearer the centre", () => {
  const near1 = projectToScreen([1, 1, 0], camera(), 800, 800)!;
  assert.ok(near1.x > 400 && near1.y < 400);
  const far1 = projectToScreen([1, 1, -10], camera(), 800, 800)!;
  assert.ok(Math.abs(far1.x - 400) < Math.abs(near1.x - 400));
  assert.ok(Math.abs(far1.y - 400) < Math.abs(near1.y - 400));
});

test("points behind a perspective camera, or beside an invalid camera, are not drawn", () => {
  assert.equal(projectToScreen([0, 0, 10], camera(), 800, 600), null);
  assert.equal(projectToScreen([0, 0, 5], camera(), 800, 600), null); // exactly at the camera
  assert.equal(projectToScreen([0, 0, 0], camera({ fov: 0 }), 800, 600), null);
});

test("orthographic: the visible height is orthoHeight and distance does not shrink anything", () => {
  const ortho = camera({ type: "orthographic", orthoHeight: 10 });
  const a = projectToScreen([0, 5, 0], ortho, 800, 800)!;
  near(a.y, 0);
  const b = projectToScreen([0, 5, -50], ortho, 800, 800)!;
  near(b.y, 0);
  const behind = projectToScreen([0, 0, 50], ortho, 800, 800)!; // still placed; nothing is "behind" a flat view
  near(behind.x, 400);
  assert.equal(projectToScreen([0, 0, 0], camera({ type: "orthographic", orthoHeight: 0 }), 800, 600), null);
});

test("roll turns the picture: with 90° of roll the world's right becomes the picture's up", () => {
  const p = projectToScreen([1, 0, 0], camera({ roll: 90 }), 800, 800)!;
  near(p.x, 400, 1e-6);
  assert.ok(p.y < 400);
  const q = projectToScreen([0, 1, 0], camera({ roll: 90 }), 800, 800)!; // and the world's up becomes the picture's left
  assert.ok(q.x < 400);
});

test("speakerAnchors finds objects by id, then ignoring capitals, and skips unknown speakers and unseen objects", () => {
  const positions: Record<string, Vec3> = { anna: [0, 0, 0], Ben: [1, 0, 0], hidden: [0, 0, 20] };
  const anchors = speakerAnchors(["Anna", "Ben", "Narrator", "hidden"], Object.keys(positions), (id) => positions[id], camera(), 800, 600);
  assert.deepEqual(Object.keys(anchors).sort(), ["Anna", "Ben"]);
  near(anchors.Anna.x, 400);
  assert.ok(anchors.Ben.x > 400);
  assert.deepEqual(speakerAnchors(["Anna"], ["anna"], () => undefined, camera(), 800, 600), {});
});

test("sky gradient: the horizon colour at 0, the top colour straight up, the ground colour straight down", () => {
  const preset = SKY_PRESETS.day;
  const rgb = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  nearVec(skyColorAt(preset, 0), rgb(preset.horizon));
  nearVec(skyColorAt(preset, 1), rgb(preset.top));
  nearVec(skyColorAt(preset, -1), rgb(preset.ground));
  nearVec(skyColorAt(preset, 5), rgb(preset.top)); // clamped
  nearVec(skyColorAt(preset, Number.NaN), rgb(preset.horizon));
  // a sky changes smoothly: no jumps between close directions
  let previous = skyColorAt(preset, -1);
  for (let y = -0.95; y <= 1; y += 0.05) {
    const c = skyColorAt(preset, y);
    assert.ok(Math.abs(c[0] - previous[0]) < 0.25 && Math.abs(c[2] - previous[2]) < 0.25);
    previous = c;
  }
});
