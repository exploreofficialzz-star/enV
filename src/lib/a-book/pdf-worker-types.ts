import type { ABookPdfInfo, ABookPdfInput } from "./pdf.ts";

export type ABookPdfWorkerTask =
  | { action: "warmup" }
  | { action: "inspect"; blob: Blob }
  | { action: "extract-one"; blob: Blob; pages: number[] }
  | { action: "extract-batch"; files: ABookPdfInput[]; pageRange: string }
  | { action: "split-one"; blob: Blob; filename: string; pageGroups: string }
  | { action: "split-batch"; files: ABookPdfInput[]; pageGroups: string }
  | { action: "rotate-batch"; files: ABookPdfInput[]; angle: 90 | 180 | 270 }
  | { action: "merge"; files: Blob[] };

export type ABookPdfWorkerRequest = ABookPdfWorkerTask & { requestId: string };

export type ABookPdfWorkerResponse =
  | { requestId: string; ok: true; value: ABookPdfInfo | ArrayBuffer | { ready: true } }
  | { requestId: string; ok: false; error: string };
