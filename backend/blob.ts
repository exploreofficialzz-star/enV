export const MAX_MEDIA_BYTES = 100 * 1024 * 1024;

export const MEDIA_CONTENT_TYPES = [
  "audio/*",
  "video/*",
  "image/*",
  "application/octet-stream",
];

export function safeBlobPathname(pathname: string) {
  const name = pathname.split("/").pop()?.replace(/[^a-zA-Z0-9._-]/g, "_") || "media.bin";
  return `env-media/${name}`;
}
