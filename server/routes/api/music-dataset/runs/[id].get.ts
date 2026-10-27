import { defineHandler } from "nitro/h3";
import { getMusicAnalysisRun } from "../../../../../src/lib/media/music-dataset-api.server";

export default defineHandler((event) => getMusicAnalysisRun(event.req, String(event.context.params?.id || "")));
