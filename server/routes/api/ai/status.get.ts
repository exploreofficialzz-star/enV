import { defineHandler } from "nitro/h3";
import { getAiRuntime } from "../../../../src/lib/ai/server/runtime";

// GET /api/ai/status -> which AI tasks are currently usable (booleans only; no provider details).
export default defineHandler((event) => getAiRuntime().handlers.status(event.req));
