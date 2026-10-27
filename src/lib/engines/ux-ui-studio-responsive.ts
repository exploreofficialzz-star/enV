/**
 * Shared design data and property-level device overrides for one logical screen.
 * Keep this value in project/history snapshots; switching a preview only reads it.
 */
export type ResponsiveDevice = "mobile" | "tablet" | "desktop";
export type ResponsiveViewport = { width: number; height: number };
export type ResponsiveEditMode = "shared" | "device";
export type ResponsiveLayer = {
  id: string; kind: string; x: number; y: number; width: number; height: number;
  horizontalConstraint?: "left" | "center" | "right" | "stretch";
  verticalConstraint?: "top" | "center" | "bottom" | "stretch";
  minWidth?: number; maxWidth?: number; referenceWidth?: number; referenceHeight?: number;
};
export type ResponsiveLayerPatch<L extends ResponsiveLayer> = { values: Partial<L>; unset?: string[] };
export type ResponsiveDeviceOverrides<L extends ResponsiveLayer> = {
  viewport?: ResponsiveViewport;
  patches: Record<string, ResponsiveLayerPatch<L>>;
  added: L[];
  removed: string[];
  order?: string[];
};
export type ResponsiveDesign<L extends ResponsiveLayer> = {
  version: 1;
  baseTarget: ResponsiveDevice;
  baseViewport: ResponsiveViewport;
  baseElements: L[];
  overrides: Partial<Record<ResponsiveDevice, ResponsiveDeviceOverrides<L>>>;
};

const devices: ResponsiveDevice[] = ["mobile", "tablet", "desktop"];
const metadataKeys = new Set(["id", "referenceWidth", "referenceHeight"]);
const unsafeKeys = new Set(["__proto__", "prototype", "constructor"]);
const aspectKinds = new Set(["icon", "image", "ellipse", "avatar", "checkbox", "radio"]);
const own = (value: object, key: string) => Object.prototype.hasOwnProperty.call(value, key);
const asRecord = (value: object) => value as Record<string, unknown>;
const equal = (left: unknown, right: unknown) => left === right || JSON.stringify(left) === JSON.stringify(right);
const coordinate = (value: number) => Math.round(value * 1000) / 1000;
const viewport = (size: ResponsiveViewport): ResponsiveViewport => ({ width: Math.max(1, Number.isFinite(size.width) ? size.width : 390), height: Math.max(1, Number.isFinite(size.height) ? size.height : 844) });

/** Honor anchors and stretch constraints without stretching letters or icon artwork. */
export function adaptResponsiveLayer<L extends ResponsiveLayer>(layer: L, source: ResponsiveViewport, destination: ResponsiveViewport): L {
  const from = viewport(source), to = viewport(destination);
  const deltaX = to.width - from.width, deltaY = to.height - from.height;
  let width = Math.max(1, layer.width + (layer.horizontalConstraint === "stretch" ? deltaX : 0));
  let height = Math.max(1, layer.height + (layer.verticalConstraint === "stretch" ? deltaY : 0));
  if (layer.minWidth && layer.minWidth > 0) width = Math.max(layer.minWidth, width);
  if (layer.maxWidth && layer.maxWidth > 0) width = Math.min(layer.maxWidth, width);
  if (aspectKinds.has(layer.kind)) {
    const scale = Math.min(width / Math.max(1, layer.width), height / Math.max(1, layer.height));
    width = Math.max(1, layer.width * scale);
    height = Math.max(1, layer.height * scale);
  }
  let x = layer.x, y = layer.y;
  if (layer.horizontalConstraint === "right") x += deltaX + layer.width - width;
  else if (layer.horizontalConstraint === "center") x += deltaX / 2 + (layer.width - width) / 2;
  if (layer.verticalConstraint === "bottom") y += deltaY + layer.height - height;
  else if (layer.verticalConstraint === "center") y += deltaY / 2 + (layer.height - height) / 2;
  return { ...layer, x: coordinate(x), y: coordinate(y), width: coordinate(width), height: coordinate(height), referenceWidth: to.width, referenceHeight: to.height };
}

