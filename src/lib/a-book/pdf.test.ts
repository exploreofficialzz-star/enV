import assert from "node:assert/strict";
import { computeABookPdfBackingScale, A_BOOK_PDF_VIEWER_LIMITS } from "./pdf-viewer-utils.ts";
import { extractPdfTextLocally, extractSelectedPdfTextLocally } from "./pdf-reader.ts";
import { extractPdfPagesInWorker, extractSelectedPdfsInWorker, inspectPdfInWorker, mergePdfsInWorker, rotateSelectedPdfsInWorker, splitPdfIntoZipInWorker, splitSelectedPdfsIntoZipInWorker } from "./pdf-worker-client.ts";
import test from "node:test";
import { PDFDocument, StandardFonts } from "pdf-lib";
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

function pdfBlob(bytes: Uint8Array): Blob {
  const owned = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
  return new Blob([owned], { type: "application/pdf" });
}

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


test("A book rejects browser PDF work when Web Workers are unavailable", async () => {
  const originalWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
  const originalWorker = Object.getOwnPropertyDescriptor(globalThis, "Worker");
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: {
      setTimeout: globalThis.setTimeout.bind(globalThis),
      clearTimeout: globalThis.clearTimeout.bind(globalThis),
    },
  });
  Reflect.deleteProperty(globalThis, "Worker");
  try {
    await assert.rejects(
      inspectPdfInWorker(new Blob(["not used"])),
      /does not support isolated local PDF processing/,
    );
  } finally {
    if (originalWindow) Object.defineProperty(globalThis, "window", originalWindow);
    else Reflect.deleteProperty(globalThis, "window");
    if (originalWorker) Object.defineProperty(globalThis, "Worker", originalWorker);
    else Reflect.deleteProperty(globalThis, "Worker");
  }
});


test("extracts embedded PDF text locally and reports page-level progress", async () => {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  for (const line of ["A book local PDF text", "Second page searchable phrase"]) {
    const page = pdf.addPage([320, 420]);
    page.drawText(line, { x: 32, y: 350, size: 16, font });
  }
  const bytes = await pdf.save();
  const progress: Array<[number, number]> = [];
  const result = await extractPdfTextLocally(pdfBlob(bytes), {
    onProgress: (page, total) => progress.push([page, total]),
  });
  assert.equal(result.pageCount, 2);
  assert.equal(result.pagesProcessed, 2);
  assert.equal(result.truncated, false);
  assert.match(result.text, /A book local PDF text/);
  assert.match(result.text, /Second page searchable phrase/);
  assert.deepEqual(progress, [[1, 2], [2, 2]]);
});

test("image-only and blank PDF pages return no selectable text", async () => {
  const result = await extractPdfTextLocally(await samplePdf(2));
  assert.equal(result.pageCount, 2);
  assert.equal(result.pagesProcessed, 2);
  assert.equal(result.text, "");
  assert.equal(result.truncated, false);
});

test("extracts several PDFs into distinct local searchable text files", async () => {
  const { unzipSync } = await import("fflate");
  const first = await PDFDocument.create();
  const firstFont = await first.embedFont(StandardFonts.Helvetica);
  first.addPage([300, 400]).drawText("Research alpha note", { x: 24, y: 340, font: firstFont });
  const second = await PDFDocument.create();
  const secondFont = await second.embedFont(StandardFonts.Helvetica);
  second.addPage([300, 400]).drawText("Research beta note", { x: 24, y: 340, font: secondFont });
  const archive = await extractSelectedPdfTextLocally([
    { name: "Research.pdf", blob: pdfBlob(await first.save()) },
    { name: "research.PDF", blob: pdfBlob(await second.save()) },
  ]);
  const entries = unzipSync(archive);
  assert.deepEqual(Object.keys(entries).sort(), ["Research-2.txt", "Research.txt"]);
  assert.match(new TextDecoder().decode(entries["Research.txt"]), /Research alpha note/);
  assert.match(new TextDecoder().decode(entries["Research-2.txt"]), /Research beta note/);
});

test("batch PDF text extraction validates selection and file limits before processing", async () => {
  await assert.rejects(() => extractSelectedPdfTextLocally([]), /Choose at least one PDF/);
  await assert.rejects(
    () => extractSelectedPdfTextLocally(Array.from({ length: 26 }, (_, index) => ({
      name: `file-${index}.pdf`,
      blob: new Blob(["pdf"]),
    }))),
    /Select up to 25 PDFs/,
  );
  await assert.rejects(
    () => extractPdfTextLocally(new Blob([])),
    /selected PDF is empty/,
  );
});


test("PDF viewer canvas scaling enforces pixel and dimension budgets", () => {
  const regular = computeABookPdfBackingScale(612, 792, 1.5, 2);
  assert.equal(regular, 2);

  const oversizedWide = computeABookPdfBackingScale(50_000, 1_000, 2, 2);
  assert.ok(50_000 * oversizedWide <= A_BOOK_PDF_VIEWER_LIMITS.maxDimension);
  assert.ok(1_000 * oversizedWide <= A_BOOK_PDF_VIEWER_LIMITS.maxDimension);
  assert.ok(50_000 * 1_000 * oversizedWide * oversizedWide <= A_BOOK_PDF_VIEWER_LIMITS.maxBackingPixels);

  const largeSquare = computeABookPdfBackingScale(4_000, 4_000, 2, 2);
  assert.ok(4_000 * largeSquare <= A_BOOK_PDF_VIEWER_LIMITS.maxDimension);
  assert.ok(16_000_000 * largeSquare * largeSquare <= A_BOOK_PDF_VIEWER_LIMITS.maxBackingPixels);

  assert.throws(() => computeABookPdfBackingScale(0, 400, 1, 1), /invalid dimensions/);
  assert.throws(() => computeABookPdfBackingScale(400, 400, Number.NaN, 1), /invalid dimensions/);
});
