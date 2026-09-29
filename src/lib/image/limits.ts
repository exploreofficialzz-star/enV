export const IMAGE_LIMITS = {
  maxInputBytes: 100 * 1024 * 1024,
  maxDecodedPixels: 80_000_000,
  maxOutputPixels: 120_000_000,
  maxBatchFiles: 100,
  maxBatchBytes: 250 * 1024 * 1024,
  previewPixels: 3_000_000,
  workerTimeoutMs: 60_000,
} as const;

export function assertSafeBatch(files: File[]) {
  if (files.length > IMAGE_LIMITS.maxBatchFiles) throw new Error(`A batch can contain at most ${IMAGE_LIMITS.maxBatchFiles} files.`);
  const bytes = files.reduce((total, file) => total + file.size, 0);
  if (bytes > IMAGE_LIMITS.maxBatchBytes) throw new Error(`The selected batch is too large (${Math.round(bytes / 1024 / 1024)} MB). Maximum is ${IMAGE_LIMITS.maxBatchBytes / 1024 / 1024} MB.`);
  files.forEach((file) => assertSafeInput(file));
}

export function assertSafeDimensions(width: number, height: number, label = "Image") {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width <= 0 || height <= 0) {
    throw new Error(`${label} dimensions are invalid.`);
  }
  const pixels = width * height;
  if (pixels > IMAGE_LIMITS.maxOutputPixels) {
    throw new Error(`${label} is too large (${pixels.toLocaleString()} pixels). Maximum supported output is ${IMAGE_LIMITS.maxOutputPixels.toLocaleString()} pixels.`);
  }
  return pixels;
}

export function assertSafeInput(file: File) {
  if (file.size <= 0) throw new Error("The selected file is empty.");
  if (file.size > IMAGE_LIMITS.maxInputBytes) {
    throw new Error(`The selected file is larger than ${IMAGE_LIMITS.maxInputBytes / 1024 / 1024} MB.`);
  }
}
