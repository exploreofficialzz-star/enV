import assert from "node:assert/strict";
import { extractPdfPagesInWorker, extractSelectedPdfsInWorker, inspectPdfInWorker, mergePdfsInWorker, rotateSelectedPdfsInWorker, splitPdfIntoZipInWorker, splitSelectedPdfsIntoZipInWorker } from "./pdf-worker-client.ts";
import test from "node:test";
import { PDFDocument } from "pdf-lib";
import {
  A_BOOK_PDF_LIMITS,
  extractPdfPages,
  extractSelectedPdfs,
  inspectPdf,
  mergePdfs,
  parsePageRanges,
  rotatePdf,
  rotateSelectedPdfs,
  splitPdfIntoZip,
  splitSelectedPdfsIntoZip,
} from "./pdf.ts";

async function samplePdf(pageCount: number, title = "A book test"): Promise<Blob> {
  const pdf = await PDFDocument.create();
  pdf.setTitle(title);
  for (let index = 0; index < pageCount; index += 1) pdf.addPage([300 + index, 400]);
  const bytes = await pdf.save();
  return new Blob([bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer], { type: "application/pdf" });
}

test("inspects a locally generated PDF without a network service", async () => {
  const result = await inspectPdf(await samplePdf(3));
  assert.equal(result.pageCount, 3);
  assert.equal(result.title, "A book test");
  assert.equal(result.encrypted, false);
});

test("extracts requested pages in the requested order", async () => {
  const input = await samplePdf(4);
  const output = await extractPdfPages(input, [4, 2]);
  const extracted = await PDFDocument.load(output);
  assert.equal(extracted.getPageCount(), 2);
  assert.equal(extracted.getPage(0).getSize().width, 303);
  assert.equal(extracted.getPage(1).getSize().width, 301);
});

test("rotates a PDF locally", async () => {
  const output = await rotatePdf(await samplePdf(1), 90);
  const pdf = await PDFDocument.load(output);
  assert.equal(pdf.getPage(0).getRotation().angle, 90);
});

test("merges multiple PDFs and rejects a single-file merge", async () => {
  const output = await mergePdfs([await samplePdf(1), await samplePdf(2)]);
  assert.equal((await PDFDocument.load(output)).getPageCount(), 3);
  await assert.rejects(async () => mergePdfs([await samplePdf(1)]), /at least two/);
});

test("parses page ranges, preserves order, and rejects invalid or repeated pages", () => {
  assert.deepEqual(parsePageRanges("3,1-2", 4), [3, 1, 2]);
  assert.throws(() => parsePageRanges("0-2", 4), /Choose page numbers/);
  assert.throws(() => parsePageRanges("1-3,3", 4), /included more than once/);
  assert.throws(() => parsePageRanges("1-5", 4), /Choose page numbers/);
});

test("splits a PDF into a local ZIP containing separate parts", async () => {
  const { unzipSync } = await import("fflate");
  const archive = await splitPdfIntoZip(await samplePdf(6), "source.pdf", "1-2;3-6");
  const entries = unzipSync(archive);
  assert.deepEqual(Object.keys(entries).sort(), ["source-part-01.pdf", "source-part-02.pdf"]);
  assert.equal((await PDFDocument.load(entries["source-part-01.pdf"])).getPageCount(), 2);
  assert.equal((await PDFDocument.load(entries["source-part-02.pdf"])).getPageCount(), 4);
  await assert.rejects(() => splitPdfIntoZip(new Blob(), "source.pdf", "1-2"), /empty/);
});

test("rotates selected PDFs as a bounded local batch archive", async () => {
  const files = [
    { name: "one.pdf", blob: await samplePdf(1) },
    { name: "two.pdf", blob: await samplePdf(2) },
  ];
  const archive = await rotateSelectedPdfs(files, 180);
  const { unzipSync } = await import("fflate");
  const entries = unzipSync(archive);
  assert.equal(Object.keys(entries).length, 2);
  assert.equal((await PDFDocument.load(entries["one-rotated.pdf"])).getPage(0).getRotation().angle, 180);
  assert.equal(A_BOOK_PDF_LIMITS.maxBatchFiles, 25);
});


test("extracts the same page range from a PDF batch into distinct local ZIP entries", async () => {
  const { unzipSync } = await import("fflate");
  const files = [
    { name: "Research.pdf", blob: await samplePdf(4) },
    { name: "research.PDF", blob: await samplePdf(3) },
  ];
  const archive = await extractSelectedPdfs(files, "1,3");
  const entries = unzipSync(archive);
  assert.deepEqual(Object.keys(entries).sort(), ["Research-extracted-2.pdf", "Research-extracted.pdf"]);
  assert.equal((await PDFDocument.load(entries["Research-extracted.pdf"])).getPageCount(), 2);
  assert.equal((await PDFDocument.load(entries["Research-extracted-2.pdf"])).getPageCount(), 2);
});

