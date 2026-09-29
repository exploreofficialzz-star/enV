import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { defineHandler } from "nitro/h3";
import { MEDIA_CONTENT_TYPES, MAX_MEDIA_BYTES, safeBlobPathname } from "../../../../backend/blob";
import { jsonResponse } from "../../../../backend/http";

export default defineHandler(async (event) => {
  try {
    const body = (await event.req.json()) as HandleUploadBody;
    const result = await handleUpload({
      body,
      request: event.req,
      onBeforeGenerateToken: async (pathname) => ({
        allowedContentTypes: MEDIA_CONTENT_TYPES,
        maximumSizeInBytes: MAX_MEDIA_BYTES,
        addRandomSuffix: true,
        tokenPayload: JSON.stringify({ pathname: safeBlobPathname(pathname) }),
      }),
      onUploadCompleted: async ({ blob }) => {
        console.info("[enV] media blob upload completed", blob.pathname);
      },
    });
    return jsonResponse(result);
  } catch (error) {
    return jsonResponse({ error: error instanceof Error ? error.message : "Unable to authorize the media upload." }, 400);
  }
});
