/** Return every visible scene entry, or fail before producing a partial model. */
export function visibleExportEntries<T>(
  objects: readonly { id: string; visible: boolean }[],
  entries: ReadonlyMap<string, T>,
): T[] {
  const visible = objects.filter((object) => object.visible);
  if (!visible.length) throw new Error("Add a visible object to the scene before exporting.");
  return visible.map((object) => {
    const entry = entries.get(object.id);
    if (entry === undefined) throw new Error("A visible object could not be loaded. Fix the scene before exporting.");
    return entry;
  });
}

/** A playable project loads hidden objects as well, so all scene entries must be ready. */
export function assertGameEntriesReady(
  objects: readonly { id: string; name: string }[],
  entries: ReadonlyMap<string, unknown>,
): void {
  const missing = objects.find((object) => !entries.has(object.id));
  if (missing) throw new Error(`“${missing.name}” could not be loaded. Fix the scene before playing or building.`);
}
