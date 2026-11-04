import {
  extractPdfPages,
  extractSelectedPdfs,
  inspectPdf,
  mergePdfs,
  rotateSelectedPdfs,
  splitPdfIntoZip,
  splitSelectedPdfsIntoZip,
} from "./pdf.ts";
import type { ABookPdfInfo } from "./pdf.ts";
import type { ABookPdfWorkerRequest, ABookPdfWorkerResponse } from "./pdf-worker-types.ts";

const workerScope = self as unknown as {
  onmessage: ((event: MessageEvent<ABookPdfWorkerRequest>) => void) | null;
  postMessage(message: ABookPdfWorkerResponse, transfer?: Transferable[]): void;
};

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error || "Unknown local PDF processing error.");
}

workerScope.onmessage = async (event) => {
  const request = event.data;
  if (!request || typeof request.requestId !== "string") return;

  try {
    let value: ABookPdfInfo | Uint8Array | { ready: true };
    switch (request.action) {
      case "warmup":
        value = { ready: true };
        break;
      case "inspect":
        value = await inspectPdf(request.blob);
        break;
      case "extract-one":
        value = await extractPdfPages(request.blob, request.pages);
        break;
      case "extract-batch":
        value = await extractSelectedPdfs(request.files, request.pageRange);
        break;
      case "split-one":
        value = await splitPdfIntoZip(request.blob, request.filename, request.pageGroups);
        break;
      case "split-batch":
        value = await splitSelectedPdfsIntoZip(request.files, request.pageGroups);
        break;
      case "rotate-batch":
        value = await rotateSelectedPdfs(request.files, request.angle);
        break;
      case "merge":
        value = await mergePdfs(request.files);
        break;
      default:
        throw new Error("Unsupported local PDF operation.");
    }

    if (value instanceof Uint8Array) {
      const bytes = value.buffer.slice(value.byteOffset, value.byteOffset + value.byteLength) as ArrayBuffer;
      workerScope.postMessage({ requestId: request.requestId, ok: true, value: bytes }, [bytes]);
    } else {
      workerScope.postMessage({ requestId: request.requestId, ok: true, value });
    }
  } catch (error) {
    workerScope.postMessage({ requestId: request.requestId, ok: false, error: errorMessage(error) });
  }
};
