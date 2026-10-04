import test from "node:test";
import assert from "node:assert/strict";
import { ANNOTATION_TOOLS, arrowHeadPoints, createAnnotation, dragCreate, duplicateObject, handleAt, handlesFor, hitTest, isDestructive, measureInfo, moveObject, nextStepNumber, objectBounds, outsideContent, pickObject, reorder, resizeByHandle } from "./annotations.ts";
import { canRedo, canUndo, commit, createHistory, redo, undo } from "./history.ts";

test("every annotation tool creates a valid, finite object", () => {
  for (const k of ANNOTATION_TOOLS) { const o = createAnnotation("x", k, { x: 10, y: 20 }); for (const v of [o.x, o.y, o.x2, o.y2, o.width, o.height, o.strokeWidth, o.opacity]) assert.ok(Number.isFinite(v), k); assert.equal(o.kind, k); assert.ok(o.name.length > 0); }
});

test("destructive kinds are never rotated and redaction is fully opaque", () => {
  for (const k of ["blur", "pixelate", "redact"] as const) { const o = createAnnotation("x", k, { x: 0, y: 0 }, { rotation: 33, opacity: 0.2 }); assert.equal(o.rotation, 0); assert.ok(isDestructive(o)); }
  assert.equal(createAnnotation("x", "redact", { x: 0, y: 0 }, { opacity: 0.1 }).opacity, 1);
});

test("dragCreate builds boxes in any drag direction and squares with shift/step", () => {
  const o = createAnnotation("r", "rect", { x: 100, y: 100 }), d = dragCreate(o, { x: 100, y: 100 }, { x: 40, y: 60 });
  assert.deepEqual([d.x, d.y, d.width, d.height], [40, 60, 60, 40]);
  const sq = dragCreate(o, { x: 0, y: 0 }, { x: 50, y: 30 }, { shift: true }); assert.equal(sq.width, sq.height);
  const st = dragCreate(createAnnotation("s", "step", { x: 0, y: 0 }), { x: 0, y: 0 }, { x: 40, y: 10 }); assert.equal(st.width, st.height);
});

test("line drag snaps to 45° with shift; pen drag appends points and skips duplicates", () => {
  const a = createAnnotation("a", "arrow", { x: 0, y: 0 }), d = dragCreate(a, { x: 0, y: 0 }, { x: 100, y: 10 }, { shift: true }); assert.ok(Math.abs(d.y2) < 1e-6 && d.x2 > 99);
  let p = createAnnotation("p", "pen", { x: 5, y: 5 }); p = dragCreate(p, { x: 5, y: 5 }, { x: 5.2, y: 5.2 }); assert.equal(p.points.length, 2);
  p = dragCreate(p, { x: 5, y: 5 }, { x: 30, y: 30 }); assert.equal(p.points.length, 4);
});

test("hit testing: lines within tolerance, ellipses by equation, locked/hidden skipped", () => {
  const ln = createAnnotation("l", "line", { x: 0, y: 0 }, { x2: 100, y2: 0, strokeWidth: 2 }); assert.ok(hitTest(ln, { x: 50, y: 4 })); assert.ok(!hitTest(ln, { x: 50, y: 30 }));
  const el = createAnnotation("e", "ellipse", { x: 0, y: 0 }, { width: 100, height: 100 }); assert.ok(hitTest(el, { x: 50, y: 50 })); assert.ok(!hitTest(el, { x: 2, y: 2 }, 0));
  const r = createAnnotation("r", "rect", { x: 0, y: 0 }, { width: 10, height: 10 }); assert.equal(pickObject([{ ...r, locked: true }], { x: 5, y: 5 }), null); assert.equal(pickObject([{ ...r, visible: false }], { x: 5, y: 5 }), null);
  const top = createAnnotation("t", "rect", { x: 0, y: 0 }, { width: 10, height: 10 }); assert.equal(pickObject([r, top], { x: 5, y: 5 })?.id, "t");
});

test("moveObject moves every coordinate family; locked objects refuse", () => {
  const p = { ...createAnnotation("p", "pen", { x: 1, y: 2 }), points: [1, 2, 3, 4] }, m = moveObject(p, 10, 20); assert.deepEqual(m.points, [11, 22, 13, 24]);
  assert.equal(moveObject({ ...p, locked: true }, 5, 5).x, p.x);
});

