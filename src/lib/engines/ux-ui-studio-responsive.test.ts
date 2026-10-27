import test from "node:test";
import assert from "node:assert/strict";
import {
  adaptResponsiveLayer, cloneResponsiveDesign, commitResponsiveElements, createResponsiveDesign, hasResponsiveOverrides,
  resetResponsiveDevice, responsiveElements, restoreResponsiveDesign, remapResponsiveScreenLinks,
  type ResponsiveLayer,
} from "./ux-ui-studio-responsive.ts";

type Layer = ResponsiveLayer & { text: string; color: string; fontSize: number; groupId?: string };
const mobile = { width: 390, height: 844 }, tablet = { width: 768, height: 1024 }, desktop = { width: 1440, height: 900 };
const card: Layer = { id: "card", kind: "search", x: 24, y: 90, width: 342, height: 44, horizontalConstraint: "stretch", verticalConstraint: "top", text: "Search…", color: "#111111", fontSize: 16 };
const icon: Layer = { id: "icon", kind: "icon", x: 24, y: 160, width: 24, height: 24, horizontalConstraint: "left", verticalConstraint: "top", text: "", color: "#111111", fontSize: 16 };

test("screen cloning and deletion remap shared, local and overridden prototype links", () => {
  const source = { ...card, prototypeTargetScreenId: "screen-two" };
  let model = createResponsiveDesign([source], "mobile", mobile);
  model = commitResponsiveElements(model, "tablet", tablet, [{ ...responsiveElements(model, "tablet", tablet)[0], prototypeTargetScreenId: "screen-three" }, { ...source, id: "local", prototypeTargetScreenId: "screen-two" }], "device");
  const cloned = remapResponsiveScreenLinks(model, new Map([["screen-two", "copy-two"], ["screen-three", "copy-three"]]));
  assert.equal(responsiveElements(cloned, "mobile", mobile)[0].prototypeTargetScreenId, "copy-two");
  assert.deepEqual(responsiveElements(cloned, "tablet", tablet).map(layer => layer.prototypeTargetScreenId), ["copy-three", "copy-two"]);
  const deleted = remapResponsiveScreenLinks(cloned, new Map([["copy-two", ""], ["copy-three", ""]]));
  for (const device of ["mobile", "tablet", "desktop"] as const) assert.ok(responsiveElements(deleted, device, device === "mobile" ? mobile : device === "tablet" ? tablet : desktop).every(layer => layer.prototypeTargetScreenId === ""));
  assert.equal(model.baseElements[0].prototypeTargetScreenId, "screen-two", "remapping leaves the original project intact");
});

test("device previews derive from one design without stretching text or icon artwork", () => {
  const model = createResponsiveDesign([card, icon], "mobile", mobile);
  const elements = responsiveElements(model, "tablet", tablet);
  assert.equal(elements[0].width, tablet.width - 48);
  assert.equal(elements[0].x, 24);
  assert.equal(elements[0].height, 44);
  assert.equal(elements[0].fontSize, 16);
  assert.equal(elements[1].width, 24);
  assert.equal(elements[1].height, 24);
  assert.deepEqual(model.baseElements, [card, icon], "reading another device does not resize the source");
  assert.deepEqual(responsiveElements(model, "mobile", mobile).map(({ referenceWidth: _referenceWidth, referenceHeight: _referenceHeight, ...layer }) => layer), [card, icon]);
});

test("shared content and geometry edits made on tablet propagate back to mobile and desktop", () => {
  const model = createResponsiveDesign([card, icon], "mobile", mobile);
  const edits = responsiveElements(model, "tablet", tablet).map(layer => layer.id === "card" ? { ...layer, text: "Find products", color: "#6750a4", width: layer.width - 20 } : layer);
  const result = commitResponsiveElements(model, "tablet", tablet, edits, "shared");
  assert.equal(responsiveElements(result, "mobile", mobile)[0].text, "Find products");
  assert.equal(responsiveElements(result, "mobile", mobile)[0].width, card.width - 20);
  assert.equal(responsiveElements(result, "desktop", desktop)[0].width, desktop.width - 68);
  assert.equal(responsiveElements(result, "desktop", desktop)[0].color, "#6750a4");
  assert.equal(model.baseElements[0].text, "Search…", "history snapshots remain unchanged");
});

test("device fixes survive subsequent shared edits to the same layer", () => {
  let model = createResponsiveDesign([card, icon], "mobile", mobile);
  const tabletEdit = responsiveElements(model, "tablet", tablet).map(layer => layer.id === "card" ? { ...layer, x: 70, width: 600, color: "#ff0000" } : layer);
  model = commitResponsiveElements(model, "tablet", tablet, tabletEdit, "device");
  assert.equal(hasResponsiveOverrides(model, "tablet"), true);
  const phoneEdit = responsiveElements(model, "mobile", mobile).map(layer => layer.id === "card" ? { ...layer, text: "Shared new words", color: "#0000ff" } : layer);
  model = commitResponsiveElements(model, "mobile", mobile, phoneEdit, "shared");
  const fixed = responsiveElements(model, "tablet", tablet)[0];
  assert.equal(fixed.text, "Shared new words");
  assert.equal(fixed.color, "#ff0000");
  assert.equal(fixed.x, 70);
  assert.equal(fixed.width, 600);
  assert.equal(responsiveElements(model, "desktop", desktop)[0].color, "#0000ff");
  const reset = resetResponsiveDevice(model, "tablet");
  assert.equal(hasResponsiveOverrides(reset, "tablet"), false);
  assert.equal(responsiveElements(reset, "tablet", tablet)[0].x, 24);
  assert.equal(responsiveElements(reset, "tablet", tablet)[0].color, "#0000ff");
});

