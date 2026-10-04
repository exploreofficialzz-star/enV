import { defineHandler } from "nitro/h3";
import { getAiRuntime } from "../../../../src/lib/ai/server/runtime";

// GET /api/ai/diagnostics with an admin bearer token. Answers 404 unless an admin token is configured.
export default defineHandler((event) => getAiRuntime().handlers.diagnostics(event.req));