test("batch extraction validates every source before producing an archive", async () => {
  const valid = await samplePdf(4);
  const tooShort = await samplePdf(2);
  await assert.rejects(
    () => extractSelectedPdfs([
      { name: "valid.pdf", blob: valid },
      { name: "too-short.pdf", blob: tooShort },
    ], "1-3"),
    /Choose page numbers from 1 to 2/,
  );
  await assert.rejects(() => extractSelectedPdfs([], "1"), /Choose at least one PDF/);
});

test("splits several PDFs locally with unique entries and independent part contents", async () => {
  const { unzipSync } = await import("fflate");
  const archive = await splitSelectedPdfsIntoZip([
    { name: "chapter.pdf", blob: await samplePdf(4) },
    { name: "chapter.pdf", blob: await samplePdf(5) },
  ], "1-2;3-4");
  const entries = unzipSync(archive);
  assert.deepEqual(Object.keys(entries).sort(), [
    "chapter-part-01-2.pdf",
    "chapter-part-01.pdf",
    "chapter-part-02-2.pdf",
    "chapter-part-02.pdf",
  ]);
  assert.equal((await PDFDocument.load(entries["chapter-part-01.pdf"])).getPageCount(), 2);
  assert.equal((await PDFDocument.load(entries["chapter-part-02-2.pdf"])).getPageCount(), 2);
});

test("batch split validates all source page groups before constructing the ZIP", async () => {
  const valid = await samplePdf(6);
  const tooShort = await samplePdf(2);
  await assert.rejects(
    () => splitSelectedPdfsIntoZip([
      { name: "valid.pdf", blob: valid },
      { name: "too-short.pdf", blob: tooShort },
    ], "1-2;3-4"),
    /Choose page numbers from 1 to 2/,
  );
  await assert.rejects(() => splitSelectedPdfsIntoZip([], "1-2;3-4"), /Choose at least one PDF/);
});


test("A book PDF worker client preserves local processing in non-Worker test environments", async () => {
  const one = await samplePdf(4);
  const two = await samplePdf(3);
  const info = await inspectPdfInWorker(one);
  assert.equal(info.pageCount, 4);

  const extracted = await extractPdfPagesInWorker(one, [1, 3]);
  assert.equal((await PDFDocument.load(extracted)).getPageCount(), 2);

  const batchExtract = await extractSelectedPdfsInWorker([
    { name: "one.pdf", blob: one },
    { name: "two.pdf", blob: two },
  ], "1,2");
  const { unzipSync } = await import("fflate");
  assert.equal(Object.keys(unzipSync(batchExtract)).length, 2);

  const split = await splitPdfIntoZipInWorker(one, "one.pdf", "1-2;3-4");
  assert.equal(Object.keys(unzipSync(split)).length, 2);

  const batchSplit = await splitSelectedPdfsIntoZipInWorker([
    { name: "one.pdf", blob: one },
    { name: "two.pdf", blob: two },
  ], "1-2;3");
  assert.equal(Object.keys(unzipSync(batchSplit)).length, 4);

  const rotated = await rotateSelectedPdfsInWorker([
    { name: "one.pdf", blob: one },
    { name: "two.pdf", blob: two },
  ], 90);
  assert.equal(Object.keys(unzipSync(rotated)).length, 2);

  const merged = await mergePdfsInWorker([one, two]);
  assert.equal((await PDFDocument.load(merged)).getPageCount(), 7);
});


test("A book PDF worker cancellation terminates the worker and rejects with AbortError", async () => {
  const originalWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
  const originalWorker = Object.getOwnPropertyDescriptor(globalThis, "Worker");
  let terminated = false;
  let posted = false;

  class FakeWorker {
    onmessage: ((event: MessageEvent) => void) | null = null;
    onerror: ((event: ErrorEvent) => void) | null = null;
    onmessageerror: (() => void) | null = null;
    postMessage() { posted = true; }
    terminate() { terminated = true; }
  }

  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: {
      setTimeout: globalThis.setTimeout.bind(globalThis),
      clearTimeout: globalThis.clearTimeout.bind(globalThis),
    },
  });
  Object.defineProperty(globalThis, "Worker", { configurable: true, value: FakeWorker });

  try {
    const controller = new AbortController();
    const pending = inspectPdfInWorker(new Blob(["not used by the fake worker"]), controller.signal);
    controller.abort();
    await assert.rejects(pending, (cause: unknown) => cause instanceof DOMException && cause.name === "AbortError");
    assert.equal(posted, true);
    assert.equal(terminated, true);
  } finally {
    if (originalWindow) Object.defineProperty(globalThis, "window", originalWindow);
    else Reflect.deleteProperty(globalThis, "window");
    if (originalWorker) Object.defineProperty(globalThis, "Worker", originalWorker);
    else Reflect.deleteProperty(globalThis, "Worker");
  }
});
