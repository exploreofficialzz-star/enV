import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { computeABookPdfBackingScale } from "@/lib/a-book/pdf-viewer-utils";

type PdfViewport = { width: number; height: number };
type PdfPageProxy = {
  getViewport(options: { scale: number }): PdfViewport;
  render(options: { canvasContext: CanvasRenderingContext2D; viewport: PdfViewport }): {
    promise: Promise<void>;
    cancel(): void;
  };
  getTextContent(): Promise<{ items: unknown[] }>;
  cleanup(): void;
};
type PdfDocumentProxy = {
  numPages: number;
  getPage(pageNumber: number): Promise<PdfPageProxy>;
  destroy(): Promise<void>;
};
type PdfLoadingTask = {
  promise: Promise<PdfDocumentProxy>;
  destroy(): Promise<void>;
};

function extractPageText(items: unknown[]): string {
  const lines: string[] = [];
  for (const value of items) {
    if (!value || typeof value !== "object" || !("str" in value)) continue;
    const item = value as { str?: unknown; hasEOL?: unknown };
    if (typeof item.str !== "string" || !item.str) continue;
    lines.push(item.str + (item.hasEOL === true ? "\n" : " "));
  }
  return lines.join("").replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
}

export function ABookPdfViewer({ src, fileName }: { src: string; fileName: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const documentRef = useRef<PdfDocumentProxy | null>(null);
  const [pageCount, setPageCount] = useState(0);
  const [pageNumber, setPageNumber] = useState(1);
  const [zoom, setZoom] = useState(1);
  const [containerWidth, setContainerWidth] = useState(720);
  const [pageText, setPageText] = useState("");
  const [loading, setLoading] = useState(true);
  const [rendering, setRendering] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const element = viewportRef.current;
    if (!element || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver((entries) => {
      const width = entries[0]?.contentRect.width;
      if (typeof width === "number" && width > 0) setContainerWidth(width);
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    let cancelled = false;
    let loadTimedOut = false;
    let loadingTask: PdfLoadingTask | null = null;
    const timeout = window.setTimeout(() => {
      if (cancelled) return;
      loadTimedOut = true;
      setError("Local PDF viewing exceeded the two-minute safety limit. Reopen the PDF to try again.");
      setLoading(false);
      void loadingTask?.destroy();
    }, 120_000);
    documentRef.current = null;
    setLoading(true);
    setRendering(false);
    setError("");
    setPageText("");
    setPageCount(0);
    setPageNumber(1);

    void (async () => {
      try {
        if (typeof Worker === "undefined") {
          throw new Error("This browser does not support isolated local PDF viewing. Enable Web Workers or use a supported browser.");
        }
        const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
        const workerAsset = await import("pdfjs-dist/legacy/build/pdf.worker.mjs?url");
        pdfjs.GlobalWorkerOptions.workerSrc = workerAsset.default;
        if (cancelled || loadTimedOut) return;
        loadingTask = pdfjs.getDocument({
          url: src,
          useSystemFonts: true,
          enableXfa: false,
          verbosity: 0,
        }) as unknown as PdfLoadingTask;
        const document = await loadingTask.promise;
        if (cancelled) { await document.destroy(); return; }
        if (!Number.isSafeInteger(document.numPages) || document.numPages < 1) {
          throw new Error("This PDF has no readable pages.");
        }
        documentRef.current = document;
        setPageCount(document.numPages);
        setLoading(false);
        setError("");
      } catch (cause) {
        if (!cancelled) {
          setError(loadTimedOut
            ? "Local PDF viewing exceeded the two-minute safety limit. Reopen the PDF to try again."
            : cause instanceof Error ? cause.message : "This PDF could not be opened locally.");
          setLoading(false);
        }
      } finally {
        window.clearTimeout(timeout);
      }
    })();

    return () => {
      cancelled = true;
      window.clearTimeout(timeout);
      const document = documentRef.current;
      documentRef.current = null;
      if (document) void document.destroy();
      else if (loadingTask) void loadingTask.destroy();
    };
  }, [src]);

  useEffect(() => {
    const document = documentRef.current;
    const canvas = canvasRef.current;
    if (!document || !canvas || pageCount < 1 || pageNumber < 1 || pageNumber > pageCount) return;

    let cancelled = false;
    let page: PdfPageProxy | null = null;
    let renderTask: { promise: Promise<void>; cancel(): void } | null = null;
    let renderTimeout: number | undefined;
    let renderTimedOut = false;
    setRendering(true);
    setError("");
    setPageText("");

    void (async () => {
      try {
        page = await document.getPage(pageNumber);
        if (cancelled) return;
        const base = page.getViewport({ scale: 1 });
        if (!Number.isFinite(base.width) || !Number.isFinite(base.height) || base.width <= 0 || base.height <= 0) {
          throw new Error("This PDF page has invalid dimensions.");
        }
        const fitScale = Math.min(1, Math.max(0.2, (containerWidth - 24) / base.width));
        const desiredScale = Math.min(2.5, Math.max(0.35, fitScale * zoom));
        const pixelRatio = Math.min(Math.max(window.devicePixelRatio || 1, 1), 2);
        // Bound each backing canvas to ~48 MB and 8,192 pixels on either edge.
        const backingScale = computeABookPdfBackingScale(
          base.width,
          base.height,
          desiredScale,
          pixelRatio,
        );
        const scale = backingScale / pixelRatio;
        const cssViewport = page.getViewport({ scale });
        const renderViewport = page.getViewport({ scale: backingScale });
        const context = canvas.getContext("2d", { alpha: false });
        if (!context) throw new Error("This browser could not create a local PDF canvas.");
        canvas.width = Math.ceil(renderViewport.width);
        canvas.height = Math.ceil(renderViewport.height);
        canvas.style.width = Math.ceil(cssViewport.width) + "px";
        canvas.style.height = Math.ceil(cssViewport.height) + "px";
        context.fillStyle = "#ffffff";
        context.fillRect(0, 0, canvas.width, canvas.height);

        const contentPromise = page.getTextContent();
        renderTask = page.render({ canvasContext: context, viewport: renderViewport });
        renderTimeout = window.setTimeout(() => {
          if (cancelled) return;
          renderTimedOut = true;
          renderTask?.cancel();
          void document.destroy();
          documentRef.current = null;
          setPageCount(0);
        }, 45_000);
        const [content] = await Promise.all([contentPromise, renderTask.promise]);
        if (!cancelled) setPageText(extractPageText(content.items));
      } catch (cause) {
        if (!cancelled) {
          setError(renderTimedOut
            ? "Local PDF page rendering exceeded the 45-second safety limit. Reopen the PDF to try again."
            : cause instanceof Error ? cause.message : "This PDF page could not be rendered locally.");
        }
      } finally {
        if (renderTimeout !== undefined) window.clearTimeout(renderTimeout);
        page?.cleanup();
        if (!cancelled) setRendering(false);
      }
    })();

    return () => {
      cancelled = true;
      if (renderTimeout !== undefined) window.clearTimeout(renderTimeout);
      renderTask?.cancel();
      page?.cleanup();
    };
  }, [pageCount, pageNumber, zoom, containerWidth, src]);

  return (
    <section className="space-y-3 rounded-lg border border-border bg-surface p-3" aria-label="Local PDF reader">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-xs font-semibold">{fileName}</p>
          <p className="text-[11px] text-muted" role="status">
            {loading ? "Opening PDF locally…" : rendering ? "Rendering page locally…" : pageCount ? "Page " + pageNumber + " of " + pageCount : "PDF viewer"}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-1">
          <Button size="sm" variant="outline" disabled={loading || pageNumber <= 1} onClick={() => setPageNumber((value) => Math.max(1, value - 1))}>Previous</Button>
          <Button size="sm" variant="outline" disabled={loading || pageNumber >= pageCount} onClick={() => setPageNumber((value) => Math.min(pageCount, value + 1))}>Next</Button>
          <Button size="sm" variant="outline" disabled={loading || zoom <= 0.5} onClick={() => setZoom((value) => Math.max(0.5, Number((value - 0.25).toFixed(2))))} aria-label="Zoom out">−</Button>
          <span className="min-w-10 text-center text-xs text-muted">{Math.round(zoom * 100)}%</span>
          <Button size="sm" variant="outline" disabled={loading || zoom >= 2} onClick={() => setZoom((value) => Math.min(2, Number((value + 0.25).toFixed(2))))} aria-label="Zoom in">+</Button>
        </div>
      </div>
      {error ? <p role="alert" className="rounded-md border border-red-500/30 bg-red-500/5 p-2 text-xs text-red-700 dark:text-red-300">{error}</p> : null}
      <div ref={viewportRef} className="max-h-[640px] overflow-auto rounded-md bg-surface-2 p-3">
        <div className="flex min-w-0 justify-center">
          <canvas ref={canvasRef} aria-label={fileName + " page " + pageNumber} className="block max-w-none bg-white shadow-sm" />
        </div>
        {loading ? <p className="py-16 text-center text-xs text-muted">Loading local PDF…</p> : null}
        {!loading && pageCount === 0 && !error ? <p className="py-16 text-center text-xs text-muted">No pages available.</p> : null}
      </div>
      {pageText ? <details className="rounded-md border border-border p-2">
        <summary className="cursor-pointer text-xs font-semibold">Selectable text on this page</summary>
        <pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap break-words text-xs leading-relaxed">{pageText}</pre>
      </details> : null}
      <p className="text-[11px] text-muted">PDF pages are rendered on this device. Scanned image-only pages need local OCR for searchable text.</p>
    </section>
  );
}
