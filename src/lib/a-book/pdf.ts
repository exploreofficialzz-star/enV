import { PDFDocument, degrees } from "pdf-lib";
import { zipSync } from "fflate";

export type ABookPdfInfo = {
  pageCount: number;
  title: string;
  author: string;
  subject: string;
  encrypted: false;
};

export type ABookPdfInput = { name: string; blob: Blob };

const MAX_SINGLE_PDF_BYTES = 200 * 1024 * 1024;
const MAX_BATCH_PDF_BYTES = 300 * 1024 * 1024;
const MAX_BATCH_FILES = 25;
const MAX_TOTAL_PAGES = 5000;

function assertPdfInput(file: Blob): void {
  if (file.size <= 0) throw new Error("The selected PDF is empty.");
  if (file.size > MAX_SINGLE_PDF_BYTES) {
    throw new Error("This PDF is larger than the 200 MB local processing limit. Split it into smaller files first.");
  }
}

async function openPdf(file: Blob): Promise<PDFDocument> {
  assertPdfInput(file);
  try {
    return await PDFDocument.load(await file.arrayBuffer(), { ignoreEncryption: false, updateMetadata: false });
  } catch (error) {
    const reason = error instanceof Error ? error.message : "Unknown PDF error";
    throw new Error(`This PDF could not be opened locally. It may be damaged, encrypted or unsupported. ${reason}`);
  }
}

function safeArchiveName(value: string): string {
  const name = value.replace(/\.pdf$/i, "").trim().replace(/[^a-z0-9._-]+/gi, "-").replace(/^-+|-+$/g, "");
  return name.slice(0, 100).toLowerCase() || "document";
}

function assertBatch(files: ABookPdfInput[]): void {
  if (files.length < 1) throw new Error("Choose at least one PDF.");
  if (files.length > MAX_BATCH_FILES) throw new Error(`Process up to ${MAX_BATCH_FILES} PDFs in one batch.`);
  const total = files.reduce((sum, file) => sum + file.blob.size, 0);
  if (total > MAX_BATCH_PDF_BYTES) {
    throw new Error("This batch is larger than the 300 MB local processing limit. Process it in smaller batches.");
  }
}

export function parsePageRanges(value: string, pageCount: number): number[] {
  if (!Number.isInteger(pageCount) || pageCount < 1) throw new Error("This PDF has no readable pages.");
  const tokens = value.split(",").map((part) => part.trim()).filter(Boolean);
  if (!tokens.length) throw new Error("Enter page numbers, for example 1-3,5.");
  const pages: number[] = [];
  const seen = new Set<number>();
  for (const token of tokens) {
    const match = token.match(/^(\d+)(?:-(\d+))?$/);
    if (!match) throw new Error(`Invalid page range: ${token}`);
    const first = Number(match[1]);
    const last = Number(match[2] ?? match[1]);
    if (!Number.isSafeInteger(first) || !Number.isSafeInteger(last) || first < 1 || last < first || last > pageCount) {
      throw new Error(`Choose page numbers from 1 to ${pageCount}.`);
    }
    if (last - first + 1 + pages.length > MAX_TOTAL_PAGES) {
      throw new Error(`A maximum of ${MAX_TOTAL_PAGES} pages can be processed in one operation.`);
    }
    for (let page = first; page <= last; page += 1) {
      if (seen.has(page)) throw new Error(`Page ${page} is included more than once.`);
      seen.add(page);
      pages.push(page);
    }
  }
  return pages;
}

function parsePageGroups(value: string, pageCount: number): number[][] {
  const groups = value.split(";").map((part) => part.trim()).filter(Boolean);
  if (groups.length < 2) throw new Error("Enter at least two page groups separated by semicolons, for example 1-3;4-6.");
  if (groups.length > 100) throw new Error("Create up to 100 PDF parts at a time.");
  const used = new Set<number>();
  return groups.map((group) => {
    const pages = parsePageRanges(group, pageCount);
    for (const page of pages) {
      if (used.has(page)) throw new Error(`Page ${page} appears in more than one part.`);
      used.add(page);
    }
    if (used.size > MAX_TOTAL_PAGES) throw new Error(`A maximum of ${MAX_TOTAL_PAGES} pages can be split in one operation.`);
    return pages;
  });
}

