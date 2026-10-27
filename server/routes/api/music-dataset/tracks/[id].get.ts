import { defineHandler } from "nitro/h3";
import { getMusicDatasetTrack } from "../../../../../src/lib/media/music-dataset-api.server";

export default defineHandler((event) => getMusicDatasetTrack(event.req, String(event.context.params?.id || "")));
