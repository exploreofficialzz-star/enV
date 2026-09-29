import { defineHandler } from "nitro/h3";
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
  });
});