function difference<L extends ResponsiveLayer>(next: L, base: L): ResponsiveLayerPatch<L> | undefined {
  const values: Record<string, unknown> = {}, unset: string[] = [];
  const a = asRecord(next), b = asRecord(base);
  for (const key of new Set([...Object.keys(a), ...Object.keys(b)])) {
    if (metadataKeys.has(key) || unsafeKeys.has(key) || equal(a[key], b[key])) continue;
    if (!own(a, key) || a[key] === undefined) unset.push(key);
    else values[key] = a[key];
  }
  return Object.keys(values).length || unset.length ? { values: values as Partial<L>, ...(unset.length ? { unset } : {}) } : undefined;
}

function applyPatch<L extends ResponsiveLayer>(layer: L, patch?: ResponsiveLayerPatch<L>): L {
  if (!patch) return layer;
  const next = { ...layer, ...patch.values };
  for (const key of patch.unset || []) if (!metadataKeys.has(key)) delete asRecord(next)[key];
  return next;
}

function emptyOverrides<L extends ResponsiveLayer>(): ResponsiveDeviceOverrides<L> {
  return { patches: {}, added: [], removed: [] };
}

export function createResponsiveDesign<L extends ResponsiveLayer>(elements: L[], target: ResponsiveDevice, size: ResponsiveViewport): ResponsiveDesign<L> {
  return { version: 1, baseTarget: target, baseViewport: viewport(size), baseElements: elements.map(layer => ({ ...layer })), overrides: {} };
}

/** No mutation: an unedited device always derives from the latest shared design. */
export function responsiveElements<L extends ResponsiveLayer>(design: ResponsiveDesign<L>, target: ResponsiveDevice, size: ResponsiveViewport): L[] {
  const local = design.overrides[target];
  const removed = new Set(local?.removed || []);
  const localViewport = local?.viewport || size;
  let elements = design.baseElements.filter(layer => !removed.has(layer.id)).map(layer => adaptResponsiveLayer(applyPatch(adaptResponsiveLayer(layer, design.baseViewport, localViewport), local?.patches[layer.id]), localViewport, size));
  if (local) elements = [...elements, ...local.added.map(layer => adaptResponsiveLayer(layer, localViewport, size))];
  if (local?.order) {
    const byId = new Map(elements.map(layer => [layer.id, layer]));
    elements = [...local.order.flatMap(id => { const layer = byId.get(id); byId.delete(id); return layer ? [layer] : []; }), ...byId.values()];
  }
  return elements;
}

/**
 * Commit the complete edited layer array once per React state update.
 * Shared edits update only changed properties; explicit local overrides survive.
 */
