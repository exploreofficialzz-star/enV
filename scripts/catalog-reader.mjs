/**
 * Parse the generated catalog payload without depending on application imports.
 * @param {string} source contents of src/data/catalog.ts
 * @returns {any[]}
 */
export function parseGeneratedCatalog(source) {
  const match = source.match(/const catalogJson = \[\n([\s\S]*?)\n\]\.join\(""\);/);
  if (!match) throw new Error("Could not locate the generated catalog payload.");
  const chunks = JSON.parse(`[${match[1]}]`);
  if (!Array.isArray(chunks) || chunks.some((chunk) => typeof chunk !== "string")) {
    throw new Error("The generated catalog chunks are invalid.");
  }
  const catalog = JSON.parse(chunks.join(""));
  if (!Array.isArray(catalog)) throw new Error("The generated catalog payload is not an array.");
  return catalog;
}


/**
 * Parse the final runtime catalog, including the supplemental Audio Studio entries
 * appended by src/data/catalog.ts after the generated JSON payload.
 * Use this only for checks that validate the complete exported catalog.
 * @param {string} source contents of src/data/catalog.ts
 * @returns {any[]}
 */
export function parseFinalCatalog(source) {
  const catalog = parseGeneratedCatalog(source);
  const match = source.match(/const audioStudioTools:\s*ToolMeta\[\]\s*=\s*(\[[\s\S]*?\n\]);/);
  if (!match) throw new Error("Could not locate the supplemental Audio Studio catalog.");
  const supplemental = JSON.parse(match[1]);
  if (!Array.isArray(supplemental)) throw new Error("The supplemental Audio Studio catalog is not an array.");

  const seen = new Set(catalog.map((tool) => tool?.id).filter((id) => typeof id === "string"));
  for (const tool of supplemental) {
    if (!tool || typeof tool.id !== "string") {
      throw new Error("The supplemental Audio Studio catalog contains an entry without a tool id.");
    }
    if (!seen.has(tool.id)) {
      catalog.push(tool);
      seen.add(tool.id);
    }
  }
  return catalog;
}
