/** Bounded font-directory inspection; no font code runs and no external requests are made. */
export interface StudioFontMetadata {
  format: "truetype" | "opentype" | "woff" | "woff2" | "unknown";
  hasVariations: boolean;
  /** CSS @font-face / FontFace weight descriptor. Static faces must not claim every weight. */
  weightRange: string;
  defaultWeight: number;
  /** False for compressed variation metadata that cannot be inspected synchronously. */
  exactWeightRange: boolean;
}

type FontInput = string | Uint8Array | ArrayBuffer;
const MAX_FONT_BYTES = 4 * 1024 * 1024;
const UNKNOWN: StudioFontMetadata = Object.freeze({ format: "unknown", hasVariations: false, weightRange: "400", defaultWeight: 400, exactWeightRange: false });
const fontMetadataCache = new Map<string, StudioFontMetadata>();
const tag = (value: string) => [...value].reduce((result, character) => result * 256 + character.charCodeAt(0), 0);
const FVAR = tag("fvar"), OS2 = tag("OS/2"), WEIGHT = tag("wght");

function bytesFrom(input: FontInput): Uint8Array | null {
  if (input instanceof Uint8Array) return input.byteLength <= MAX_FONT_BYTES ? input : null;
  if (input instanceof ArrayBuffer) return input.byteLength <= MAX_FONT_BYTES ? new Uint8Array(input) : null;
  if (input.length > Math.ceil(MAX_FONT_BYTES / 3) * 4 + 512) return null;
  const comma = input.indexOf(",");
  if (comma < 0 || !/^data:[^,]*;base64$/i.test(input.slice(0, comma))) return null;
  const encoded = input.slice(comma + 1).replace(/\s/g, "");
  if (!/^[a-z\d+/]*={0,2}$/i.test(encoded) || encoded.length % 4 === 1) return null;
  try {
    const binary = atob(encoded);
    if (binary.length > MAX_FONT_BYTES) return null;
    return Uint8Array.from(binary, character => character.charCodeAt(0));
  } catch { return null; }
}