export function commitResponsiveElements<L extends ResponsiveLayer>(design: ResponsiveDesign<L>, target: ResponsiveDevice, size: ResponsiveViewport, nextElements: L[], mode: ResponsiveEditMode): ResponsiveDesign<L> {
  if (mode === "device") {
    const base = design.baseElements.map(layer => adaptResponsiveLayer(layer, design.baseViewport, size));
    const byId = new Map(base.map(layer => [layer.id, layer]));
    const before = responsiveElements(design, target, size);
    const beforeById = new Map(before.map(layer => [layer.id, layer]));
    const previous = design.overrides[target];
    const nextIds = new Set(nextElements.map(layer => layer.id));
    const local = emptyOverrides<L>();
    local.viewport = viewport(size);
    for (const layer of nextElements) {
      const shared = byId.get(layer.id);
      if (shared) {
        let patch = difference(layer, shared);
        const oldPatch = previous?.patches[layer.id], oldLayer = beforeById.get(layer.id);
        if (oldPatch && oldLayer) {
          const edited = difference(layer, oldLayer);
          const editedKeys = new Set([...Object.keys(edited?.values || {}), ...(edited?.unset || [])]);
          const values = { ...patch?.values }, unset = new Set(patch?.unset || []);
          // An explicit device fix remains explicit if a shared edit happens to
          // match it. Only editing that field or Reset removes the override.
          for (const key of [...Object.keys(oldPatch.values), ...(oldPatch.unset || [])]) {
            if (editedKeys.has(key)) continue;
            if (oldPatch.unset?.includes(key)) { unset.add(key); delete asRecord(values)[key]; }
            else asRecord(values)[key] = asRecord(layer)[key];
          }
          patch = Object.keys(values).length || unset.size ? { values: values as Partial<L>, ...(unset.size ? { unset: [...unset] } : {}) } : undefined;
        }
        if (patch) local.patches[layer.id] = patch;
      } else local.added.push({ ...layer });
    }
    local.removed = base.filter(layer => !nextIds.has(layer.id)).map(layer => layer.id);
    const defaultOrder = [...base.filter(layer => nextIds.has(layer.id)), ...local.added].map(layer => layer.id);
    const order = nextElements.map(layer => layer.id);
    if (!equal(defaultOrder, order) || (previous?.order && equal(before.map(layer => layer.id), order))) local.order = order;
    const overrides = { ...design.overrides };
    if (Object.keys(local.patches).length || local.added.length || local.removed.length || local.order) overrides[target] = local;
    else delete overrides[target];
    return { ...design, overrides };
  }

  const before = responsiveElements(design, target, size);
  const beforeById = new Map(before.map(layer => [layer.id, layer]));
  const baseById = new Map(design.baseElements.map(layer => [layer.id, layer]));
  const nextIds = new Set(nextElements.map(layer => layer.id));
  const sharedDeleted = new Set(before.filter(layer => baseById.has(layer.id) && !nextIds.has(layer.id)).map(layer => layer.id));
  const globalAdded = new Set<string>();
  const editedLocalAdded: L[] = [];
  const baseChanges = new Map<string, L>();
  for (const layer of nextElements) {
    const original = beforeById.get(layer.id), shared = baseById.get(layer.id);
    if (shared && original) {
      const changed = difference(layer, original);
      if (changed) {
        const canonical = adaptResponsiveLayer(layer, size, design.baseViewport);
        const geometry = new Set(["x", "y", "width", "height"]);
        const values: Record<string, unknown> = {};
        for (const key of Object.keys(changed.values)) values[key] = geometry.has(key) ? asRecord(canonical)[key] : asRecord(layer)[key];
        baseChanges.set(layer.id, applyPatch(shared, { values: values as Partial<L>, unset: changed.unset }));
      }
    } else if (!shared && original) editedLocalAdded.push(adaptResponsiveLayer(layer, size, design.overrides[target]?.viewport || size));
    else if (!original) {
      baseChanges.set(layer.id, adaptResponsiveLayer(layer, size, design.baseViewport));
      globalAdded.add(layer.id);
    }
  }
  // Shared layers hidden only on this device remain in the design for other devices.
  const beforeOrder = before.filter(layer => baseById.has(layer.id) && nextIds.has(layer.id)).map(layer => layer.id);
  const nextOrder = nextElements.filter(layer => baseById.has(layer.id)).map(layer => layer.id);
  const orderChanged = !equal(beforeOrder, nextOrder);
  const visibleSharedOrder = orderChanged
    ? nextElements.filter(layer => baseById.has(layer.id) || globalAdded.has(layer.id)).map(layer => layer.id)
    : [...design.baseElements.filter(layer => !sharedDeleted.has(layer.id)).map(layer => layer.id), ...globalAdded];
  const ordered = new Set(visibleSharedOrder);
  const retained = design.baseElements.filter(layer => !sharedDeleted.has(layer.id) && !ordered.has(layer.id)).map(layer => layer.id);
  const baseElements = [...visibleSharedOrder, ...retained].flatMap(id => {
    const layer = baseChanges.get(id) || baseById.get(id);
    return layer ? [layer] : [];
  });
  const overrides: ResponsiveDesign<L>["overrides"] = {};
  for (const device of devices) {
    const previous = design.overrides[device];
    if (!previous) continue;
    const patches = Object.fromEntries(Object.entries(previous.patches).filter(([id]) => !sharedDeleted.has(id)));
    // A shared edit made from an overridden field becomes shared on the current
    // device too; overrides on the other devices remain untouched.
    if (device === target) for (const layer of nextElements) {
      const original = beforeById.get(layer.id);
      if (!original || !baseById.has(layer.id) || !patches[layer.id]) continue;
      const changed = difference(layer, original);
      if (!changed) continue;
      const patch = patches[layer.id];
      const values = { ...patch.values };
      const changedKeys = new Set([...Object.keys(changed.values), ...(changed.unset || [])]);
      for (const key of changedKeys) delete asRecord(values)[key];
      const unset = patch.unset?.filter(key => !changedKeys.has(key));
      if (Object.keys(values).length || unset?.length) patches[layer.id] = { values, ...(unset?.length ? { unset } : {}) };
      else delete patches[layer.id];
    }
    const added = device === target ? editedLocalAdded : previous.added;
    const removed = previous.removed.filter(id => !sharedDeleted.has(id));
    const order = previous.order?.filter(id => !sharedDeleted.has(id));
    if (Object.keys(patches).length || added.length || removed.length || order?.length) overrides[device] = { patches, added, removed, ...(previous.viewport ? { viewport: previous.viewport } : {}), ...(order?.length ? { order } : {}) };
  }
  return { ...design, baseElements, overrides };
}

