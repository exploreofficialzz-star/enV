import assert from "node:assert/strict";
import test from "node:test";
import { strToU8, zipSync } from "fflate";
import { docxToText, runLocalDocument } from "./local-document.ts";

function makeDocx(extraFiles: Record<string, Uint8Array> = {}) {
  const document = strToU8(
    '<?xml version="1.0" encoding="UTF-8"?><w:document xmlns:w="urn:w"><w:body><w:p><w:r><w:t>enV local document</w:t></w:r></w:p></w:body></w:document>',
  );
  return new Uint8Array(zipSync({
    "[Content_Types].xml": strToU8("<Types/>"),
    "word/document.xml": document,
    ...extraFiles,
  }));
}

function setCentralDirectoryUncompressedSize(zip: Uint8Array, name: string, size: number) {
  const signature = [0x50, 0x4b, 0x01, 0x02];
  for (let offset = 0; offset <= zip.length - 46; offset += 1) {
    if (!signature.every((byte, index) => zip[offset + index] === byte)) continue;
    const nameLength = zip[offset + 28] | (zip[offset + 29] << 8);
    const nameStart = offset + 46;
    const entryName = new TextDecoder().decode(zip.subarray(nameStart, nameStart + nameLength));
    if (entryName !== name) continue;
    zip[offset + 24] = size & 0xff;
    zip[offset + 25] = (size >>> 8) & 0xff;
    zip[offset + 26] = (size >>> 16) & 0xff;
    zip[offset + 27] = (size >>> 24) & 0xff;
    return;
  }
  throw new Error("ZIP central-directory entry not found: " + name);
}

test("DOCX text extraction returns document text with one final newline", () => {
  assert.equal(docxToText(makeDocx()), "enV local document\n");
});

test("DOCX extraction skips unrelated archive members without inflating them", () => {
  const zip = makeDocx({ "word/media/unused.bin": strToU8("not needed") });
  setCentralDirectoryUncompressedSize(zip, "word/media/unused.bin", 2 * 1024 * 1024 * 1024);
  assert.equal(docxToText(zip), "enV local document\n");
});

test("DOCX extraction rejects oversized document XML from ZIP metadata before inflation", () => {
  const zip = makeDocx();
  setCentralDirectoryUncompressedSize(zip, "word/document.xml", 32 * 1024 * 1024 + 1);
  assert.throws(() => docxToText(zip), /32 MB per-entry or 128 MB aggregate local extraction limit/);
});


test("local document tools reject oversized selections before reading file bytes", async () => {
  const huge = new File([], "large.docx");
  Object.defineProperty(huge, "size", { value: 200 * 1024 * 1024 + 1 });
  huge.arrayBuffer = async () => {
    throw new Error("Oversized file bytes should never be read.");
  };
  await assert.rejects(
    () => runLocalDocument("docx-text-extractor", [huge]),
    /200 MB local processing limit/,
  );
});
