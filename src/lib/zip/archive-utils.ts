const PRECOMPRESSED_EXTENSIONS = new Set([
  "7z", "aac", "avif", "bz2", "flac", "gif", "gz", "heic", "j2k", "jpeg", "jpg",
  "m4a", "m4v", "mkv", "mov", "mp3", "mp4", "ogg", "opus", "pdf", "png", "rar",
  "webm", "webp", "woff", "woff2", "xz", "zip", "zst",
]);

export const MAX_ARCHIVE_ENTRIES = 100_000;
export const MAX_EXTRACT_BYTES = 100 * 1024 ** 3;
export const MAX_BROWSER_BUFFER_BYTES = 256 * 1024 ** 2;

export function shouldStoreWithoutCompression(fileName: string): boolean {
  const extension = fileName.split(".").pop()?.toLowerCase() ?? "";
  return PRECOMPRESSED_EXTENSIONS.has(extension);
}

export function sanitizeArchivePath(input: string): string | null {
  if (!input || input.includes("\0")) return null;
  const normalized = input.replace(/\\/g, "/");
  if (normalized.startsWith("/") || /^[a-zA-Z]:/.test(normalized)) return null;
  const parts = normalized.split("/");
  if (parts.some((part) => part === "..")) return null;
  const safe = parts.filter((part) => part && part !== ".");
  if (!safe.length || safe.some((part) => part.includes(":"))) return null;
  return safe.join("/");
}

export function formatArchiveBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return "—";
  if (bytes < 1024) return `${Math.round(bytes)} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let value = bytes;
  let unit = -1;
  do {
    value /= 1024;
    unit += 1;
  } while (value >= 1024 && unit < units.length - 1);
  return `${value.toFixed(value >= 10 ? 1 : 2)} ${units[unit]}`;
}
