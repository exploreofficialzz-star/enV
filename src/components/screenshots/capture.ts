/** Screen capture + clipboard intake. Capture uses the browser's getDisplayMedia picker: the user chooses what is shared, and nothing leaves the device. */
import { assertSafeDimensions } from "@/lib/image/limits";

export const canCaptureDisplay = () => typeof navigator !== "undefined" && !!navigator.mediaDevices && typeof navigator.mediaDevices.getDisplayMedia === "function";
export const canReadClipboardImage = () => typeof navigator !== "undefined" && !!navigator.clipboard && typeof navigator.clipboard.read === "function";

export async function readClipboardImages(): Promise<File[]> {
  const items = await navigator.clipboard.read(), files: File[] = [];
  for (const item of items) { const type = item.types.find((t) => t.startsWith("image/")); if (type) { const blob = await item.getType(type); files.push(new File([blob], `pasted.${type.split("/")[1] || "png"}`, { type })); } }
  return files;
}

export function imagesFromPasteEvent(e: ClipboardEvent): File[] {
  return Array.from(e.clipboardData?.files ?? []).filter((f) => f.type.startsWith("image/"));
}

const sleep = (ms: number, signal?: AbortSignal) => new Promise<void>((resolve, reject) => {
  const t = setTimeout(resolve, ms); signal?.addEventListener("abort", () => { clearTimeout(t); reject(new DOMException("Capture cancelled", "AbortError")); }, { once: true });
});

/** Ask the user to pick a screen/window/tab, wait `delaySec`, grab one frame, then stop sharing immediately. */
export async function captureDisplayFrame(opts: { delaySec: number; includeCursor: boolean; signal?: AbortSignal; onTick?: (remaining: number) => void }): Promise<File> {
  const stream = await navigator.mediaDevices.getDisplayMedia({ video: { cursor: opts.includeCursor ? "always" : "never" } as MediaTrackConstraints, audio: false });
  try {
    const video = document.createElement("video"); video.srcObject = stream; video.muted = true; video.playsInline = true; await video.play();
    for (let s = opts.delaySec; s > 0; s--) { opts.onTick?.(s); await sleep(1000, opts.signal); }
    opts.onTick?.(0); await new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r())));
    const w = video.videoWidth, h = video.videoHeight; assertSafeDimensions(w, h, "Capture");
    const canvas = document.createElement("canvas"); canvas.width = w; canvas.height = h; canvas.getContext("2d")?.drawImage(video, 0, 0, w, h);
    const blob = await new Promise<Blob>((res, rej) => canvas.toBlob((b) => (b ? res(b) : rej(new Error("Could not read the captured frame."))), "image/png"));
    return new File([blob], "capture.png", { type: "image/png" });
  } finally { stream.getTracks().forEach((t) => t.stop()); }
}
