export const A_BOOK_PDF_VIEWER_LIMITS = Object.freeze({
  maxBackingPixels: 12_000_000,
  maxDimension: 8_192,
  maxPixelRatio: 2,
  maxBackingScale: 2,
});

/** Computes a safe high-DPI canvas scale without exceeding browser canvas limits. */
export function computeABookPdfBackingScale(
  pageWidth: number,
  pageHeight: number,
  desiredScale: number,
  pixelRatio: number,
): number {
  if (![pageWidth, pageHeight, desiredScale, pixelRatio].every(Number.isFinite)
    || pageWidth <= 0 || pageHeight <= 0 || desiredScale <= 0 || pixelRatio <= 0) {
    throw new Error("This PDF page has invalid dimensions or render scale.");
  }

  const maxBackingScale = Math.min(
    Math.sqrt(A_BOOK_PDF_VIEWER_LIMITS.maxBackingPixels / (pageWidth * pageHeight)),
    A_BOOK_PDF_VIEWER_LIMITS.maxDimension / Math.max(pageWidth, pageHeight),
  );
  const backingScale = Math.min(
    desiredScale * Math.min(Math.max(pixelRatio, 1), A_BOOK_PDF_VIEWER_LIMITS.maxPixelRatio),
    maxBackingScale,
    A_BOOK_PDF_VIEWER_LIMITS.maxBackingScale,
  );
  if (!Number.isFinite(backingScale) || backingScale <= 0) {
    throw new Error("This PDF page is too large to render safely on this device.");
  }
  return backingScale;
}
