import test from "node:test";
import assert from "node:assert/strict";
import { moveLayerItem } from "./design-layer-utils.ts";

test("layer stack reordering keeps each layer value and changes only the selected order", () => {
  const layers = [{ id: "back" }, { id: "middle" }, { id: "front" }];
  const movedUp = moveLayerItem(layers, 2, -1);
  assert.deepEqual(movedUp.map((item) => item.id), ["back", "front", "middle"]);
  assert.deepEqual(layers.map((item) => item.id), ["back", "middle", "front"]);
  assert.deepEqual(moveLayerItem(layers, 0, -1), layers);
  assert.deepEqual(moveLayerItem(layers, 2, 1), layers);
  assert.equal(moveLayerItem(layers, 1, -1)[0], layers[1]);
});
