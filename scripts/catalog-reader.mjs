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