export function hasResponsiveOverrides<L extends ResponsiveLayer>(design: ResponsiveDesign<L>, target: ResponsiveDevice): boolean {
  const local = design.overrides[target];
  return Boolean(local && (Object.keys(local.patches).length || local.added.length || local.removed.length || local.order?.length));
}

export function resetResponsiveDevice<L extends ResponsiveLayer>(design: ResponsiveDesign<L>, target: ResponsiveDevice): ResponsiveDesign<L> {
  if (!design.overrides[target]) return design;
  const overrides = { ...design.overrides };
  delete overrides[target];
  return { ...design, overrides };
}

/** Duplicate one logical screen without leaving overrides attached to its old IDs. */
export function cloneResponsiveDesign<L extends ResponsiveLayer>(design: ResponsiveDesign<L>, makeId: () => string): ResponsiveDesign<L> {
  // Project models contain JSON data only; this also isolates nested styles and
  // assets arrays in a duplicate from subsequent changes to its original.
  const clone = JSON.parse(JSON.stringify(design)) as ResponsiveDesign<L>;
  const sourceIds = new Set(clone.baseElements.map(layer => layer.id));
  for (const device of devices) {
    const local = clone.overrides[device];
    if (!local) continue;
    for (const id of [...local.added.map(layer => layer.id), ...Object.keys(local.patches), ...local.removed, ...(local.order || [])]) sourceIds.add(id);
  }
  const generated = new Set<string>();
  const ids = new Map<string, string>();
  for (const id of sourceIds) {
    const next = makeId();
    if (!next || sourceIds.has(next) || generated.has(next) || unsafeKeys.has(next)) throw new Error("Cloned layer IDs must be new and unique.");
    generated.add(next);
    ids.set(id, next);
  }
  const remap = (id: string) => ids.get(id) || id;
  clone.baseElements = clone.baseElements.map(layer => ({ ...layer, id: remap(layer.id) }));
  for (const device of devices) {
    const local = clone.overrides[device];
    if (!local) continue;
    local.added = local.added.map(layer => ({ ...layer, id: remap(layer.id) }));
    local.patches = Object.fromEntries(Object.entries(local.patches).map(([id, patch]) => [remap(id), patch]));
    local.removed = local.removed.map(remap);
    if (local.order) local.order = local.order.map(remap);
  }
  return clone;
}