test("resizeByHandle keeps a minimum size, supports west/north edges and aspect lock", () => {
  const r = createAnnotation("r", "rect", { x: 100, y: 100 }, { width: 100, height: 50 });
  const nw = resizeByHandle(r, "nw", { x: 80, y: 90 }); assert.deepEqual([nw.x, nw.y, nw.width, nw.height], [80, 90, 120, 60]);
  assert.ok(resizeByHandle(r, "e", { x: 100, y: 100 }).width >= 4);
  const asp = resizeByHandle(r, "se", { x: 300, y: 130 }, { keepAspect: true }); assert.ok(Math.abs(asp.width / asp.height - 2) < 0.01);
  const ln = createAnnotation("l", "line", { x: 0, y: 0 }); assert.equal(resizeByHandle(ln, "end", { x: 9, y: 9 }).x2, 9);
});

test("handles: boxes get 8, callouts get a tail, lines get 2, pens none; handleAt respects radius/lock", () => {
  assert.equal(handlesFor(createAnnotation("r", "rect", { x: 0, y: 0 })).length, 8); assert.equal(handlesFor(createAnnotation("c", "callout", { x: 0, y: 0 })).length, 9);
  assert.equal(handlesFor(createAnnotation("l", "line", { x: 0, y: 0 })).length, 2); assert.equal(handlesFor(createAnnotation("p", "pen", { x: 0, y: 0 })).length, 0);
  const r = createAnnotation("r", "rect", { x: 0, y: 0 }, { width: 100, height: 100 }); assert.equal(handleAt(r, { x: 101, y: 101 }, 6), "se"); assert.equal(handleAt({ ...r, locked: true }, { x: 100, y: 100 }, 6), null);
});

test("z-order, duplicate, and step numbering", () => {
  const a = createAnnotation("a", "rect", { x: 0, y: 0 }), b = createAnnotation("b", "rect", { x: 0, y: 0 }), c = createAnnotation("c", "rect", { x: 0, y: 0 });
  assert.deepEqual(reorder([a, b, c], "a", "front").map((o) => o.id), ["b", "c", "a"]); assert.deepEqual(reorder([a, b, c], "c", "back").map((o) => o.id), ["c", "a", "b"]);
  assert.deepEqual(reorder([a, b, c], "b", "forward").map((o) => o.id), ["a", "c", "b"]); assert.deepEqual(reorder([a, b, c], "zzz", "front").length, 3);
  const s = createAnnotation("s", "step", { x: 0, y: 0 }, { step: 3 }); assert.equal(nextStepNumber([s]), 4); assert.equal(nextStepNumber([]), 1);
  const d = duplicateObject(s, "s2"); assert.equal(d.x, s.x + 24); assert.equal(d.step, 4); assert.equal(d.locked, false);
});

test("measure info, bounds, arrow head, outsideContent", () => {
  const m = createAnnotation("m", "measure", { x: 0, y: 0 }, { x2: 30, y2: 40 }); assert.equal(measureInfo(m).distance, 50);
  assert.deepEqual(objectBounds(m), { x: 0, y: 0, width: 30, height: 40 });
  const [tip, l, r] = arrowHeadPoints({ x: 0, y: 0 }, { x: 10, y: 0 }, 4); assert.deepEqual(tip, { x: 10, y: 0 }); assert.ok(l.x < 10 && r.x < 10 && l.y * r.y < 0);
  assert.ok(outsideContent(createAnnotation("b", "blur", { x: -5, y: 0 }), { x: 0, y: 0, width: 100, height: 100 }));
});

test("history: commit/undo/redo, branch cut, coalescing, limits", () => {
  let h = createHistory(0); h = commit(h, 1); h = commit(h, 2); assert.equal(h.present, 2); assert.ok(canUndo(h) && !canRedo(h));
  h = undo(h); assert.equal(h.present, 1); assert.ok(canRedo(h)); h = redo(h); assert.equal(h.present, 2);
  h = undo(h); h = commit(h, 9); assert.equal(h.future.length, 0); assert.equal(redo(h), h);
  let c = createHistory(0); for (let i = 1; i <= 5; i++) c = commit(c, i, { key: "slider", now: 1000 + i * 10 }); assert.equal(c.past.length, 1); assert.equal(undo(c).present, 0);
  c = commit(c, 99, { key: "slider", now: 99999 }); assert.equal(c.past.length, 2);
  let l = createHistory(0); for (let i = 1; i <= 10; i++) l = commit(l, i, { limit: 3 }); assert.equal(l.past.length, 3);
  assert.equal(commit(l, l.present), l); assert.equal(undo(createHistory(1)).present, 1);
});
