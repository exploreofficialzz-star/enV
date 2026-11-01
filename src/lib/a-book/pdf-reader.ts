import { zipSync } from "fflate";
import type { ABookPdfInput } from "./pdf.ts";

export const A_BOOK_PDF_TEXT_LIMITS = Object.freeze({
  maxSingleBytes: 200 * 1024 * 1024,
  maxBatchBytes: 300 * 1024 * 1024,
  maxBatchFiles: 25,
  maxPagesPerPdf: 250,
  maxTextCharactersPerPdf: 150_000,
  maxTotalPagesPerBatch: 5_000,
});

export type ABookPdfTextResult = {
  pageCount: number;
  pagesProcessed: number;
  text: string;
  truncated: boolean;
};

export type ABookPdfTextProgress = (page: number, totalPages: number) => void;

type PdfReaderOptions = {
  signal?: AbortSignal;
  onProgress?: ABookPdfTextProgress;
};

let pdfjsPromise: Promise<typeof import("pdfjs-dist")> | null = null;

async function loadPdfJs(): Promise<typeof import("pdfjs-dist")> {
  if (!pdfjsPromise) {
    pdfjsPromise = (async () => {
      const pdfjs = await import("pdfjs-dist");
      if (typeof window !== "undefined") {
        if (typeof Worker === "undefined") {
          throw new Error("This browser does not support isolated local PDF reading. Enable Web Workers or use a supported browser.");
        }
        const workerAsset = await import("pdfjs-dist/build/pdf.worker.min.mjs?url");
        pdfjs.GlobalWorkerOptions.workerSrc = workerAsset.default;
      }
      return pdfjs;
    })().catch((error) => {
      pdfjsPromise = null;
      throw error;
    });
  }
  return pdfjsPromise;
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw new DOMException("PDF text extraction was cancelled.", "AbortError");
}

