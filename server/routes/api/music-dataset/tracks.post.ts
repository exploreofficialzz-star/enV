import { defineHandler } from "nitro/h3";
import { saveMusicDatasetTrack } from "../../../../src/lib/media/music-dataset-api.server";

export default defineHandler((event) => saveMusicDatasetTrack(event.req));