export async function inspectPdf(file: Blob): Promise<ABookPdfInfo> {
  const pdf = await openPdf(file);
  return {
    pageCount: pdf.getPageCount(),
    title: pdf.getTitle() || "",
    author: pdf.getAuthor() || "",
    subject: pdf.getSubject() || "",
    encrypted: false,
  };
}

export async function rotatePdf(file: Blob, angle: 90 | 180 | 270): Promise<Uint8Array> {
  const pdf = await openPdf(file);
  for (const page of pdf.getPages()) {
    page.setRotation(degrees((page.getRotation().angle + angle) % 360));
  }
  return pdf.save({ useObjectStreams: true });
}

export async function rotateSelectedPdfs(files: ABookPdfInput[], angle: 90 | 180 | 270): Promise<Uint8Array> {
  assertBatch(files);
  const output: Record<string, Uint8Array> = {};
  const names = new Set<string>();
  let pageCount = 0;
  for (const file of files) {
    const pdf = await openPdf(file.blob);
    pageCount += pdf.getPageCount();
    if (pageCount > MAX_TOTAL_PAGES) throw new Error(`A maximum of ${MAX_TOTAL_PAGES} pages can be processed in one batch.`);
    for (const page of pdf.getPages()) page.setRotation(degrees((page.getRotation().angle + angle) % 360));
    const base = safeArchiveName(file.name);
    let name = `${base}-rotated.pdf`;
    let suffix = 2;
    while (names.has(name.toLowerCase())) name = `${base}-rotated-${suffix++}.pdf`;
    names.add(name.toLowerCase());
    output[name] = await pdf.save({ useObjectStreams: true });
  }
  return zipSync(output, { level: 6 });
}

export async function extractPdfPages(file: Blob, requestedPages: number[]): Promise<Uint8Array> {
  const source = await openPdf(file);
  const pageCount = source.getPageCount();
  const pages = [...new Set(requestedPages)];
  if (!pages.length || pages.some((page) => !Number.isInteger(page) || page < 1 || page > pageCount)) {
    throw new Error(`Choose page numbers from 1 to ${pageCount}.`);
  }
  if (pages.length > MAX_TOTAL_PAGES) throw new Error(`A maximum of ${MAX_TOTAL_PAGES} pages can be extracted at once.`);
  const output = await PDFDocument.create();
  const copied = await output.copyPages(source, pages.map((page) => page - 1));
  copied.forEach((page) => output.addPage(page));
  return output.save({ useObjectStreams: true });
}


/**
 * Extracts the same requested page range from multiple local PDFs into one ZIP.
 * Every source is opened and validated before any output document is constructed.
 */
export async function extractSelectedPdfs(files: ABookPdfInput[], pageRange: string): Promise<Uint8Array> {
  assertBatch(files);
  const prepared: Array<{ name: string; blob: Blob; pages: number[] }> = [];
  let totalPages = 0;

  for (const file of files) {
    const source = await openPdf(file.blob);
    const pages = parsePageRanges(pageRange, source.getPageCount());
    totalPages += pages.length;
    if (totalPages > MAX_TOTAL_PAGES) {
      throw new Error(`A maximum of ${MAX_TOTAL_PAGES} extracted pages can be processed in one batch.`);
    }
    prepared.push({ name: file.name, blob: file.blob, pages });
  }

  const output: Record<string, Uint8Array> = {};
  const names = new Set<string>();
  for (const item of prepared) {
    const source = await openPdf(item.blob);
    const base = safeArchiveName(item.name);
    const filename = uniqueArchiveEntryName(`${base}-extracted.pdf`, names);
    const document = await PDFDocument.create();
    const copied = await document.copyPages(source, item.pages.map((page) => page - 1));
    copied.forEach((page) => document.addPage(page));
    const serialized = await document.save({ useObjectStreams: true });
    if (!(serialized instanceof Uint8Array) || serialized.byteLength === 0) {
      throw new Error(`The extracted PDF for ${item.name} could not be serialized.`);
    }
    // Retain an independently-owned byte range for each ZIP entry.
    output[filename] = serialized.slice();
  }
  return zipSync(output, { level: 6 });
}

