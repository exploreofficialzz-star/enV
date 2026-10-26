import { createFileRoute } from "@tanstack/react-router";

/**
 * Retired compatibility endpoint.
 *
 * Music Analyzer does not invoke hosted models or forward source audio to a
 * semantic-classification service. Keep a deterministic 410 response so older
 * clients fail explicitly instead of silently uploading private recordings.
 */
function handleMusicAnalysis(): Response {
  return Response.json({
    ok: false,
    code: "MUSIC_ANALYSIS_MODEL_DISABLED",
    message: "Remote model classification is disabled for Music Analyzer. No audio was accepted or transmitted; use local DSP and human-reviewed annotations.",
  }, {
    status: 410,
    headers: {
      "Cache-Control": "no-store",
      "Deprecation": "true",
      "Sunset": "2026-10-26",
    },
  });
}

export const Route = createFileRoute("/api/music-analysis")({
  server: { handlers: { POST: handleMusicAnalysis } },
});
