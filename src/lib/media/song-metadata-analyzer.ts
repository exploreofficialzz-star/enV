export const SONG_ANALYZER_LIMITS = {
  maxTracks: 50,
  maxTrackBytes: 50 * 1024 * 1024,
  maxBatchBytes: 200 * 1024 * 1024,
  maxZipBytes: 100 * 1024 * 1024,
  maxExpandedBytes: 200 * 1024 * 1024,
  maxZipEntries: 500,
} as const;


export interface AudioHeaderInfo {
  container: string | null;
  codec: string | null;
  sourceSampleRateHz: number | null;
  bitDepth: number | null;
  channels: number | null;
  encodedBitrateBps: number | null;
  durationSeconds: number | null;
}

/** Best-effort technical inspection of common headers. Unknown fields stay null. */
export function inspectAudioHeader(bytes: Uint8Array): AudioHeaderInfo {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const ascii = (start: number, end: number) => {
    let text = "";
    for (let i = start; i < end && i < bytes.byteLength; i += 1) text += String.fromCharCode(bytes[i]);
    return text;
  };
  const empty: AudioHeaderInfo = {
    container: null, codec: null, sourceSampleRateHz: null,
    bitDepth: null, channels: null, encodedBitrateBps: null, durationSeconds: null,
  };
  if (bytes.byteLength < 12) return empty;

  if (ascii(0, 4) === "RIFF" && ascii(8, 12) === "WAVE") {
    const out: AudioHeaderInfo = { ...empty, container: "WAVE" };
    let offset = 12, byteRate = 0, dataBytes = 0;
    while (offset + 8 <= bytes.byteLength) {
      const kind = ascii(offset, offset + 4);
      const length = view.getUint32(offset + 4, true);
      const start = offset + 8;
      const end = start + length;
      if (end > bytes.byteLength || length < 0) break;
      if (kind === "fmt " && length >= 16) {
        const format = view.getUint16(start, true);
        out.channels = view.getUint16(start + 2, true) || null;
        out.sourceSampleRateHz = view.getUint32(start + 4, true) || null;
        byteRate = view.getUint32(start + 8, true);
        out.bitDepth = view.getUint16(start + 14, true) || null;
        out.codec = format === 1 ? "PCM" : format === 3 ? "IEEE Float" : format === 0xfffe ? "WAVE_FORMAT_EXTENSIBLE" : `WAVE format 0x${format.toString(16)}`;
      } else if (kind === "data") {
        dataBytes += length;
      }
      offset = end + (length & 1);
    }
    if (byteRate > 0 && dataBytes > 0) out.durationSeconds = dataBytes / byteRate;
    if (byteRate > 0) out.encodedBitrateBps = byteRate * 8;
    return out;
  }

  if (ascii(0, 4) === "fLaC") {
    let offset = 4;
    while (offset + 4 <= bytes.byteLength) {
      const first = bytes[offset];
      const type = first & 0x7f;
      const length = (bytes[offset + 1] << 16) | (bytes[offset + 2] << 8) | bytes[offset + 3];
      const start = offset + 4, end = start + length;
      if (end > bytes.byteLength) break;
      if (type === 0 && length >= 18) {
        const block = bytes.subarray(start, end);
        const sampleRate = (block[10] << 12) | (block[11] << 4) | (block[12] >> 4);
        const channels = ((block[12] >> 1) & 0x07) + 1;
        const bitDepth = (((block[12] & 0x01) << 4) | (block[13] >> 4)) + 1;
        const totalSamples = ((block[13] & 0x0f) * 0x100000000) + (block[14] * 0x1000000) + (block[15] << 16) + (block[16] << 8) + block[17];
        return {
          ...empty, container: "FLAC", codec: "FLAC",
          sourceSampleRateHz: sampleRate || null, bitDepth: bitDepth || null, channels: channels || null,
          durationSeconds: sampleRate > 0 && totalSamples > 0 ? totalSamples / sampleRate : null,
        };
      }
      offset = end;
      if (first & 0x80) break;
    }
    return { ...empty, container: "FLAC", codec: "FLAC" };
  }

  if (ascii(0, 3) === "ID3" || (bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0)) {
    let offset = 0;
    if (ascii(0, 3) === "ID3" && bytes.byteLength >= 10) {
      const size = ((bytes[6] & 0x7f) << 21) | ((bytes[7] & 0x7f) << 14) | ((bytes[8] & 0x7f) << 7) | (bytes[9] & 0x7f);
      offset = Math.min(bytes.byteLength, 10 + size + ((bytes[5] & 0x10) ? 10 : 0));
    }
    const mpeg1L3 = [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320, 0];
    const mpeg2L3 = [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160, 0];
    const rateBase = [44100, 48000, 32000];
    for (let i = offset; i + 4 <= Math.min(bytes.byteLength, offset + 65_536); i += 1) {
      const header = view.getUint32(i, false);
      if ((header >>> 21) !== 0x7ff) continue;
      const version = (header >>> 19) & 0x03;
      const layer = (header >>> 17) & 0x03;
      const bitrateIndex = (header >>> 12) & 0x0f;
      const rateIndex = (header >>> 10) & 0x03;
      if (version === 1 || layer !== 1 || bitrateIndex === 0 || bitrateIndex === 15 || rateIndex === 3) continue;
      const baseRate = rateBase[rateIndex];
      const divisor = version === 3 ? 1 : version === 2 ? 2 : 4;
      const bitrate = (version === 3 ? mpeg1L3 : mpeg2L3)[bitrateIndex] * 1000;
      const sampleRate = baseRate / divisor;
      const channelMode = (header >>> 6) & 0x03;
      return {
        ...empty, container: "MPEG Audio", codec: "MP3",
        sourceSampleRateHz: sampleRate, channels: channelMode === 3 ? 1 : 2,
        encodedBitrateBps: bitrate,
      };
    }
    return { ...empty, container: "MPEG Audio", codec: "MP3" };
  }

  if (ascii(0, 4) === "OggS") {
    let out: AudioHeaderInfo = { ...empty, container: "Ogg" };
    const max = Math.min(bytes.byteLength, 64 * 1024);
    for (let i = 0; i < max - 20; i += 1) {
      if (ascii(i, i + 8) === "OpusHead") {
        out.codec = "Opus";
        out.channels = bytes[i + 9] || null;
        out.sourceSampleRateHz = 48000;
        return out;
      }
      if (bytes[i] === 1 && ascii(i + 1, i + 7) === "vorbis") {
        out.codec = "Vorbis";
        out.channels = bytes[i + 11] || null;
        if (i + 16 <= bytes.byteLength) out.sourceSampleRateHz = view.getUint32(i + 12, true) || null;
        return out;
      }
    }
    return out;
  }

  if (ascii(4, 8) === "ftyp") return { ...empty, container: "ISO Base Media / MP4" };
  if (ascii(0, 4) === "FORM" && (ascii(8, 12) === "AIFF" || ascii(8, 12) === "AIFC")) {
    return { ...empty, container: ascii(8, 12), codec: ascii(8, 12) === "AIFF" ? "PCM AIFF" : "AIFF-C" };
  }
  return empty;
}

