import { defineHandler } from "nitro/h3";
import { MAX_MEDIA_BYTES } from "../../../../backend/blob";
import { backendConfig } from "../../../../backend/config";
import { jsonResponse } from "../../../../backend/http";

export default defineHandler(() => {
  const config = backendConfig();
  const processors = {
    media: Boolean(config.media),
    urlMedia: Boolean(config.urlMedia),
    transcription: Boolean(config.transcription),
    ocr: Boolean(config.ocr),
    documents: Boolean(config.documents),
    websiteScreenshot: Boolean(config.websiteScreenshot),
  };
  return jsonResponse({
    ok: true,
    ready: processors.media && processors.urlMedia,
    service: "enV backend gateway",
    processors,
    requiredEnvironment: {
      media: "MEDIA_PROCESSOR_URL",
      urlMedia: "URL_MEDIA_PROCESSOR_URL",
      transcription: "TRANSCRIBE_URL",
      ocr: "OCR_PROCESSOR_URL (or local TESSERACT_BIN/PDFTOPPM_BIN)",
      documents: "DOCUMENT_PROCESSOR_URL (or local PDFTOTEXT_BIN)",
      websiteScreenshot: "WEBSITE_SCREENSHOT_API_URL",
      blob: "BLOB_READ_WRITE_TOKEN",
    },
    blob: { configured: Boolean(process.env.BLOB_READ_WRITE_TOKEN), maxMediaBytes: MAX_MEDIA_BYTES },
  });
});
