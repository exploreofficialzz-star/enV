import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { studioFontMetadata, studioFontWeightRange } from "./studio-font-metadata.ts";

const tag = (value: string) => [...value].reduce((result, character) => result * 256 + character.charCodeAt(0), 0);
function axisTable(name = "wght", min = 100, normal = 400, max = 900): Uint8Array {
  const bytes = new Uint8Array(36), view = new DataView(bytes.buffer);
  view.setUint16(0, 1); view.setUint16(4, 16); view.setUint16(8, 1); view.setUint16(10, 20);
  view.setUint32(16, tag(name)); view.setInt32(20, min * 65536); view.setInt32(24, normal * 65536); view.setInt32(28, max * 65536);
  return bytes;
}
function staticWeight(weight = 400): Uint8Array {
  const bytes = new Uint8Array(6); new DataView(bytes.buffer).setUint16(4, weight); return bytes;
}
function sfnt(tables: Array<[string, Uint8Array]>, signature = 0x00010000): Uint8Array {
  const length = 12 + tables.length * 16 + tables.reduce((sum, [, table]) => sum + table.length, 0);
  const bytes = new Uint8Array(length), view = new DataView(bytes.buffer);
  view.setUint32(0, signature); view.setUint16(4, tables.length);
  let offset = 12 + tables.length * 16;
  tables.forEach(([name, table], index) => {
    const entry = 12 + index * 16;
    view.setUint32(entry, tag(name)); view.setUint32(entry + 8, offset); view.setUint32(entry + 12, table.length);
    bytes.set(table, offset); offset += table.length;
  });
  return bytes;
}

test("bundled font weight descriptors match their actual variation axes", () => {
  const expected: Record<string, string> = { inter: "100 900", lora: "400 700", "jetbrains-mono": "100 800", caveat: "400 700", "bebas-neue": "400" };
  for (const [name, range] of Object.entries(expected)) {
    const bytes = readFileSync(new URL(`../../../public/uxui/fonts/${name}.ttf`, import.meta.url));
    const metadata = studioFontMetadata(bytes);
    assert.equal(metadata.format, "truetype", name);
    assert.equal(metadata.weightRange, range, name);
    assert.equal(metadata.hasVariations, name !== "bebas-neue", name);
    assert.equal(metadata.exactWeightRange, true, name);
  }
});

test("static fonts declare one actual OS/2 weight so the browser can synthesize missing weights", () => {
  assert.equal(studioFontWeightRange(sfnt([["OS/2", staticWeight()]])), "400");
  assert.equal(studioFontWeightRange(sfnt([["OS/2", staticWeight(700)]])), "700");
  assert.equal(studioFontWeightRange(sfnt([["OS/2", staticWeight(0)]])), "400");
  assert.equal(studioFontMetadata(sfnt([["OS/2", staticWeight()]], tag("OTTO"))).format, "opentype");
});

test("weight axes have exact bounded ranges; width-only variable fonts do not claim multiple weights", () => {
  const variable = studioFontMetadata(sfnt([["fvar", axisTable("wght", 250, 450, 850)], ["OS/2", staticWeight()]]));
  assert.equal(variable.hasVariations, true);
  assert.equal(variable.weightRange, "250 850");
  assert.equal(variable.defaultWeight, 450);
  const widthOnly = studioFontMetadata(sfnt([["fvar", axisTable("wdth", 75, 100, 125)], ["OS/2", staticWeight()]]));
  assert.equal(widthOnly.hasVariations, true);
  assert.equal(widthOnly.weightRange, "400");
  const invalid = studioFontMetadata(sfnt([["fvar", axisTable("wght", 900, 400, 100)]]));
  assert.equal(invalid.weightRange, "400");
  assert.equal(invalid.exactWeightRange, false);
});

test("data URLs and byte slices resolve the same font without exposing mutable cache results", () => {
  const bytes = sfnt([["fvar", axisTable()]]);
  const dataUrl = "data:font/ttf;base64," + Buffer.from(bytes).toString("base64");
  const padded = new Uint8Array(bytes.length + 16); padded.set(bytes, 8);
  assert.equal(studioFontWeightRange(padded.subarray(8, bytes.length + 8)), "100 900");
  assert.equal(studioFontWeightRange(dataUrl), "100 900");
  assert.equal(Object.isFrozen(studioFontMetadata(dataUrl)), true);
  assert.equal(studioFontMetadata(dataUrl), studioFontMetadata(dataUrl));
});

test("WOFF table directories distinguish uncompressed weight axes from unknown compressed ranges", () => {
  function woff(data: Uint8Array, originalLength = data.length) {
    const bytes = new Uint8Array(64 + data.length), view = new DataView(bytes.buffer);
    view.setUint32(0, tag("wOFF")); view.setUint32(8, bytes.length); view.setUint16(12, 1);
    view.setUint32(44, tag("fvar")); view.setUint32(48, 64); view.setUint32(52, data.length); view.setUint32(56, originalLength);
    bytes.set(data, 64); return bytes;
  }
  const raw = studioFontMetadata(woff(axisTable("wght", 200, 400, 800)));
  assert.equal(raw.format, "woff"); assert.equal(raw.weightRange, "200 800");
  const compressed = studioFontMetadata(woff(new Uint8Array(8), 36));
  assert.equal(compressed.hasVariations, true);
  assert.equal(compressed.weightRange, "400", "compressed variation data cannot establish a wght axis");
  assert.equal(compressed.exactWeightRange, false);
});

test("WOFF2 detects variable directories while preserving synthetic bold for unknown compressed axes", () => {
  const bytes = new Uint8Array(51), view = new DataView(bytes.buffer);
  view.setUint32(0, tag("wOF2")); view.setUint32(8, bytes.length); view.setUint16(12, 1); view.setUint32(20, 1);
  bytes[48] = 47; bytes[49] = 36;
  const metadata = studioFontMetadata(bytes);
  assert.equal(metadata.format, "woff2"); assert.equal(metadata.hasVariations, true);
  assert.equal(metadata.weightRange, "400"); assert.equal(metadata.exactWeightRange, false);
  bytes[49] = 0x80; bytes[50] = 0x80;
  assert.equal(studioFontMetadata(bytes).format, "unknown");
});

test("truncated, invalid, overlarge and non-data sources safely fall back to a single weight", () => {
  for (const input of ["", "https://example.com/font.ttf", "data:font/ttf;base64,@@@", "data:font/ttf;base64,A", new Uint8Array(0), new Uint8Array(4 * 1024 * 1024 + 1)]) {
    assert.equal(studioFontWeightRange(input), "400");
  }
  const shortAxis = sfnt([["fvar", new Uint8Array(4)]]);
  assert.equal(studioFontWeightRange(shortAxis), "400");
  const badOffset = sfnt([["fvar", axisTable()]]);
  new DataView(badOffset.buffer).setUint32(20, 0xffffffff);
  assert.equal(studioFontWeightRange(badOffset), "400");
});