export type TempoBand = "slow" | "mid" | "upbeat" | "fast" | "unknown";

export interface ZipEntryHeader {
  name: string;
  compressedSize: number;
  uncompressedSize: number;
  crc32: number;
  method: 0 | 8;
  localHeaderOffset: number;
  isDirectory: boolean;
}

/** Product-defined tempo buckets, not a universal music standard. */
export function tempoBandFromBpm(bpm: number | null | undefined): TempoBand {
  if (bpm == null || !Number.isFinite(bpm) || bpm <= 0) return "unknown";
  if (bpm < 80) return "slow";
  if (bpm < 110) return "mid";
  if (bpm < 130) return "upbeat";
  return "fast";
}

function u16(view: DataView, offset: number): number {
  if (offset < 0 || offset + 2 > view.byteLength) throw new Error("ZIP directory is truncated.");
  return view.getUint16(offset, true);
}

function u32(view: DataView, offset: number): number {
  if (offset < 0 || offset + 4 > view.byteLength) throw new Error("ZIP directory is truncated.");
  return view.getUint32(offset, true);
}

function isUnsafeArchivePath(name: string): boolean {
  const normalized = name.replace(/\\/g, "/");
  return !name ||
    name.length > 1024 ||
    /[\u0000-\u001f\u007f]/.test(name) ||
    normalized.startsWith("/") ||
    /^[a-z]:/i.test(normalized) ||
    normalized.split("/").some((part) => part === ".." || part === ".");
}

/**
 * Preflight the ZIP central directory before inflation.
 * ZIP64, encrypted entries, links, unsupported compression methods, traversal paths,
 * duplicate names, unreasonable entry counts, and oversized expansion are rejected.
 * This function never extracts entries to a filesystem.
 */
