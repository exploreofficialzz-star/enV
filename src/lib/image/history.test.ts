import test from "node:test";
import assert from "node:assert/strict";
import * as h from "./history.ts";
import { offerImage, takeHandoff, peekHandoff } from "./handoff.ts";

test("history: push, undo, redo, limit, reset stays undoable", () => {
  let s = h.createHistory({ v: 0 });
  const a = { v: 1 }, b = { v: 2 };
  s = h.pushHistory(s, a); s = h.pushHistory(s, b);
  assert.equal(s.present, b); assert.ok(h.canUndo(s) && !h.canRedo(s));
  s = h.undoHistory(s); assert.equal(s.present, a); assert.ok(h.canRedo(s));
  s = h.redoHistory(s); assert.equal(s.present, b);
  s = h.undoHistory(s); s = h.pushHistory(s, { v: 9 }); assert.equal(h.canRedo(s), false);
  assert.equal(h.pushHistory(s, s.present), s);
  const initial = { v: 0 }; let r = h.createHistory(initial); r = h.pushHistory(r, { v: 5 }); r = h.resetHistory(r, initial);
  assert.equal(r.present, initial); assert.ok(h.canUndo(r)); r = h.undoHistory(r); assert.equal(r.present.v, 5);
  let big = h.createHistory(0); for (let i = 1; i <= 150; i++) big = h.pushHistory(big, i, 50); assert.equal(big.past.length, 50);
  assert.equal(h.undoHistory(h.createHistory(1)).present, 1);
});

test("hand-off passes an image once and clears", () => {
  assert.equal(peekHandoff(), null);
  offerImage({ blob: new Blob(["x"]), name: "a.png", from: "image-cropper" });
  assert.equal(peekHandoff()?.name, "a.png");
  assert.equal(takeHandoff()?.from, "image-cropper"); assert.equal(takeHandoff(), null);
});
