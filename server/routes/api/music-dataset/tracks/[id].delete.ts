import { defineHandler } from "nitro/h3";
import { deleteMusicDatasetTrack } from "../../../../../src/lib/media/music-dataset-api.server";

export default defineHandler((event) => deleteMusicDatasetTrack(event.req, String(event.context.params?.id || "")));
