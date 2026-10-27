import { parseBlob, type IAudioMetadata } from "music-metadata";
import { extractMusicMetadata, type MusicMetadata } from "./music-metadata.ts";
import { inspectAudioHeader } from "./song-metadata-analyzer.ts";

/** Preserve unknown tags as data, while omitting binary pictures from JSON exports. */
function jsonTag(value: unknown, depth = 0): unknown {
  if (depth > 8 || value == null) return null;
  if (value instanceof Uint8Array) return { binary_bytes: value.byteLength };
  if (typeof value === "string") return value.slice(0, 65_536);
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "boolean") return value;
  if (Array.isArray(value)) return value.slice(0, 500).map((item) => jsonTag(item, depth + 1));
  if (typeof value === "object")
    return Object.fromEntries(
      Object.entries(value)
        .slice(0, 300)
        .map(([key, item]) => [key, jsonTag(item, depth + 1)]),
    );
  return null;
}

export function normalizeSongFileMetadata(parsed: IAudioMetadata, fallback: MusicMetadata) {
  const common = parsed.common;
  const ratio = (value: { no: number | null; of: number | null }) =>
    value.no ? `${value.no}${value.of ? `/${value.of}` : ""}` : undefined;
  const artwork = common.picture?.find(
    (item) =>
      ["image/jpeg", "image/png", "image/webp"].includes(item.format) &&
      item.data.byteLength <= 5 * 1024 * 1024,
  );
  const metadata: MusicMetadata = {
    ...fallback,
    title: common.title || fallback.title,
    artist: common.artist || fallback.artist,
    album: common.album || fallback.album,
    albumArtist: common.albumartist || fallback.albumArtist,
    year: common.date || common.releasedate || String(common.year || "") || fallback.year,
    genre: common.genre?.join("; ") || fallback.genre,
    composer: common.composer?.join("; ") || fallback.composer,
    publisher: common.publisher?.join("; ") || fallback.publisher,
    copyright: common.copyright || fallback.copyright,
    comment: common.comment?.map((item) => item.text).join("\n") || fallback.comment,
    trackNumber: ratio(common.track) || fallback.trackNumber,
    discNumber: ratio(common.disk) || fallback.discNumber,
    bpm: common.bpm ? String(common.bpm) : fallback.bpm,
    durationSeconds: parsed.format.duration || fallback.durationSeconds,
    artwork: artwork ? { mimeType: artwork.format, bytes: artwork.data } : fallback.artwork,
  };
  return {
    metadata,
    fullTags: {
      common: jsonTag(common),
      native: jsonTag(parsed.native),
      format: jsonTag(parsed.format),
      title_source: common.title ? "embedded_tag" : "filename_fallback",
      parser: "music-metadata@12.3.2",
      binary_data: "omitted; byte sizes retained",
    },
    warnings: parsed.quality.warnings.map((warning) => warning.message).slice(0, 30),
  };
}

export async function readSongFileMetadata(file: File) {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const fallback = extractMusicMetadata(bytes, file.name);
  const header = inspectAudioHeader(bytes);
  try {
    const parsed = await parseBlob(file, { duration: true, includeChapters: true });
    const normalized = normalizeSongFileMetadata(parsed, fallback);
    return {
      ...normalized,
      header: {
        ...header,
        container: parsed.format.container || header.container,
        codec: parsed.format.codec || header.codec,
        sourceSampleRateHz: parsed.format.sampleRate || header.sourceSampleRateHz,
        channels: parsed.format.numberOfChannels || header.channels,
        bitDepth: parsed.format.bitsPerSample || header.bitDepth,
        durationSeconds: parsed.format.duration || header.durationSeconds,
        encodedBitrateBps: parsed.format.bitrate || header.encodedBitrateBps,
      },
    };
  } catch {
    return {
      metadata: fallback,
      header,
      fullTags: { parser: "legacy_fallback", title_source: "embedded_or_filename" },
      warnings: ["Some metadata could not be parsed; available tags were retained."],
    };
  }
}
