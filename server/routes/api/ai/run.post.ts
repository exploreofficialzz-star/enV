import { defineHandler } from "nitro/h3";
import { getAiRuntime } from "../../../../src/lib/ai/server/runtime";

// POST /api/ai/run  { task, input }  ->  { ok, data | error }. Same-origin browser calls only.
export default defineHandler((event) => getAiRuntime().handlers.run(event.req));
