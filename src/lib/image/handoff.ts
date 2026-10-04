/**
 * In-memory hand-off of an image result from one Image tool to the next, so users can chain
 * crop → resize → compress without downloading and re-uploading. State lives only in this tab;
 * nothing is persisted or uploaded.
 */
export interface ImageHandoff {
  blob: Blob;
  name: string;
  /** Tool id that produced the image, for the "came from" hint in the next tool. */
  from: string;
  at: number;
}

let pending: ImageHandoff | null = null;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((l) => l());

export function offerImage(handoff: Omit<ImageHandoff, "at">): void {
  pending = { ...handoff, at: Date.now() };
  notify();
}

export const peekHandoff = () => pending;

/** Returns the pending image once and clears it; a hand-off older than 10 minutes is ignored. */
export function takeHandoff(): ImageHandoff | null {
  const value = pending;
  pending = null;
  if (value) notify();
  return value && Date.now() - value.at < 10 * 60_000 ? value : null;
}

export function subscribeHandoff(listener: () => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

/** Tools an edited image can be sent to. Order = display order. */
export const HANDOFF_TARGETS: { id: string; label: string }[] = [
  { id: "image-cropper", label: "Crop" },
  { id: "image-resizer", label: "Resize" },
  { id: "image-compressor", label: "Compress" },
  { id: "image-sharpen", label: "Sharpen" },
  { id: "brightness-contrast", label: "Brightness & contrast" },
  { id: "image-watermark", label: "Watermark" },
  { id: "background-remover", label: "Remove background" },
  { id: "profile-picture-maker", label: "Profile picture" },
  { id: "social-image-resizer", label: "Social sizes" },
  { id: "image-image-metadata-cleaner", label: "Clean metadata" },
  { id: "jpg-converter", label: "Convert to JPG" },
  { id: "webp-converter", label: "Convert to WebP" },
];
