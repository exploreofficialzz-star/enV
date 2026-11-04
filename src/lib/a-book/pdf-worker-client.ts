import type { ABookPdfInfo } from "./pdf.ts";
import type { ABookPdfInput } from "./pdf.ts";
import type { ABookPdfWorkerRequest, ABookPdfWorkerResponse, ABookPdfWorkerTask } from "./pdf-worker-types.ts";

let requestSequence = 0;

async function runDirect(task: ABookPdfWorkerTask): Promise<unknown> {
  const pdf = await import("./pdf.ts");
  switch (task.action) {
    case "inspect": return pdf.inspectPdf(task.blob);
    case "extract-one": return pdf.extractPdfPages(task.blob, task.pages);
    case "extract-batch": return pdf.extractSelectedPdfs(task.files, task.pageRange);
    case "split-one": return pdf.splitPdfIntoZip(task.blob, task.filename, task.pageGroups);
    case "split-batch": return pdf.splitSelectedPdfsIntoZip(task.files, task.pageGroups);
    case "rotate-batch": return pdf.rotateSelectedPdfs(task.files, task.angle);
    case "merge": return pdf.mergePdfs(task.files);
    default: throw new Error("Unsupported local PDF operation.");
  }
}

function runInWorker(task: ABookPdfWorkerTask, signal?: AbortSignal): Promise<unknown> {
  if (signal?.aborted) return Promise.reject(new DOMException("PDF processing was cancelled.", "AbortError"));
  // Node/unit-test callers use the same pure local functions directly. A browser
  // without Web Workers must fail closed rather than run heavy PDF work on its UI thread.
  if (typeof window === "undefined") return runDirect(task);
  if (typeof Worker === "undefined") {
    return Promise.reject(new Error("This browser does not support isolated local PDF processing. Enable Web Workers or use a supported browser."));
  }

  return new Promise((resolve, reject) => {
    const requestId = "a-book-pdf-" + (++requestSequence);
    let worker: Worker;
    try {
      worker = new Worker(new URL("./pdf.worker.ts", import.meta.url), {
        type: "module",
        name: "enV-a-book-pdf",
      });
    } catch (error) {
      reject(new Error(error instanceof Error
        ? `The local PDF worker could not start: ${error.message}`
        : "The local PDF worker could not start."));
      return;
    }

    let settled = false;
    let finish: (error?: Error, value?: unknown) => void;
    const abort = () => finish(new DOMException("PDF processing was cancelled.", "AbortError"));
    finish = (error?: Error, value?: unknown) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      signal?.removeEventListener("abort", abort);
      worker.terminate();
      if (error) reject(error);
      else resolve(value);
    };
    signal?.addEventListener("abort", abort, { once: true });
    const timer = window.setTimeout(() => {
      finish(new Error("Local PDF processing exceeded the three-minute safety limit. Choose fewer or smaller files and retry."));
    }, 180_000);

    worker.onmessage = (event: MessageEvent<ABookPdfWorkerResponse>) => {
      const response = event.data;
      if (!response || response.requestId !== requestId) return;
      if (response.ok) finish(undefined, response.value);
      else finish(new Error(response.error || "The local PDF worker failed without a diagnostic."));
    };
    worker.onerror = (event) => {
      finish(new Error(`The local PDF worker failed: ${event.message || "unknown worker error"}`));
    };
    worker.onmessageerror = () => {
      finish(new Error("The local PDF worker returned an unreadable result."));
    };
    if (signal?.aborted) {
      abort();
      return;
    }
    try {
      worker.postMessage({ ...task, requestId });
    } catch (error) {
      finish(new Error(error instanceof Error
        ? `The selected PDFs could not be passed to the local worker: ${error.message}`
        : "The selected PDFs could not be passed to the local worker."));
    }
  });
}

function outputBytes(value: unknown): Uint8Array {
  if (value instanceof Uint8Array) return value;
  if (value instanceof ArrayBuffer) return new Uint8Array(value);
  throw new Error("The local PDF worker returned an invalid file result.");
}

export async function inspectPdfInWorker(blob: Blob, signal?: AbortSignal): Promise<ABookPdfInfo> {
  return await runInWorker({ action: "inspect", blob }, signal) as ABookPdfInfo;
}

export async function extractPdfPagesInWorker(blob: Blob, pages: number[], signal?: AbortSignal): Promise<Uint8Array> {
  return outputBytes(await runInWorker({ action: "extract-one", blob, pages }, signal));
}

export async function extractSelectedPdfsInWorker(files: ABookPdfInput[], pageRange: string, signal?: AbortSignal): Promise<Uint8Array> {
  return outputBytes(await runInWorker({ action: "extract-batch", files, pageRange }, signal));
}

export async function splitPdfIntoZipInWorker(blob: Blob, filename: string, pageGroups: string, signal?: AbortSignal): Promise<Uint8Array> {
  return outputBytes(await runInWorker({ action: "split-one", blob, filename, pageGroups }, signal));
}

export async function splitSelectedPdfsIntoZipInWorker(files: ABookPdfInput[], pageGroups: string, signal?: AbortSignal): Promise<Uint8Array> {
  return outputBytes(await runInWorker({ action: "split-batch", files, pageGroups }, signal));
}

export async function rotateSelectedPdfsInWorker(files: ABookPdfInput[], angle: 90 | 180 | 270, signal?: AbortSignal): Promise<Uint8Array> {
  return outputBytes(await runInWorker({ action: "rotate-batch", files, angle }, signal));
}

export async function mergePdfsInWorker(files: Blob[], signal?: AbortSignal): Promise<Uint8Array> {
  return outputBytes(await runInWorker({ action: "merge", files }, signal));
}


/** Start and stop the real A book module worker once so its complete worker-side
 * dependency graph is fetched into the current tool's Service Worker package session. */
export async function warmABookPdfWorker(): Promise<string> {
  if (typeof window === "undefined" || typeof Worker === "undefined") {
    throw new Error("A book offline preparation requires module Web Worker support.");
  }
  const workerUrl = new URL("./pdf.worker.ts", import.meta.url);
  await new Promise<void>((resolve, reject) => {
    const worker = new Worker(workerUrl, {
      type: "module",
      name: "enV-a-book-offline-package-check",
    });
    const timer = window.setTimeout(() => {
      worker.terminate();
      reject(new Error("A book's PDF worker did not finish its offline package check."));
    }, 15_000);
    worker.onmessage = (event: MessageEvent<ABookPdfWorkerResponse>) => {
      const response = event.data;
      if (!response || response.requestId !== "a-book-offline-precache") return;
      window.clearTimeout(timer);
      worker.terminate();
      if (response.ok && typeof response.value === "object" && response.value !== null && "ready" in response.value) resolve();
      else reject(new Error("A book's PDF worker dependencies could not be verified."));
    };
    worker.onerror = (event) => {
      window.clearTimeout(timer);
      worker.terminate();
      reject(new Error(event.message || "A book's PDF worker could not be prepared."));
    };
    worker.postMessage({ action: "warmup", requestId: "a-book-offline-precache" } satisfies ABookPdfWorkerRequest);
  });
  return workerUrl.href;
}
