import fs from "node:fs";

const matrixPath = new URL("../apps/shared/native-execution-matrix.json", import.meta.url);
const outputPath = new URL("../src/data/discovery-availability.json", import.meta.url);
const matrix = JSON.parse(fs.readFileSync(matrixPath, "utf8"));
const rows = Array.isArray(matrix.tools) ? matrix.tools : [];
const seen = new Set();
const encode = (value) => {
  if (value === "offline-native") return "d";
  if (value === "backend-native") return "s";
  if (value === "web-only") return "w";
  throw new Error("Unknown native execution class: " + String(value));
};

const compactRows = rows
  .filter((row) => row.status === "active" || row.status === "beta")
  .map((row) => {
    if (typeof row.id !== "string" || !row.id) {
      throw new Error("Native execution matrix contains an empty tool ID.");
    }
    if (seen.has(row.id)) throw new Error("Native execution matrix contains duplicate ID: " + row.id);
    seen.add(row.id);
    return [row.id, encode(row.android), encode(row.ios)];
  })
  .sort((left, right) => left[0].localeCompare(right[0]));

const document = {
  schemaVersion: 1,
  source: "apps/shared/native-execution-matrix.json",
  rows: compactRows,
};
const output = JSON.stringify(document) + "\n";

if (process.argv.includes("--check")) {
  if (!fs.existsSync(outputPath) || fs.readFileSync(outputPath, "utf8") !== output) {
    throw new Error("Discovery availability index is stale. Run npm run export:discovery-availability.");
  }
  console.log("Discovery availability index is current (" + compactRows.length + " active IDs).");
} else {
  fs.writeFileSync(outputPath, output);
  console.log("Wrote compact discovery availability index (" + compactRows.length + " active IDs).");
}