test("shared edits from an overridden device change only the edited fields", () => {
  let model = createResponsiveDesign([card, icon], "mobile", mobile);
  model = commitResponsiveElements(model, "tablet", tablet, responsiveElements(model, "tablet", tablet).map(layer => layer.id === "card" ? { ...layer, x: 80, color: "#ff0000" } : layer), "device");
  model = commitResponsiveElements(model, "tablet", tablet, responsiveElements(model, "tablet", tablet).map(layer => layer.id === "card" ? { ...layer, text: "Search the catalog" } : layer), "shared");
  assert.equal(responsiveElements(model, "mobile", mobile)[0].text, "Search the catalog");
  assert.equal(responsiveElements(model, "mobile", mobile)[0].x, 24);
  assert.equal(responsiveElements(model, "mobile", mobile)[0].color, "#111111");
  assert.equal(responsiveElements(model, "tablet", tablet)[0].x, 80);
});

test("new shared layers and deletion propagate while local additions and removals stay local", () => {
  let model = createResponsiveDesign([card, icon], "mobile", mobile);
  const badge = { ...icon, id: "local-badge", x: 600 };
  model = commitResponsiveElements(model, "tablet", tablet, [responsiveElements(model, "tablet", tablet)[0], badge], "device");
  assert.deepEqual(responsiveElements(model, "tablet", tablet).map(layer => layer.id), ["card", "local-badge"]);
  assert.deepEqual(responsiveElements(model, "mobile", mobile).map(layer => layer.id), ["card", "icon"]);
  const sharedLabel = { ...icon, id: "shared-label", kind: "text", text: "Welcome" };
  model = commitResponsiveElements(model, "mobile", mobile, [...responsiveElements(model, "mobile", mobile), sharedLabel], "shared");
  assert.ok(responsiveElements(model, "tablet", tablet).some(layer => layer.id === "shared-label"));
  assert.ok(responsiveElements(model, "tablet", tablet).some(layer => layer.id === "local-badge"));
  model = commitResponsiveElements(model, "desktop", desktop, responsiveElements(model, "desktop", desktop).filter(layer => layer.id !== "card"), "shared");
  assert.ok(!responsiveElements(model, "tablet", tablet).some(layer => layer.id === "card"));
  assert.ok(responsiveElements(model, "tablet", tablet).some(layer => layer.id === "local-badge"));
});

test("local layer ordering does not leak into a later shared text edit", () => {
  let model = createResponsiveDesign([card, icon], "mobile", mobile);
  model = commitResponsiveElements(model, "tablet", tablet, responsiveElements(model, "tablet", tablet).reverse(), "device");
  model = commitResponsiveElements(model, "tablet", tablet, responsiveElements(model, "tablet", tablet).map(layer => ({ ...layer, text: "Updated" })), "shared");
  assert.deepEqual(responsiveElements(model, "mobile", mobile).map(layer => layer.id), ["card", "icon"]);
  assert.deepEqual(responsiveElements(model, "tablet", tablet).map(layer => layer.id), ["icon", "card"]);
});

test("removing an optional property locally survives export/import and does not affect the shared property", () => {
  const grouped = { ...icon, groupId: "group-a" };
  let model = createResponsiveDesign<Layer>([grouped], "mobile", mobile);
  const [local] = responsiveElements(model, "tablet", tablet);
  delete local.groupId;
  model = commitResponsiveElements(model, "tablet", tablet, [local], "device");
  model = restoreResponsiveDesign(JSON.parse(JSON.stringify(model)), [], "mobile", mobile);
  assert.equal(responsiveElements(model, "tablet", tablet)[0].groupId, undefined);
  assert.equal(responsiveElements(model, "mobile", mobile)[0].groupId, "group-a");
});

test("legacy projects become shared designs and malformed models fall back to the current artboard", () => {
  const legacy = restoreResponsiveDesign(undefined, [card, icon], "mobile", mobile);
  assert.equal(legacy.version, 1);
  assert.equal(responsiveElements(legacy, "desktop", desktop).length, 2);
  const malformed = restoreResponsiveDesign({ version: 1, baseTarget: "mobile", baseViewport: mobile, baseElements: [{ ...card, x: NaN }] }, [icon], "tablet", tablet);
  assert.equal(malformed.baseTarget, "tablet");
  assert.equal(malformed.baseElements[0].id, "icon");
});