/**
 * Splits every selected PDF with the same page-group expression into one ZIP.
 * All PDFs and all page groups are validated before the first output is built.
 */
export async function splitSelectedPdfsIntoZip(files: ABookPdfInput[], pageGroups: string): Promise<Uint8Array> {
  assertBatch(files);
  const prepared: Array<{ name: string; blob: Blob; groups: number[][] }> = [];
  let totalPages = 0;

  for (const file of files) {
    const source = await openPdf(file.blob);
    const groups = parsePageGroups(pageGroups, source.getPageCount());
    totalPages += groups.reduce((sum, pages) => sum + pages.length, 0);
    if (totalPages > MAX_TOTAL_PAGES) {
      throw new Error(`A maximum of ${MAX_TOTAL_PAGES} split pages can be processed in one batch.`);
    }
    prepared.push({ name: file.name, blob: file.blob, groups });
  }

  const output: Record<string, Uint8Array> = {};
  const names = new Set<string>();
  for (const item of prepared) {
    const source = await openPdf(item.blob);
    const base = safeArchiveName(item.name);
    for (let index = 0; index < item.groups.length; index += 1) {
      const pages = item.groups[index];
      const requestedName = `${base}-part-${String(index + 1).padStart(2, "0")}.pdf`;
      const filename = uniqueArchiveEntryName(requestedName, names);
      const part = await PDFDocument.create();
      const copied = await part.copyPages(source, pages.map((page) => page - 1));
      copied.forEach((page) => part.addPage(page));
      output[filename] = await part.save({ useObjectStreams: true });
    }
  }
  return zipSync(output, { level: 6 });
}

function uniqueArchiveEntryName(requestedName: string, used: Set<string>): string {
  const dot = requestedName.lastIndexOf(".");
  const stem = dot > 0 ? requestedName.slice(0, dot) : requestedName;
  const extension = dot > 0 ? requestedName.slice(dot) : "";
  let candidate = requestedName;
  let suffix = 2;
  while (used.has(candidate.toLowerCase())) {
    candidate = `${stem}-${suffix++}${extension}`;
  }
  used.add(candidate.toLowerCase());
  return candidate;
}

export async function splitPdfIntoZip(file: Blob, filename: string, pageGroups: string): Promise<Uint8Array> {
  const source = await openPdf(file);
  const groups = parsePageGroups(pageGroups, source.getPageCount());
  const output: Record<string, Uint8Array> = {};
  const base = safeArchiveName(filename);
  for (let index = 0; index < groups.length; index += 1) {
    const pages = groups[index];
    const part = await PDFDocument.create();
    const copied = await part.copyPages(source, pages.map((page) => page - 1));
    copied.forEach((page) => part.addPage(page));
    output[`${base}-part-${String(index + 1).padStart(2, "0")}.pdf`] = await part.save({ useObjectStreams: true });
  }
  return zipSync(output, { level: 6 });
}

export async function mergePdfs(files: Blob[]): Promise<Uint8Array> {
  if (files.length < 2) throw new Error("Choose at least two PDF files to merge.");
  assertBatch(files.map((blob, index) => ({ name: `file-${index + 1}.pdf`, blob })));
  const output = await PDFDocument.create();
  let pageCount = 0;
  for (const file of files) {
    const source = await openPdf(file);
    pageCount += source.getPageCount();
    if (pageCount > MAX_TOTAL_PAGES) throw new Error(`A maximum of ${MAX_TOTAL_PAGES} pages can be merged at once.`);
    const copied = await output.copyPages(source, source.getPageIndices());
    copied.forEach((page) => output.addPage(page));
  }
  return output.save({ useObjectStreams: true });
}

export function pdfDownload(bytes: Uint8Array, filename: string): void {
  const blob = new Blob([bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer], { type: "application/pdf" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1500);
}

export function zipDownload(bytes: Uint8Array, filename: string): void {
  const blob = new Blob([bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer], { type: "application/zip" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1500);
}

export const A_BOOK_PDF_LIMITS = {
  maxSingleFileBytes: MAX_SINGLE_PDF_BYTES,
  maxBatchBytes: MAX_BATCH_PDF_BYTES,
  maxBatchFiles: MAX_BATCH_FILES,
  maxPagesPerOperation: MAX_TOTAL_PAGES,
} as const;
