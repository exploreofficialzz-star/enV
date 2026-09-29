type MetadataValue = string | number | boolean | null;

const EXIF_TAGS: Record<number, string> = {
  0x010e: "ImageDescription",
  0x010f: "Make",
  0x0110: "Model",
  0x0112: "Orientation",
  0x011a: "XResolution",
  0x011b: "YResolution",
  0x011c: "PlanarConfiguration",
  0x0128: "ResolutionUnit",
  0x0131: "Software",
  0x0132: "DateTime",
  0x013b: "Artist",
  0x8298: "Copyright",
  0x8825: "GPSInfoIFDPointer",
  0x9003: "DateTimeOriginal",
  0x9286: "UserComment",
  0xa001: "ColorSpace",
  0xa002: "PixelXDimension",
  0xa003: "PixelYDimension",
  0xa420: "ImageUniqueID",
};

function readAscii(bytes: Uint8Array, offset: number, length: number) {
  const end = Math.min(bytes.length, offset + length);
  let value = "";
  for (let i = offset; i < end; i++) value += String.fromCharCode(bytes[i]);
  return value.replace(/\0+$/, "").trim();
}

function readTiffValue(view: DataView, base: number, type: number, count: number, inlineOffset: number, valueOffset: number, little: boolean): MetadataValue {
  const typeSizes: Record<number, number> = { 1: 1, 2: 1, 3: 2, 4: 4, 5: 8, 7: 1, 9: 4, 10: 8 };
  const size = (typeSizes[type] ?? 0) * count;
  const offset = size <= 4 ? inlineOffset : base + valueOffset;
  if (offset < 0 || offset >= view.byteLength) return null;
  try {
    if (type === 2 || type === 7) return readAscii(new Uint8Array(view.buffer, view.byteOffset, view.byteLength), offset, count);
    if (type === 1) return view.getUint8(offset);
    if (type === 3) return count === 1 ? view.getUint16(offset, little) : Array.from({ length: Math.min(count, 16) }, (_, i) => view.getUint16(offset + i * 2, little)).join(",");
    if (type === 4) return count === 1 ? view.getUint32(offset, little) : Array.from({ length: Math.min(count, 16) }, (_, i) => view.getUint32(offset + i * 4, little)).join(",");
    if (type === 5) {
      const numerator = view.getUint32(offset, little);
      const denominator = view.getUint32(offset + 4, little);
      return denominator === 0 ? null : numerator / denominator;
    }
    if (type === 9) return view.getInt32(offset, little);
    if (type === 10) {
      const numerator = view.getInt32(offset, little);
      const denominator = view.getInt32(offset + 4, little);
      return denominator === 0 ? null : numerator / denominator;
    }
  } catch {
    return null;
  }
  return null;
}

function parseExif(view: DataView, tiffStart: number, tiffLength: number) {
  const tags: Record<string, MetadataValue> = {};
  if (tiffLength < 8) return tags;
  const byte0 = view.getUint8(tiffStart);
  const byte1 = view.getUint8(tiffStart + 1);
  const little = byte0 === 0x49 && byte1 === 0x49;
  if (!little && !(byte0 === 0x4d && byte1 === 0x4d)) return tags;
  if (view.getUint16(tiffStart + 2, little) !== 42) return tags;
  const ifdOffset = view.getUint32(tiffStart + 4, little);
  const ifd = tiffStart + ifdOffset;
  if (ifd < tiffStart || ifd + 2 > view.byteLength) return tags;
  const count = Math.min(view.getUint16(ifd, little), 1024);
  for (let i = 0; i < count; i++) {
    const entry = ifd + 2 + i * 12;
    if (entry + 12 > view.byteLength) break;
    const tag = view.getUint16(entry, little);
    const type = view.getUint16(entry + 2, little);
    const valueCount = view.getUint32(entry + 4, little);
    const raw = view.getUint32(entry + 8, little);
    const value = readTiffValue(view, tiffStart, type, valueCount, entry + 8, raw, little);
    const resolved = value ?? (type === 4 ? raw : null);
    const name = EXIF_TAGS[tag] ?? `EXIF 0x${tag.toString(16).padStart(4, "0")}`;
    tags[name] = resolved;
  }
  return tags;
}

async function inspectJpeg(file: File) {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const tags: Record<string, MetadataValue> = {};
  let offset = 2;
  let orientation: number | null = null;
  let colorSpace: string | null = null;
  while (offset + 4 <= bytes.length) {
    if (bytes[offset] !== 0xff) { offset++; continue; }
    const marker = bytes[offset + 1];
    if (marker === 0xd9 || marker === 0xda) break;
    const length = view.getUint16(offset + 2, false);
    if (length < 2 || offset + 2 + length > bytes.length) break;
    if (marker === 0xe1 && length >= 8 && readAscii(bytes, offset + 4, 6) === "Exif") {
      const parsed = parseExif(view, offset + 10, length - 8);
      Object.assign(tags, parsed);
      if (typeof parsed.Orientation === "number") orientation = parsed.Orientation;
      if (typeof parsed.ColorSpace === "number") colorSpace = parsed.ColorSpace === 1 ? "sRGB" : String(parsed.ColorSpace);
    } else if (marker === 0xe1) {
      const xmp = readAscii(bytes, offset + 4, Math.min(length - 2, 4096));
      if (xmp.includes("xmpmeta")) tags.XMP = "Embedded XMP packet present";
    } else if (marker === 0xed) {
      tags.IPTC = "IPTC APP13 segment present";
    } else if (marker === 0xe2) {
      const icc = readAscii(bytes, offset + 4, Math.min(length - 2, 256));
      if (icc.includes("ICC_PROFILE")) tags.ICC = "Embedded ICC profile present";
    }
    offset += 2 + length;
  }
  return { tags, orientation, colorSpace };
}

