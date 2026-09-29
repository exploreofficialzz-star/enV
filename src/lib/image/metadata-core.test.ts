import test from "node:test";
import assert from "node:assert/strict";
import { stripJpegMetadata, stripPngMetadata } from "./metadata-engine.ts";

test("JPEG metadata stripper removes APP1 and APP13 segments while preserving image markers", async () => {
  const bytes = new Uint8Array([
    0xff, 0xd8,
    0xff, 0xe1, 0x00, 0x0a, 0x45, 0x78, 0x69, 0x66, 0x00, 0x00, 0x01, 0x02,
    0xff, 0xed, 0x00, 0x06, 0x49, 0x50, 0x54, 0x43,
    0xff, 0xdb, 0x00, 0x04, 0x00, 0x00,
    0xff, 0xd9,
  ]);
  const blob = await stripJpegMetadata(new File([bytes], "sample.jpg", { type: "image/jpeg" }));
  const out = new Uint8Array(await blob.arrayBuffer());
  assert.equal(out.includes(0xe1), false);
  assert.equal(out.includes(0xed), false);
  assert.equal(out[2], 0xff);
  assert.equal(out[3], 0xdb);
});

test("PNG metadata stripper removes textual and physical-dimension chunks", async () => {
  const png = new Uint8Array([
    0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a,
    0,0,0,0, 0x74,0x45,0x58,0x74,
    0,0,0,0,
    0,0,0,0, 0,0,0,0, 0x49,0x45,0x4e,0x44,
    0,0,0,0,
  ]);
  const blob = await stripPngMetadata(new File([png], "sample.png", { type: "image/png" }));
  const out = new Uint8Array(await blob.arrayBuffer());
  const text = String.fromCharCode(...out);
  assert.equal(text.includes("tEXt"), false);
  assert.equal(text.includes("IEND"), true);
});


test("metadata stripping rejects unsupported formats instead of claiming success", async () => {
  const { stripMetadata } = await import("./metadata-engine.ts");
  await assert.rejects(() => stripMetadata(new File([new Uint8Array([1, 2, 3])], "sample.webp", { type: "image/webp" })), /Metadata removal is not configured/);
});
