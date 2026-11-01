import { PDFDocument, degrees } from "pdf-lib";

export type ABookPdfInfo = {
  pageCount: number;
  title: string;
  author: string;
  subject: string;
  encrypted: false;
};

async function openPdf(file: Blob): Promise<PDFDocument> {
  if (file.size <= 0) throw new Error("The selected PDF is empty.");
  try {
    return await PDFDocument.load(await file.arrayBuffer(), { ignoreEncryption: false, updateMetadata: false });
  } catch (error) {
    const reason = error instanceof Error ? error.message : "Unknown PDF error";
    throw new Error(`This PDF could not be opened locally. It may be damaged, encrypted or unsupported. ${reason}`);
  }
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

export async function extractPdfPages(file: Blob, requestedPages: number[]): Promise<Uint8Array> {
  const source = await openPdf(file);
  const pageCount = source.getPageCount();
  const pages = [...new Set(requestedPages)];
  if (!pages.length || pages.some((page) => !Number.isInteger(page) || page < 1 || page > pageCount)) {
    throw new Error(`Choose page numbers from 1 to ${pageCount}.`);
  }
  const output = await PDFDocument.create();
  const copied = await output.copyPages(source, pages.map((page) => page - 1));
  copied.forEach((page) => output.addPage(page));
  return output.save({ useObjectStreams: true });
}

export async function mergePdfs(files: Blob[]): Promise<Uint8Array> {
  if (files.length < 2) throw new Error("Choose at least two PDF files to merge.");
  const output = await PDFDocument.create();
  for (const file of files) {
    const source = await openPdf(file);
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