interface Table { offset: number; length: number; compressed: boolean }
function readFont(bytes: Uint8Array): StudioFontMetadata {
  if (bytes.byteLength < 12) return UNKNOWN;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const signature = view.getUint32(0), tables = new Map<number, Table>();
  let format: StudioFontMetadata["format"] = "unknown";
  const add = (name: number, offset: number, length: number, compressed = false) => {
    if (length > 0 && offset >= 0 && offset <= bytes.length && length <= bytes.length - offset) tables.set(name, { offset, length, compressed });
  };
  if (signature === 0x00010000 || signature === tag("true") || signature === tag("OTTO")) {
    format = signature === tag("OTTO") ? "opentype" : "truetype";
    const count = view.getUint16(4);
    if (count < 1 || count > 512 || 12 + count * 16 > bytes.length) return UNKNOWN;
    for (let index = 0; index < count; index++) {
      const entry = 12 + index * 16;
      add(view.getUint32(entry), view.getUint32(entry + 8), view.getUint32(entry + 12));
    }
  } else if (signature === tag("wOFF")) {
    if (bytes.length < 44) return UNKNOWN;
    format = "woff";
    const count = view.getUint16(12);
    if (count < 1 || count > 512 || 44 + count * 20 > bytes.length || view.getUint32(8) !== bytes.length) return UNKNOWN;
    for (let index = 0; index < count; index++) {
      const entry = 44 + index * 20, compressedLength = view.getUint32(entry + 8), originalLength = view.getUint32(entry + 12);
      if (compressedLength > originalLength) continue;
      add(view.getUint32(entry), view.getUint32(entry + 4), compressedLength, compressedLength !== originalLength);
    }
  } else if (signature === tag("wOF2")) {
    if (bytes.length < 48 || view.getUint32(8) !== bytes.length) return UNKNOWN;
    format = "woff2";
    const count = view.getUint16(12);
    if (count < 1 || count > 512) return UNKNOWN;
    // WOFF2 table bytes share a Brotli stream. Directory tags can establish variation,
    // but cannot prove that its axes include wght or reveal its supported weight range.
    let cursor = 48, hasVariations = false;
    function base128(): number | null {
      let value = 0;
      for (let byteIndex = 0; byteIndex < 5; byteIndex++) {
        if (cursor >= bytes.length) return null;
        const byte = bytes[cursor++];
        if (byteIndex === 0 && byte === 0x80 || value > 0x01ffffff) return null;
        value = value * 128 + (byte & 0x7f);
        if (!(byte & 0x80)) return value;
      }
      return null;
    }
    for (let index = 0; index < count; index++) {
      if (cursor >= bytes.length) return UNKNOWN;
      const flags = bytes[cursor++], knownTag = flags & 63, transform = flags >> 6;
      let name = knownTag === 47 ? FVAR : 0;
      if (knownTag === 63) {
        if (cursor + 4 > bytes.length) return UNKNOWN;
        name = view.getUint32(cursor); cursor += 4;
      }
      if (base128() === null) return UNKNOWN;
      const transformed = knownTag === 10 || knownTag === 11 ? transform !== 3 : transform !== 0;
      if (transformed && base128() === null) return UNKNOWN;
      if (name === FVAR) hasVariations = true;
    }
    return { format, hasVariations, weightRange: "400", defaultWeight: 400, exactWeightRange: !hasVariations };
  } else return UNKNOWN;

  const os2 = tables.get(OS2);
  let defaultWeight = 400;
  if (os2 && !os2.compressed && os2.length >= 6) {
    const weight = view.getUint16(os2.offset + 4);
    if (weight >= 1 && weight <= 1000) defaultWeight = weight;
  }
  const result: StudioFontMetadata = { format, hasVariations: false, weightRange: String(defaultWeight), defaultWeight, exactWeightRange: true };
  const variation = tables.get(FVAR);
  if (!variation) return result;
  result.hasVariations = true;
  if (variation.compressed || variation.length < 16) return { ...result, exactWeightRange: false };
  const offset = variation.offset, axisOffset = view.getUint16(offset + 4), axisCount = view.getUint16(offset + 8), axisSize = view.getUint16(offset + 10);
  if (view.getUint16(offset) !== 1 || axisOffset < 16 || axisCount > 64 || axisSize < 20 || axisOffset + axisCount * axisSize > variation.length) return { ...result, exactWeightRange: false };
  for (let index = 0; index < axisCount; index++) {
    const axis = offset + axisOffset + index * axisSize;
    if (view.getUint32(axis) !== WEIGHT) continue;
    const min = view.getInt32(axis + 4) / 65536, normal = view.getInt32(axis + 8) / 65536, max = view.getInt32(axis + 12) / 65536;
    if (min < 1 || max > 1000 || min > normal || normal > max) return { ...result, exactWeightRange: false };
    result.defaultWeight = normal;
    result.weightRange = min === max ? String(min) : `${min} ${max}`;
    return result;
  }
  // Width/optical-size axes alone must not suppress browser synthesis of bold text.
  return result;
}

export function studioFontMetadata(input: FontInput): StudioFontMetadata {
  if (typeof input === "string") {
    const cached = fontMetadataCache.get(input);
    if (cached) return cached;
  }
  const bytes = bytesFrom(input), metadata = bytes ? Object.freeze(readFont(bytes)) : UNKNOWN;
  if (typeof input === "string" && input.length <= Math.ceil(MAX_FONT_BYTES / 3) * 4 + 512) {
    fontMetadataCache.set(input, metadata);
    if (fontMetadataCache.size > 16) fontMetadataCache.delete(fontMetadataCache.keys().next().value!);
  }
  return metadata;
}

/** Unknown or compressed ranges deliberately stay static so synthetic bold remains available. */
export function studioFontWeightRange(input: FontInput): string { return studioFontMetadata(input).weightRange; }