/** Logical-screen cloning/deletion must also update links stored inside variants. */
export function remapResponsiveScreenLinks<L extends ResponsiveLayer & { prototypeTargetScreenId?: string }>(design: ResponsiveDesign<L>, destinations: ReadonlyMap<string, string>): ResponsiveDesign<L> {
  const remap = <T extends { prototypeTargetScreenId?: string }>(value: T): T => typeof value.prototypeTargetScreenId === "string" && destinations.has(value.prototypeTargetScreenId)
    ? { ...value, prototypeTargetScreenId: destinations.get(value.prototypeTargetScreenId) || "" } : value;
  const overrides = { ...design.overrides };
  for (const device of devices) {
    const local = overrides[device];
    if (local) overrides[device] = { ...local, added: local.added.map(remap), patches: Object.fromEntries(Object.entries(local.patches).map(([id, patch]) => [id, { ...patch, values: remap(patch.values) }])) };
  }
  return { ...design, baseElements: design.baseElements.map(remap), overrides };
}

/** Preserve old projects: their current screen becomes the shared source. */
export function restoreResponsiveDesign<L extends ResponsiveLayer>(raw: unknown, fallbackElements: L[], target: ResponsiveDevice, size: ResponsiveViewport): ResponsiveDesign<L> {
  const fallback = () => createResponsiveDesign(fallbackElements, target, size);
  if (!raw || typeof raw !== "object") return fallback();
  const saved = raw as Partial<ResponsiveDesign<L>>;
  if (saved.version !== 1 || !devices.includes(saved.baseTarget as ResponsiveDevice) || !saved.baseViewport || !Array.isArray(saved.baseElements)) return fallback();
  const validLayer = (layer: unknown): layer is L => Boolean(layer && typeof layer === "object" && typeof (layer as L).id === "string" && !unsafeKeys.has((layer as L).id) && typeof (layer as L).kind === "string" && ["x", "y", "width", "height"].every(key => Number.isFinite(asRecord(layer as object)[key])));
  if (!saved.baseElements.every(validLayer)) return fallback();
  const overrides: ResponsiveDesign<L>["overrides"] = {};
  for (const device of devices) {
    const local = saved.overrides?.[device];
    if (!local || typeof local !== "object" || !local.patches || typeof local.patches !== "object" || !Array.isArray(local.added) || !local.added.every(validLayer) || !Array.isArray(local.removed)) continue;
    const patches: ResponsiveDeviceOverrides<L>["patches"] = {};
    for (const [id, patch] of Object.entries(local.patches)) {
      if (unsafeKeys.has(id) || !patch || typeof patch !== "object" || !patch.values || typeof patch.values !== "object") continue;
      const values = { ...patch.values };
      for (const key of [...unsafeKeys, ...metadataKeys]) delete asRecord(values)[key];
      for (const key of ["x", "y", "width", "height"]) if (own(values, key) && !Number.isFinite(asRecord(values)[key])) delete asRecord(values)[key];
      const unset = Array.isArray(patch.unset) ? patch.unset.filter(key => typeof key === "string" && !metadataKeys.has(key) && !unsafeKeys.has(key)) : [];
      patches[id] = { values, ...(unset.length ? { unset } : {}) };
    }
    overrides[device] = { patches, added: local.added.map(layer => ({ ...layer })), removed: local.removed.filter(id => typeof id === "string"), ...(local.viewport ? { viewport: viewport(local.viewport) } : {}), ...(Array.isArray(local.order) ? { order: local.order.filter(id => typeof id === "string") } : {}) };
  }
  return { version: 1, baseTarget: saved.baseTarget!, baseViewport: viewport(saved.baseViewport), baseElements: saved.baseElements.map(layer => ({ ...layer })), overrides };
}
