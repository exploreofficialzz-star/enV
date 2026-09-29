import { defineHandler } from "nitro/h3";
import { MAX_MEDIA_BYTES } from "../../../../backend/blob";
import { backendConfig } from "../../../../backend/config";
import { jsonResponse } from "../../../../backend/http";

export default defineHandler(() => {
  const config = backendConfig();
  return jsonResponse({
    ok: true,
    service: "enV backend gateway",
    processors: {
      media: Boolean(config.media),
      urlMedia: Boolean(config.urlMedia),
      transcription: Boolean(config.transcription),
    },
    blob: { configured: Boolean(process.env.BLOB_READ_WRITE_TOKEN), maxMediaBytes: MAX_MEDIA_BYTES },
  });
});
