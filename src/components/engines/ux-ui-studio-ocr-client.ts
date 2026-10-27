import type { ReconstructionTextLine } from "@/lib/engines/ux-ui-studio-reconstruct";

export interface ScreenshotOcrPage {
  blocks?: Array<{ paragraphs?: Array<{ lines?: ReconstructionTextLine[] }> }> | null;
  confidence: number;
  text: string;
  pages?: ScreenshotOcrPage[];
}

/**
 * The pinned Tesseract.js 7 worker's actual job protocol. Owning the native Worker
 * lets cancellation terminate it even while its WASM/model bootstrap is pending;
 * createWorker() does not expose its worker until that bootstrap has completed.
 */
export async function recognizeScreenshotLocally(
  image: Uint8Array | Uint8Array[],
  { signal, onProgress, pageSegmentationMode = "11" }: { signal?: AbortSignal; onProgress?: (status: string, progress: number) => void; pageSegmentationMode?: "7" | "11" } = {},
): Promise<ScreenshotOcrPage> {
  if (signal?.aborted) throw new DOMException("Screenshot reconstruction canceled.", "AbortError");
  const images = Array.isArray(image) ? image : [image];
  if (!images.length || images.length > 8) throw new Error("Screenshot recognition requires one to eight bounded image passes.");
  const worker = new Worker(new URL("/uxui/ocr/worker.min.js", location.origin));
  const workerId = "env-studio-ocr-" + crypto.randomUUID();
  const pending = new Map<string, { resolve: (value: unknown) => void; reject: (error: Error) => void }>();
  let sequence = 0, closed = false, recognitionIndex = 0;
  function close(error?: Error): void {
    if (closed) return;
    closed = true; worker.terminate();
    for (const job of pending.values()) job.reject(error || new Error("Screenshot recognition stopped."));
    pending.clear();
  }
  const abort = () => close(new DOMException("Screenshot reconstruction canceled.", "AbortError"));
  signal?.addEventListener("abort", abort, { once: true });
  const timeout = window.setTimeout(() => close(new Error("Text recognition took too long. Crop the screenshot or use a smaller image and try again.")), 90_000);
  worker.onerror = event => { event.preventDefault(); close(new Error("The local text recognizer could not start. Reload the page and try again.")); };
  worker.onmessage = ({ data }: MessageEvent) => {
    if (closed || !data || typeof data !== "object") return;
    if (data.status === "progress") {
      const update = data.data;
      if (update && typeof update.status === "string") {
        const progress = Math.max(0, Math.min(1, Number(update.progress) || 0));
        onProgress?.(update.status, update.status.includes("recognizing") ? (recognitionIndex + progress) / images.length : progress);
      }
      return;
    }
    const job = pending.get(data.jobId);
    if (!job) return;
    pending.delete(data.jobId);
    if (data.status === "resolve") job.resolve(data.data);
    else job.reject(new Error(typeof data.data === "string" ? data.data : "Text recognition failed. Try a clearer screenshot."));
  };
  function job<T>(action: string, payload: Record<string, unknown>): Promise<T> {
    if (closed || signal?.aborted) return Promise.reject(new DOMException("Screenshot reconstruction canceled.", "AbortError"));
    const jobId = workerId + "-" + ++sequence;
    return new Promise<T>((resolve, reject) => {
      pending.set(jobId, { resolve: value => resolve(value as T), reject });
      try { worker.postMessage({ workerId, jobId, action, payload }); }
      catch (error) { pending.delete(jobId); reject(error); }
    });
  }
  try {
    await job("load", { options: { lstmOnly: true, corePath: new URL("/uxui/ocr/core", location.origin).href, logging: false } });
    await job("loadLanguage", { langs: "eng", options: { langPath: new URL("/uxui/ocr/lang", location.origin).href, cacheMethod: "none", gzip: true, lstmOnly: true } });
    await job("initialize", { langs: "eng", oem: 1, config: { load_system_dawg: "0", load_freq_dawg: "0" } });
    await job("setParameters", { params: { tessedit_pageseg_mode: pageSegmentationMode, preserve_interword_spaces: "1", user_defined_dpi: "150" } });
    const pages: ScreenshotOcrPage[] = [];
    for (let index = 0; index < images.length; index++) {
      recognitionIndex = index;
      pages.push(await job<ScreenshotOcrPage>("recognize", { image: images[index], options: {}, output: { text: true, blocks: true } }));
    }
    return { blocks: pages.flatMap(page => page.blocks || []), confidence: pages.reduce((sum, page) => sum + page.confidence, 0) / pages.length, text: pages.map(page => page.text).join("\n"), pages };
  } finally {
    window.clearTimeout(timeout); signal?.removeEventListener("abort", abort); close();
  }
}