export function inspectSongZip(
  bytes: Uint8Array,
  limits: {
    maxZipBytes?: number;
    maxExpandedBytes?: number;
    maxTrackBytes?: number;
    maxEntries?: number;
  } = {},
): { entries: ZipEntryHeader[]; totalUncompressedBytes: number } {
  const maxZipBytes = limits.maxZipBytes ?? SONG_ANALYZER_LIMITS.maxZipBytes;
  const maxExpandedBytes = limits.maxExpandedBytes ?? SONG_ANALYZER_LIMITS.maxExpandedBytes;
  const maxTrackBytes = limits.maxTrackBytes ?? SONG_ANALYZER_LIMITS.maxTrackBytes;
  const maxEntries = limits.maxEntries ?? SONG_ANALYZER_LIMITS.maxZipEntries;
  if (bytes.byteLength < 22) throw new Error("This ZIP file is incomplete.");
  if (bytes.byteLength > maxZipBytes) throw new Error("This ZIP is too large for safe local processing.");
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

  const searchStart = Math.max(0, bytes.byteLength - 22 - 65_535);
  let endOffset = -1;
  for (let offset = bytes.byteLength - 22; offset >= searchStart; offset -= 1) {
    if (u32(view, offset) === 0x06054b50) {
      const commentLength = u16(view, offset + 20);
      if (offset + 22 + commentLength === bytes.byteLength) {
        endOffset = offset;
        break;
      }
    }
  }
  if (endOffset < 0) throw new Error("This file does not contain a valid ZIP directory.");
  if (u16(view, endOffset + 4) !== 0 || u16(view, endOffset + 6) !== 0) {
    throw new Error("Split or multi-disk ZIP archives are not supported.");
  }
  const entriesOnDisk = u16(view, endOffset + 8);
  const totalEntries = u16(view, endOffset + 10);
  const directorySize = u32(view, endOffset + 12);
  const directoryOffset = u32(view, endOffset + 16);
  if (entriesOnDisk !== totalEntries) throw new Error("This ZIP directory is inconsistent.");
  if (totalEntries === 0xffff || directorySize === 0xffffffff || directoryOffset === 0xffffffff) {
    throw new Error("ZIP64 archives are not supported by this local analyzer yet.");
  }
  if (totalEntries > maxEntries) throw new Error(`This ZIP contains too many entries (limit ${maxEntries}).`);
  if (directoryOffset + directorySize > endOffset || directoryOffset + directorySize > bytes.byteLength) {
    throw new Error("This ZIP directory is outside the file boundaries.");
  }

  const entries: ZipEntryHeader[] = [];
  const seenNames = new Set<string>();
  const localRanges: Array<{ start: number; end: number }> = [];
  let cursor = directoryOffset;
  let totalUncompressedBytes = 0;
  for (let index = 0; index < totalEntries; index += 1) {
    if (u32(view, cursor) !== 0x02014b50) throw new Error("This ZIP contains a damaged directory entry.");
    const madeBy = u16(view, cursor + 4);
    const flags = u16(view, cursor + 8);
    const methodValue = u16(view, cursor + 10);
    const expectedCrc32 = u32(view, cursor + 16);
    const compressedSize = u32(view, cursor + 20);
    const uncompressedSize = u32(view, cursor + 24);
    const nameLength = u16(view, cursor + 28);
    const extraLength = u16(view, cursor + 30);
    const commentLength = u16(view, cursor + 32);
    const externalAttributes = u32(view, cursor + 38);
    const localHeaderOffset = u32(view, cursor + 42);
    const variableEnd = cursor + 46 + nameLength + extraLength + commentLength;
    if (variableEnd > directoryOffset + directorySize) throw new Error("This ZIP directory entry is truncated.");
    if (flags & 0x41) throw new Error("Encrypted ZIP entries are not supported.");
    if (methodValue !== 0 && methodValue !== 8) throw new Error("This ZIP uses an unsupported compression method.");
    if (compressedSize === 0xffffffff || uncompressedSize === 0xffffffff || localHeaderOffset === 0xffffffff) {
      throw new Error("ZIP64 entries are not supported by this local analyzer yet.");
    }
    const rawName = bytes.subarray(cursor + 46, cursor + 46 + nameLength);
    const name = new TextDecoder((flags & 0x0800) !== 0 ? "utf-8" : "windows-1252").decode(rawName);
    if (!name || isUnsafeArchivePath(name)) throw new Error("This ZIP contains an unsafe file path.");
    if (localHeaderOffset >= directoryOffset || localHeaderOffset + 30 > directoryOffset) {
      throw new Error("This ZIP has an invalid local file header offset.");
    }
    if (u32(view, localHeaderOffset) !== 0x04034b50) throw new Error("This ZIP has a damaged local file header.");
    const localFlags = u16(view, localHeaderOffset + 6);
    const localMethod = u16(view, localHeaderOffset + 8);
    const localNameLength = u16(view, localHeaderOffset + 26);
    const localExtraLength = u16(view, localHeaderOffset + 28);
    if (localFlags !== flags || localMethod !== methodValue) throw new Error("This ZIP has mismatched local and central headers.");
    const localNameStart = localHeaderOffset + 30;
    const localNameEnd = localNameStart + localNameLength;
    const dataStart = localNameEnd + localExtraLength;
    const dataEnd = dataStart + compressedSize;
    if (dataStart > directoryOffset || dataEnd > directoryOffset || dataEnd < dataStart) {
      throw new Error("This ZIP has a file payload outside its data area.");
    }
    const localName = new TextDecoder((localFlags & 0x0800) !== 0 ? "utf-8" : "windows-1252")
      .decode(bytes.subarray(localNameStart, localNameEnd));
    if (localName !== name) throw new Error("This ZIP has mismatched local and central filenames.");
    localRanges.push({ start: localHeaderOffset, end: dataEnd });
    if (seenNames.has(name)) throw new Error("This ZIP contains duplicate file paths.");
    seenNames.add(name);
    const isDirectory = name.endsWith("/");
    const unixMode = externalAttributes >>> 16;
    const createdOnUnix = (madeBy >>> 8) === 3;
    if (createdOnUnix && (unixMode & 0xf000) === 0xa000) throw new Error("Symbolic links are not accepted in ZIP archives.");
    if (uncompressedSize > maxTrackBytes && !isDirectory) throw new Error(`An archive entry exceeds the per-file limit of ${Math.round(maxTrackBytes / 1024 / 1024)} MB.`);
    if (!isDirectory) {
      totalUncompressedBytes += uncompressedSize;
      if (totalUncompressedBytes > maxExpandedBytes) throw new Error("This ZIP expands beyond the safe batch-size limit.");
      if (uncompressedSize > 1024 * 1024 && compressedSize > 0 && uncompressedSize / compressedSize > 250) {
        throw new Error("This ZIP contains an unusually high compression ratio and was rejected for safety.");
      }
      if (uncompressedSize > 0 && compressedSize === 0) throw new Error("This ZIP has an invalid zero-size compressed entry.");
    }
    entries.push({ name, compressedSize, uncompressedSize, crc32: expectedCrc32, method: methodValue as 0 | 8, localHeaderOffset, isDirectory });
    cursor = variableEnd;
  }
  if (cursor !== directoryOffset + directorySize) throw new Error("This ZIP directory has unexpected trailing data.");
  localRanges.sort((a, b) => a.start - b.start);
  for (let index = 1; index < localRanges.length; index += 1) {
    if (localRanges[index]!.start < localRanges[index - 1]!.end) {
      throw new Error("This ZIP contains overlapping file payloads.");
    }
  }
  return { entries, totalUncompressedBytes };
}