test("center, right and bottom anchors preserve their geometric meaning", () => {
  const anchored = adaptResponsiveLayer({ ...icon, x: 342, y: 796, horizontalConstraint: "right", verticalConstraint: "bottom" }, mobile, tablet);
  assert.equal(tablet.width - anchored.x - anchored.width, 24);
  assert.equal(tablet.height - anchored.y - anchored.height, 24);
  const centered = adaptResponsiveLayer({ ...icon, x: 183, horizontalConstraint: "center" }, mobile, tablet);
  assert.equal(centered.x + centered.width / 2, tablet.width / 2);
});

test("preview switches and unchanged shared commits do not accumulate coordinate rounding", () => {
  let model = createResponsiveDesign([{ ...card, x: 24.125, width: 341.75 }], "mobile", mobile);
  for (let index = 0; index < 30; index++) {
    model = commitResponsiveElements(model, "tablet", tablet, responsiveElements(model, "tablet", tablet), "shared");
    model = commitResponsiveElements(model, "desktop", desktop, responsiveElements(model, "desktop", desktop), "shared");
  }
  assert.equal(model.baseElements[0].x, 24.125);
  assert.equal(model.baseElements[0].width, 341.75);
});

test("reverting a local field to the shared value clears the override", () => {
  let model = createResponsiveDesign([card], "mobile", mobile);
  const shared = responsiveElements(model, "tablet", tablet);
  model = commitResponsiveElements(model, "tablet", tablet, [{ ...shared[0], color: "#ff0000" }], "device");
  model = commitResponsiveElements(model, "tablet", tablet, shared, "device");
  assert.equal(hasResponsiveOverrides(model, "tablet"), false);
});

test("cloned designs remap shared/local IDs and every override reference while preserving the views", () => {
  let model = createResponsiveDesign([card, icon], "mobile", mobile);
  const local = { ...icon, id: "tablet-only", x: 600 };
  model = commitResponsiveElements(model, "tablet", tablet, [local, { ...responsiveElements(model, "tablet", tablet)[0], color: "#ff0000" }], "device");
  let counter = 0;
  const clone = cloneResponsiveDesign(model, () => "new-" + ++counter);
  const oldIds = new Set(["card", "icon", "tablet-only"]);
  for (const layer of clone.baseElements) assert.ok(!oldIds.has(layer.id));
  const localClone = clone.overrides.tablet!;
  for (const id of [...Object.keys(localClone.patches), ...localClone.added.map(layer => layer.id), ...localClone.removed, ...(localClone.order || [])]) assert.ok(!oldIds.has(id));
  for (const [target, size] of [["mobile", mobile], ["tablet", tablet], ["desktop", desktop]] as const) {
    const withoutId = ({ id: _id, ...layer }: Layer) => layer;
    assert.deepEqual(responsiveElements(clone, target, size).map(withoutId), responsiveElements(model, target, size).map(withoutId));
  }
  localClone.patches[clone.baseElements[0].id].values.color = "#00ff00";
  assert.equal(responsiveElements(model, "tablet", tablet).find(layer => layer.id === "card")!.color, "#ff0000");
  assert.throws(() => cloneResponsiveDesign(model, () => "same"), /new and unique/);
});

test("local additions retain their anchors when their device viewport changes", () => {
  let model = createResponsiveDesign([card], "mobile", mobile);
  const local = { ...icon, id: "tablet-only", x: 720, horizontalConstraint: "right" as const };
  model = commitResponsiveElements(model, "tablet", tablet, [...responsiveElements(model, "tablet", tablet), local], "device");
  const widerTablet = { width: 820, height: 1180 };
  const wider = responsiveElements(model, "tablet", widerTablet);
  assert.equal(wider.find(layer => layer.id === "tablet-only")!.x, 772);
  model = commitResponsiveElements(model, "tablet", widerTablet, wider.map(layer => layer.id === "tablet-only" ? { ...layer, color: "#abcdef" } : layer), "shared");
  assert.equal(responsiveElements(model, "tablet", tablet).find(layer => layer.id === "tablet-only")!.x, 720);
});

test("a device fix stays independent when shared content temporarily matches it", () => {
  let model = createResponsiveDesign([card], "mobile", mobile);
  model = commitResponsiveElements(model, "tablet", tablet, responsiveElements(model, "tablet", tablet).map(layer => ({ ...layer, color: "#ff0000" })), "device");
  model = commitResponsiveElements(model, "mobile", mobile, responsiveElements(model, "mobile", mobile).map(layer => ({ ...layer, color: "#ff0000" })), "shared");
  model = commitResponsiveElements(model, "tablet", tablet, responsiveElements(model, "tablet", tablet).map(layer => ({ ...layer, x: 40 })), "device");
  model = commitResponsiveElements(model, "mobile", mobile, responsiveElements(model, "mobile", mobile).map(layer => ({ ...layer, color: "#0000ff" })), "shared");
  assert.equal(responsiveElements(model, "tablet", tablet)[0].color, "#ff0000");
  assert.equal(responsiveElements(model, "tablet", tablet)[0].x, 40);
});
