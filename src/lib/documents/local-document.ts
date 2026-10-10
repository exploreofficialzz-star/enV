import { unzipSync, zipSync, strFromU8, strToU8 } from "fflate";
import { PDFDocument, degrees } from "pdf-lib";

export type LocalDocumentResult = { blob: Blob; name: string; preview?: string };

const asArrayBuffer = (value: Uint8Array): ArrayBuffer => value.buffer.slice(value.byteOffset, value.byteOffset + value.byteLength) as ArrayBuffer;
const esc = (value: string) => value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");

export function docxToText(bytes: Uint8Array): string {
  const files = unzipSync(bytes);
  const document = files["word/document.xml"];
  if (!document) throw new Error("This DOCX file does not contain a Word document body.");
  return strFromU8(document).replace(/<w:tab\s*\/?>/g, "\t").replace(/<w:br\s*\/?>/g, "\n").replace(/<\/w:p>/g, "\n").replace(/<w:t[^>]*>([\s\S]*?)<\/w:t>/g, "$1").replace(/<[^>]+>/g, "").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/\n{3,}/g, "\n\n").trim() + "\n";
}

export function textToDocx(text: string): Uint8Array {
  const paragraphs = text.split(/\r?\n/).map(line => `<w:p><w:r><w:t xml:space="preserve">${esc(line)}</w:t></w:r></w:p>`).join("");
  const document = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${paragraphs}<w:sectPr><w:pgSz w:w="12240" w:h="15840"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440"/></w:sectPr></w:body></w:document>`;
  const contentTypes = `<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>`;
  const rels = `<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`;
  return zipSync({"[Content_Types].xml": strToU8(contentTypes), "_rels/.rels": strToU8(rels), "word/document.xml": strToU8(document)});
}

export async function runLocalDocument(op: string, files: File[]): Promise<LocalDocumentResult> {
  if (!files.length) throw new Error("Choose a document first.");
  const first = new Uint8Array(await files[0].arrayBuffer());
  if (op === "docx-text-extractor") { const text = docxToText(first); return { blob: new Blob([text], { type: "text/plain" }), name: files[0].name.replace(/\.docx$/i, ".txt"), preview: text }; }
  if (op === "text-to-docx" || op === "txt-to-docx" || op === "markdown-to-docx") { const text = new TextDecoder().decode(first); return { blob: new Blob([asArrayBuffer(textToDocx(text))], { type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" }), name: files[0].name.replace(/\.[^.]+$/, ".docx") }; }
  const pdf = await PDFDocument.load(first, { ignoreEncryption: false });
  if (op === "pdf-metadata-viewer" || op === "pdf-metadata-tool") { const preview = JSON.stringify({ pages: pdf.getPageCount(), title: pdf.getTitle() ?? "", author: pdf.getAuthor() ?? "", subject: pdf.getSubject() ?? "", creator: pdf.getCreator() ?? "" }, null, 2); return { blob: new Blob([preview], { type: "application/json" }), name: files[0].name.replace(/\.pdf$/i, ".json"), preview }; }
  if (op === "pdf-page-extractor" || op === "pdf-splitter") { const out = await PDFDocument.create(); const pages = pdf.getPages(); const selected = pages.slice(0, Math.min(10, pages.length)); const copied = await out.copyPages(pdf, selected.map((_, i) => i)); copied.forEach(page => out.addPage(page)); return { blob: new Blob([asArrayBuffer(await out.save())], { type: "application/pdf" }), name: files[0].name.replace(/\.pdf$/i, "-pages.pdf") }; }
  if (op === "pdf-rotator") { pdf.getPages().forEach(page => page.setRotation(degrees((page.getRotation().angle + 90) % 360))); return { blob: new Blob([asArrayBuffer(await pdf.save())], { type: "application/pdf" }), name: files[0].name.replace(/\.pdf$/i, "-rotated.pdf") }; }
  if (op === "pdf-merger") { const out = await PDFDocument.create(); for (const file of files) { const doc = await PDFDocument.load(new Uint8Array(await file.arrayBuffer())); const copied = await out.copyPages(doc, doc.getPageIndices()); copied.forEach(page => out.addPage(page)); } return { blob: new Blob([asArrayBuffer(await out.save())], { type: "application/pdf" }), name: "merged.pdf" }; }
  throw new Error("This document operation is not available offline yet.");
}
