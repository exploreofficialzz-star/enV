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
