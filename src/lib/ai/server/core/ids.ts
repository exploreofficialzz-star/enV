/** SERVER ONLY. Small crypto helpers shared by the core and the HTTP handler. */
import { createHash, randomBytes } from "node:crypto";

export function sha256Hex(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export function randomHex(bytes: number): string {
  return randomBytes(bytes).toString("hex");
}

export function newRequestId(): string {
  return `req_${randomHex(8)}`;
}

/** Per-request delimiter for untrusted prompt content. Unpredictable, so input cannot close it. */
export function newBoundary(): string {
  return `b${randomHex(9)}`;
}
