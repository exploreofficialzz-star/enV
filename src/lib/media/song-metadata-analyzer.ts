export const SONG_ANALYZER_LIMITS = {
  maxTracks: 50,
  maxTrackBytes: 50 * 1024 * 1024,
  maxBatchBytes: 200 * 1024 * 1024,
  maxZipBytes: 100 * 1024 * 1024,
  maxExpandedBytes: 200 * 1024 * 1024,
  maxZipEntries: 500,
} as const;

export type TempoBand = "slow" | "mid" | "upbeat" | "fast" | "unknown";

export interface ZipEntryHeader {
  name: string;
  compressedSize: number;
  uncompressedSize: number;
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
  return normalized.startsWith("/") ||
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
  let cursor = directoryOffset;
  let totalUncompressedBytes = 0;
  for (let index = 0; index < totalEntries; index += 1) {
    if (u32(view, cursor) !== 0x02014b50) throw new Error("This ZIP contains a damaged directory entry.");
    const madeBy = u16(view, cursor + 4);
    const flags = u16(view, cursor + 8);
    const methodValue = u16(view, cursor + 10);
    const compressedSize = u32(view, cursor + 20);
    const uncompressedSize = u32(view, cursor + 24);
    const nameLength = u16(view, cursor + 28);
    const extraLength = u16(view, cursor + 30);
    const commentLength = u16(view, cursor + 32);
    const externalAttributes = u32(view, cursor + 38);
    const localHeaderOffset = u32(view, cursor + 42);
    const variableEnd = cursor + 46 + nameLength + extraLength + commentLength;
    if (variableEnd > directoryOffset + directorySize) throw new Error("This ZIP directory entry is truncated.");
    if (flags & 1) throw new Error("Password-protected ZIP files are not supported.");
    if (methodValue !== 0 && methodValue !== 8) throw new Error("This ZIP uses an unsupported compression method.");
    if (compressedSize === 0xffffffff || uncompressedSize === 0xffffffff || localHeaderOffset === 0xffffffff) {
      throw new Error("ZIP64 entries are not supported by this local analyzer yet.");
    }
    const rawName = bytes.subarray(cursor + 46, cursor + 46 + nameLength);
    const name = new TextDecoder((flags & 0x0800) !== 0 ? "utf-8" : "windows-1252").decode(rawName);
    if (!name || isUnsafeArchivePath(name)) throw new Error("This ZIP contains an unsafe file path.");
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
    entries.push({ name, compressedSize, uncompressedSize, method: methodValue as 0 | 8, localHeaderOffset, isDirectory });
    cursor = variableEnd;
  }
  if (cursor !== directoryOffset + directorySize) throw new Error("This ZIP directory has unexpected trailing data.");
  return { entries, totalUncompressedBytes };
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
    "filename", "title", "artist", "album", "genre", "sub_style", "language",
    "tempo_bpm", "tempo_band", "key", "energy", "mood", "theme", "setting",
    "vocals", "instruments", "duration_seconds", "file_size_bytes", "codec", "sample_rate_hz", "channels", "analysis_status", "warnings",
  ];
  return [
    columns.map(csvCell).join(","),
    ...rows.map((row) => columns.map((column) => csvCell(row[column])).join(",")),
  ].join("\r\n");
}