/** IEEE CRC-32 used by ZIP central directory entries. */
export function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc & 1) !== 0 ? (crc >>> 1) ^ 0xedb88320 : crc >>> 1;
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

export function csvCell(value: unknown): string {
  let text = value == null ? "" : Array.isArray(value) ? value.join("; ") : typeof value === "object" ? JSON.stringify(value) : String(value);
  // Prefix spreadsheet formula-like input so a song title/artist cannot become a formula on open.
  if (/^[\s]*[=+@]/.test(text) || /^[\s]*-[0-9]/.test(text)) text = "'" + text;
  return '"' + text.replace(/"/g, '""') + '"';
}

export function songsToCsv(rows: ReadonlyArray<Record<string, unknown>>): string {
  if (!rows.length) return "";
  const columns = [
    "filename", "title", "artist", "album", "genre", "sub_style", "style_influences", "language",
    "tempo_bpm", "tempo_band", "key", "energy", "mood", "theme", "setting", "source_role",
    "vocals", "vocal_delivery", "vocal_register", "vocal_harmony", "performance_technique", "instruments",
    "production_traits", "arrangement", "duration_seconds", "file_size_bytes", "codec", "sample_rate_hz", "channels",
    "pitch_lowest_note", "pitch_highest_note", "pitch_range_semitones", "transient_density_per_second",
    "spectral_centroid_mean_hz", "low_energy_ratio_mean", "mid_energy_ratio_mean", "high_energy_ratio_mean",
    "chord_estimates", "section_boundaries", "labels_reviewed", "reviewer", "annotation_notes",
    "uses_remote_api", "uses_hosted_model", "analysis_status", "warnings",
  ];
  return [
    columns.map(csvCell).join(","),
    ...rows.map((row) => columns.map((column) => csvCell(row[column])).join(",")),
  ].join("\r\n");
}
