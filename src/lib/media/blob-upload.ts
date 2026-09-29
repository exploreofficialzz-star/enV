import type { PutBlobResult } from "@vercel/blob";
import { upload } from "@vercel/blob/client";

export const MAX_MEDIA_BYTES = 100 * 1024 * 1024;

export async function uploadMediaFile(file: Blob & { name?: string }, signal?: AbortSignal): Promise<PutBlobResult> {
  if (file.size > MAX_MEDIA_BYTES) {
    throw new Error("This media file is larger than the 100MB limit. Compress it before uploading.");
  }
  if (signal?.aborted) throw new DOMException("Upload cancelled.", "AbortError");
  return upload(file.name || "media.bin", file, {
    access: "public",
    handleUploadUrl: "/api/backend/blob-upload",
    multipart: true,
  });
}