async function inspectPng(file: File) {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const tags: Record<string, MetadataValue> = {};
  let offset = 8;
  while (offset + 12 <= bytes.length) {
    const length = view.getUint32(offset, false);
    const type = readAscii(bytes, offset + 4, 4);
    if (type === "tEXt" || type === "zTXt" || type === "iTXt") tags[`PNG:${type}`] = "Text metadata chunk present";
    if (type === "pHYs" && length >= 9) {
      const x = view.getUint32(offset + 8, false);
      const y = view.getUint32(offset + 12, false);
      const unit = view.getUint8(offset + 16);
      if (unit === 1) {
        tags.PPI = `${Math.round(x / 39.37007874)} × ${Math.round(y / 39.37007874)}`;
      }
    }
    if (type === "IEND") break;
    offset += 12 + length;
  }
  return { tags };
}

export async function inspectImageMetadata(file: File, mime: string) {
  let tags: Record<string, MetadataValue> = {};
  let orientation: number | null = null;
  let colorSpace: string | null = null;
  let hasAlpha: boolean | null = null;
  let animated: boolean | null = null;
  let bitDepth: number | null = null;
  try {
    if (mime === "image/jpeg") {
      const parsed = await inspectJpeg(file);
      tags = parsed.tags;
      orientation = parsed.orientation;
      colorSpace = parsed.colorSpace;
      hasAlpha = false;
    } else if (mime === "image/png") {
      const parsed = await inspectPng(file);
      tags = parsed.tags;
      hasAlpha = true;
      const header = new Uint8Array(await file.slice(24, 26).arrayBuffer());
      if (header.length === 2) bitDepth = header[0];
    } else if (mime === "image/gif") {
      const header = new Uint8Array(await file.slice(0, 13).arrayBuffer());
      animated = header.length >= 6 ? true : null;
      hasAlpha = true;
    }
  } catch {
    // Metadata is supplementary; decoding can still succeed.
  }
  return { tags, orientation, colorSpace, hasAlpha, animated, bitDepth };
}

export async function stripJpegMetadata(file: File): Promise<Blob> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (!(bytes[0] === 0xff && bytes[1] === 0xd8)) return file.slice(0, file.size, file.type || "application/octet-stream");
  const parts: Uint8Array[] = [bytes.slice(0, 2)];
  let offset = 2;
  while (offset + 4 <= bytes.length) {
    if (bytes[offset] !== 0xff) break;
    const marker = bytes[offset + 1];
    if (marker === 0xda || marker === 0xd9) {
      parts.push(bytes.slice(offset));
      offset = bytes.length;
      break;
    }
    const length = new DataView(bytes.buffer, bytes.byteOffset + offset + 2, 2).getUint16(0, false);
    if (length < 2 || offset + 2 + length > bytes.length) break;
    const strip = marker === 0xe1 || marker === 0xed || marker === 0xe4 || marker === 0xe5 || marker === 0xe6 || marker === 0xe7 || marker === 0xe8 || marker === 0xe9 || marker === 0xea || marker === 0xeb || marker === 0xec || marker === 0xee;
    if (!strip) parts.push(bytes.slice(offset, offset + 2 + length));
    offset += 2 + length;
  }
  if (offset !== bytes.length) parts.push(bytes.slice(offset));
  return new Blob(parts.map((part) => part.buffer.slice(part.byteOffset, part.byteOffset + part.byteLength) as ArrayBuffer), { type: "image/jpeg" });
}

export async function stripPngMetadata(file: File): Promise<Blob> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (!(bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47)) return file;
  const chunks: Uint8Array[] = [bytes.slice(0, 8)];
  const removable = new Set(["tEXt", "zTXt", "iTXt", "eXIf", "iCCP", "pHYs"]);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let offset = 8;
  while (offset + 12 <= bytes.length) {
    const length = view.getUint32(offset, false);
    const type = readAscii(bytes, offset + 4, 4);
    if (offset + 12 + length > bytes.length) break;
    if (!removable.has(type)) chunks.push(bytes.slice(offset, offset + 12 + length));
    offset += 12 + length;
    if (type === "IEND") break;
  }
  return new Blob(chunks.map((chunk) => chunk.buffer.slice(chunk.byteOffset, chunk.byteOffset + chunk.byteLength) as ArrayBuffer), { type: "image/png" });
}

export async function stripMetadata(file: File): Promise<Blob> {
  const mime = file.type.toLowerCase();
  if (mime === "image/jpeg") return stripJpegMetadata(file);
  if (mime === "image/png") return stripPngMetadata(file);
  throw new Error(`Metadata removal is not configured for ${mime || "this image format"}. The file is left untouched rather than silently claiming metadata was removed.`);
}