function sanitizeTextFileName(value: string): string {
  const withoutExtension = value.replace(/\.pdf$/i, "");
  const safe = withoutExtension.replace(/[^A-Za-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 90);
  return safe || "document";
}

function uniqueTextFileName(base: string, used: Map<string, string>): string {
  let candidate = `${base}.txt`;
  const existing = used.get(candidate.toLowerCase());
  if (!existing) {
    used.set(candidate.toLowerCase(), candidate);
    return candidate;
  }
  const existingDot = existing.lastIndexOf(".");
  const canonicalStem = existingDot > 0 ? existing.slice(0, existingDot) : existing;
  let suffix = 2;
  candidate = `${canonicalStem}-${suffix++}.txt`;
  while (used.has(candidate.toLowerCase())) candidate = `${canonicalStem}-${suffix++}.txt`;
  used.set(candidate.toLowerCase(), candidate);
  return candidate;
}

function textFromItems(items: unknown[]): string {
  const chunks: string[] = [];
  for (const raw of items) {
    if (!raw || typeof raw !== "object" || !("str" in raw)) continue;
    const item = raw as { str?: unknown; hasEOL?: unknown };
    if (typeof item.str !== "string" || !item.str) continue;
    chunks.push(item.str);
    chunks.push(item.hasEOL === true ? "\n" : " ");
  }
  return chunks.join("").replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
}

/**
 * Extracts embedded/selectable text from a local PDF.
 * PDF.js parses the file using its bundled same-origin worker. Scanned image-only
 * pages are intentionally returned as empty text; OCR is a separate on-device task.
 */
export async function extractPdfTextLocally(
  blob: Blob,
  { signal, onProgress }: PdfReaderOptions = {},
): Promise<ABookPdfTextResult> {
  if (blob.size < 1) throw new Error("The selected PDF is empty.");
  if (blob.size > A_BOOK_PDF_TEXT_LIMITS.maxSingleBytes) {
    throw new Error("This PDF exceeds the 200 MB local text-extraction limit.");
  }
  throwIfAborted(signal);

  const pdfjs = await loadPdfJs();
  throwIfAborted(signal);
  const bytes = new Uint8Array(await blob.arrayBuffer());
  throwIfAborted(signal);

  const loadingTask = pdfjs.getDocument({
    data: bytes,
    isEvalSupported: false,
    useSystemFonts: true,
    enableXfa: false,
    verbosity: 0,
  });
  let destroyed = false;
  const destroy = async () => {
    if (destroyed) return;
    destroyed = true;
    try { await loadingTask.destroy(); } catch { /* Abort or completed reader cleanup. */ }
  };
  const abort = () => { void destroy(); };
  signal?.addEventListener("abort", abort, { once: true });

  try {
    const document = await loadingTask.promise;
    throwIfAborted(signal);
    const pageCount = document.numPages;
    if (!Number.isSafeInteger(pageCount) || pageCount < 1) {
      throw new Error("This PDF has no readable pages.");
    }
    const pagesToRead = Math.min(pageCount, A_BOOK_PDF_TEXT_LIMITS.maxPagesPerPdf);
    const output: string[] = [];
    let characterCount = 0;
    let pagesProcessed = 0;
    let truncated = pageCount > pagesToRead;

    for (let pageNumber = 1; pageNumber <= pagesToRead; pageNumber += 1) {
      throwIfAborted(signal);
      const page = await document.getPage(pageNumber);
      try {
        const content = await page.getTextContent();
        throwIfAborted(signal);
        const pageText = textFromItems(content.items as unknown[]);
        const prefix = `[Page ${pageNumber}]\n`;
        const remaining = A_BOOK_PDF_TEXT_LIMITS.maxTextCharactersPerPdf - characterCount;
        if (remaining <= prefix.length) {
          truncated = true;
          break;
        }
        const pageOutput = prefix + pageText.slice(0, remaining - prefix.length);
        output.push(pageOutput);
        characterCount += pageOutput.length + 2;
        pagesProcessed = pageNumber;
        if (pageText.length > pageOutput.length - prefix.length
          || characterCount >= A_BOOK_PDF_TEXT_LIMITS.maxTextCharactersPerPdf) {
          truncated = true;
          break;
        }
      } finally {
        page.cleanup();
      }
      onProgress?.(pageNumber, pagesToRead);
    }

    return {
      pageCount,
      pagesProcessed,
      text: output.join("\n\n").slice(0, A_BOOK_PDF_TEXT_LIMITS.maxTextCharactersPerPdf),
      truncated,
    };
  } catch (error) {
    if (signal?.aborted) throw new DOMException("PDF text extraction was cancelled.", "AbortError");
    throw error instanceof Error ? error : new Error("The PDF could not be read locally.");
  } finally {
    signal?.removeEventListener("abort", abort);
    await destroy();
  }
}

/** Extracts text from several local PDFs sequentially into one portable ZIP. */
export async function extractSelectedPdfTextLocally(
  files: ABookPdfInput[],
  { signal, onProgress }: PdfReaderOptions = {},
): Promise<Uint8Array> {
  if (!Array.isArray(files) || files.length < 1) {
    throw new Error("Choose at least one PDF for text extraction.");
  }
  if (files.length > A_BOOK_PDF_TEXT_LIMITS.maxBatchFiles) {
    throw new Error(`Select up to ${A_BOOK_PDF_TEXT_LIMITS.maxBatchFiles} PDFs for one text-extraction batch.`);
  }
  const totalBytes = files.reduce((sum, file) => sum + file.blob.size, 0);
  if (totalBytes > A_BOOK_PDF_TEXT_LIMITS.maxBatchBytes) {
    throw new Error("The selected PDFs exceed the 300 MB local batch limit.");
  }

  const output: Record<string, Uint8Array> = {};
  const used = new Map<string, string>();
  let totalPages = 0;

  for (let index = 0; index < files.length; index += 1) {
    throwIfAborted(signal);
    const file = files[index];
    const result = await extractPdfTextLocally(file.blob, {
      signal,
      onProgress: (page, total) => onProgress?.(page, total),
    });
    totalPages += result.pagesProcessed;
    if (totalPages > A_BOOK_PDF_TEXT_LIMITS.maxTotalPagesPerBatch) {
      throw new Error("The selected PDFs exceed the 5,000-page local text-extraction batch limit.");
    }
    const filename = uniqueTextFileName(sanitizeTextFileName(file.name), used);
    const notes = result.truncated
      ? `\n\n[Text extraction was bounded. Read ${result.pagesProcessed} of ${result.pageCount} pages or ${A_BOOK_PDF_TEXT_LIMITS.maxTextCharactersPerPdf.toLocaleString()} characters.]\n`
      : "";
    output[filename] = new TextEncoder().encode(result.text + notes);
  }

  return zipSync(output, { level: 6 });
}
