import { crc32 } from "./crc32.ts";

/**
 * Metadata reading and lossless cleaning for JPEG, PNG and WebP.
 * Reads IFD0, the Exif and GPS sub-IFDs, XMP/IPTC/ICC presence, density (DPI) and embedded thumbnails,
 * and removes metadata by rewriting container segments — pixels are never re-encoded.
 * Everything is defensive: malformed input yields a partial report, never an exception.
 */

export type MetaSensitivity = "location" | "identity" | "device" | "timestamp" | "technical";
export type MetaGroup = "Location" | "Camera & lens" | "Capture settings" | "Date & time" | "Author & rights" | "Software" | "Image" | "Color profile" | "Embedded data";

export interface MetaEntry { group: MetaGroup; label: string; value: string; sensitivity: MetaSensitivity }

export interface MetaSegment { name: string; bytes: number; sensitive: boolean; note?: string }

export interface MetadataReport {
  format: "jpeg" | "png" | "webp" | "gif" | "unknown";
  entries: MetaEntry[];
  segments: MetaSegment[];
  orientation: number | null;
  density: { x: number; y: number; unit: "dpi"; source: string } | null;
  gps: { lat: number; lon: number; altitude: number | null } | null;
  hasExif: boolean; hasXmp: boolean; hasIptc: boolean; hasIcc: boolean; hasThumbnail: boolean;
  trailingBytes: number;
  animated: boolean;
  hasAlphaChannel: boolean | null;
  dimensions: { width: number; height: number } | null;
}

const TYPE_SIZE = [0, 1, 1, 2, 4, 8, 1, 1, 2, 4, 8, 4, 8];

type TagDef = { name: string; group: MetaGroup; sensitivity: MetaSensitivity; fmt?: (v: TagValue) => string };
type TagValue = number | string | number[];

const num = (v: TagValue): number => (Array.isArray(v) ? v[0] : typeof v === "number" ? v : Number(v));
const ENUMS: Record<string, Record<number, string>> = {
  Orientation: { 1: "Normal", 2: "Mirrored horizontally", 3: "Rotated 180°", 4: "Mirrored vertically", 5: "Mirrored + rotated 90° CW", 6: "Rotated 90° CW", 7: "Mirrored + rotated 90° CCW", 8: "Rotated 90° CCW" },
  ExposureProgram: { 0: "Not defined", 1: "Manual", 2: "Program", 3: "Aperture priority", 4: "Shutter priority", 5: "Creative", 6: "Action", 7: "Portrait", 8: "Landscape" },
  MeteringMode: { 0: "Unknown", 1: "Average", 2: "Center-weighted", 3: "Spot", 4: "Multi-spot", 5: "Pattern", 6: "Partial" },
  WhiteBalance: { 0: "Auto", 1: "Manual" },
  ColorSpace: { 1: "sRGB", 65535: "Uncalibrated" },
  ResolutionUnit: { 1: "None", 2: "Inches", 3: "Centimetres" },
  SceneCaptureType: { 0: "Standard", 1: "Landscape", 2: "Portrait", 3: "Night" },
};
const en = (name: string) => (v: TagValue) => ENUMS[name][num(v)] ?? String(num(v));
const fixed = (digits: number, suffix = "") => (v: TagValue) => `${Number(num(v).toFixed(digits))}${suffix}`;
const exposureTime = (v: TagValue) => { const t = num(v); return t > 0 && t < 1 ? `1/${Math.round(1 / t)} s` : `${Number(t.toFixed(2))} s`; };
const flash = (v: TagValue) => (num(v) & 1 ? "Flash fired" : "Flash did not fire");
const version = (v: TagValue) => (typeof v === "string" ? v : Array.isArray(v) ? v.map((c) => String.fromCharCode(c)).join("") : String(v));

const IFD0: Record<number, TagDef> = {
  0x010e: { name: "Description", group: "Author & rights", sensitivity: "identity" },
  0x010f: { name: "Camera make", group: "Camera & lens", sensitivity: "device" },
  0x0110: { name: "Camera model", group: "Camera & lens", sensitivity: "device" },
  0x0112: { name: "Orientation", group: "Image", sensitivity: "technical", fmt: en("Orientation") },
  0x011a: { name: "X resolution", group: "Image", sensitivity: "technical", fmt: fixed(0) },
  0x011b: { name: "Y resolution", group: "Image", sensitivity: "technical", fmt: fixed(0) },
  0x0128: { name: "Resolution unit", group: "Image", sensitivity: "technical", fmt: en("ResolutionUnit") },
  0x0131: { name: "Software", group: "Software", sensitivity: "device" },
  0x0132: { name: "Modified", group: "Date & time", sensitivity: "timestamp" },
  0x013b: { name: "Artist", group: "Author & rights", sensitivity: "identity" },
  0x8298: { name: "Copyright", group: "Author & rights", sensitivity: "identity" },
};
const EXIF: Record<number, TagDef> = {
  0x829a: { name: "Exposure time", group: "Capture settings", sensitivity: "technical", fmt: exposureTime },
  0x829d: { name: "Aperture", group: "Capture settings", sensitivity: "technical", fmt: (v) => `f/${Number(num(v).toFixed(1))}` },
  0x8822: { name: "Exposure program", group: "Capture settings", sensitivity: "technical", fmt: en("ExposureProgram") },
  0x8827: { name: "ISO", group: "Capture settings", sensitivity: "technical", fmt: (v) => `ISO ${num(v)}` },
  0x9000: { name: "Exif version", group: "Image", sensitivity: "technical", fmt: version },
  0x9003: { name: "Taken", group: "Date & time", sensitivity: "timestamp" },
  0x9004: { name: "Digitized", group: "Date & time", sensitivity: "timestamp" },
  0x9010: { name: "Time zone offset", group: "Date & time", sensitivity: "timestamp" },
  0x9011: { name: "Time zone offset (taken)", group: "Date & time", sensitivity: "timestamp" },
  0x9204: { name: "Exposure bias", group: "Capture settings", sensitivity: "technical", fmt: (v) => `${num(v) > 0 ? "+" : ""}${Number(num(v).toFixed(2))} EV` },
  0x9207: { name: "Metering mode", group: "Capture settings", sensitivity: "technical", fmt: en("MeteringMode") },
  0x9209: { name: "Flash", group: "Capture settings", sensitivity: "technical", fmt: flash },
  0x920a: { name: "Focal length", group: "Capture settings", sensitivity: "technical", fmt: fixed(1, " mm") },
  0x9286: { name: "User comment", group: "Author & rights", sensitivity: "identity" },
  0xa001: { name: "Color space", group: "Color profile", sensitivity: "technical", fmt: en("ColorSpace") },
  0xa002: { name: "Pixel width", group: "Image", sensitivity: "technical" },
  0xa003: { name: "Pixel height", group: "Image", sensitivity: "technical" },
  0xa403: { name: "White balance", group: "Capture settings", sensitivity: "technical", fmt: en("WhiteBalance") },
  0xa405: { name: "Focal length (35 mm equiv.)", group: "Capture settings", sensitivity: "technical", fmt: fixed(0, " mm") },
  0xa406: { name: "Scene type", group: "Capture settings", sensitivity: "technical", fmt: en("SceneCaptureType") },
  0xa420: { name: "Unique image ID", group: "Author & rights", sensitivity: "identity" },
  0xa430: { name: "Camera owner", group: "Author & rights", sensitivity: "identity" },
  0xa431: { name: "Camera serial number", group: "Camera & lens", sensitivity: "identity" },
  0xa433: { name: "Lens make", group: "Camera & lens", sensitivity: "device" },
  0xa434: { name: "Lens model", group: "Camera & lens", sensitivity: "device" },
  0xa435: { name: "Lens serial number", group: "Camera & lens", sensitivity: "identity" },
};

interface Entry { tag: number; type: number; count: number; valueAt: number }
interface Ifd { entries: Entry[]; next: number; countAt: number }

function readIfd(view: DataView, tiff: number, offset: number, little: boolean): Ifd | null {
  const at = tiff + offset;
  if (offset < 8 || at + 2 > view.byteLength) return null;
  const n = Math.min(view.getUint16(at, little), 512);
  const entries: Entry[] = [];
  for (let i = 0; i < n; i++) {
    const e = at + 2 + i * 12;
    if (e + 12 > view.byteLength) break;
    const type = view.getUint16(e + 2, little);
    const count = view.getUint32(e + 4, little);
    const size = (TYPE_SIZE[type] ?? 0) * count;
    const valueAt = size <= 4 ? e + 8 : tiff + view.getUint32(e + 8, little);
    if (valueAt < 0 || valueAt + size > view.byteLength) continue;
    entries.push({ tag: view.getUint16(e, little), type, count, valueAt });
  }
  const nextAt = at + 2 + n * 12;
  return { entries, next: nextAt + 4 <= view.byteLength ? view.getUint32(nextAt, little) : 0, countAt: at };
}

function readValue(view: DataView, e: Entry, little: boolean): TagValue | null {
  const { type, count, valueAt: at } = e;
  try {
    if (type === 2) { let s = ""; for (let i = 0; i < count; i++) { const c = view.getUint8(at + i); if (c === 0) break; s += String.fromCharCode(c); } return s.trim(); }
    if (type === 7 || type === 1) { const out: number[] = []; for (let i = 0; i < Math.min(count, 64); i++) out.push(view.getUint8(at + i)); return out.length === 1 ? out[0] : out; }
    const out: number[] = [];
    const cap = Math.min(count, 32);
    for (let i = 0; i < cap; i++) {
      switch (type) {
        case 3: out.push(view.getUint16(at + i * 2, little)); break;
        case 4: out.push(view.getUint32(at + i * 4, little)); break;
        case 5: { const d = view.getUint32(at + i * 8 + 4, little); out.push(d ? view.getUint32(at + i * 8, little) / d : 0); break; }
        case 8: out.push(view.getInt16(at + i * 2, little)); break;
        case 9: out.push(view.getInt32(at + i * 4, little)); break;
        case 10: { const d = view.getInt32(at + i * 8 + 4, little); out.push(d ? view.getInt32(at + i * 8, little) / d : 0); break; }
        case 11: out.push(view.getFloat32(at + i * 4, little)); break;
        case 12: out.push(view.getFloat64(at + i * 8, little)); break;
        default: return null;
      }
    }
    return out.length === 1 ? out[0] : out;
  } catch { return null; }
}

const asText = (v: TagValue) => (Array.isArray(v) ? v.map((x) => Number(x.toFixed?.(4) ?? x)).join(", ") : typeof v === "number" ? String(Number(v.toFixed(4))) : v);

function dmsToDecimal(v: TagValue, ref: string): number | null {
  if (!Array.isArray(v) || v.length < 3) return null;
  const dec = v[0] + v[1] / 60 + v[2] / 3600;
  return /[SW]/i.test(ref) ? -dec : dec;
}

interface ExifResult { entries: MetaEntry[]; orientation: number | null; gps: MetadataReport["gps"]; hasThumbnail: boolean; density: { x: number; y: number; unit: number } | null; gpsIfd: { at: number; entries: Entry[] } | null; width?: number; height?: number }

function parseTiff(bytes: Uint8Array, start: number, end: number): ExifResult {
  const result: ExifResult = { entries: [], orientation: null, gps: null, hasThumbnail: false, density: null, gpsIfd: null };
  if (end - start < 8) return result;
  const view = new DataView(bytes.buffer, bytes.byteOffset + start, end - start);
  const little = view.getUint8(0) === 0x49;
  if (!little && view.getUint8(0) !== 0x4d) return result;
  if (view.getUint16(2, little) !== 42) return result;
  const ifd0 = readIfd(view, 0, view.getUint32(4, little), little);
  if (!ifd0) return result;
  let exifPtr = 0, gpsPtr = 0;
  let xRes = 0, yRes = 0, resUnit = 2;
  for (const e of ifd0.entries) {
    if (e.tag === 0x8769) { exifPtr = Number(readValue(view, e, little)); continue; }
    if (e.tag === 0x8825) { gpsPtr = Number(readValue(view, e, little)); continue; }
    const def = IFD0[e.tag]; const v = readValue(view, e, little);
    if (!def || v === null || v === "") continue;
    if (e.tag === 0x0112) result.orientation = num(v);
    if (e.tag === 0x011a) xRes = num(v);
    if (e.tag === 0x011b) yRes = num(v);
    if (e.tag === 0x0128) resUnit = num(v);
    result.entries.push({ group: def.group, label: def.name, value: def.fmt ? def.fmt(v) : asText(v), sensitivity: def.sensitivity });
  }
  if (xRes && yRes) result.density = { x: xRes, y: yRes, unit: resUnit };
  if (exifPtr) {
    const sub = readIfd(view, 0, exifPtr, little);
    for (const e of sub?.entries ?? []) {
      if (e.tag === 0x927c) { result.entries.push({ group: "Embedded data", label: "Maker note", value: `${e.count} bytes of manufacturer data`, sensitivity: "device" }); continue; }
      const def = EXIF[e.tag]; const v = readValue(view, e, little);
      if (!def || v === null || v === "") continue;
      if (e.tag === 0xa002) result.width = num(v);
      if (e.tag === 0xa003) result.height = num(v);
      result.entries.push({ group: def.group, label: def.name, value: def.fmt ? def.fmt(v) : asText(v), sensitivity: def.sensitivity });
    }
  }
  if (gpsPtr) {
    const g = readIfd(view, 0, gpsPtr, little);
    if (g) {
      result.gpsIfd = { at: g.countAt, entries: g.entries };
      const val: Record<number, TagValue | null> = {};
      for (const e of g.entries) val[e.tag] = readValue(view, e, little);
      const latRef = String(val[1] ?? "N"), lonRef = String(val[3] ?? "E");
      const lat = val[2] != null ? dmsToDecimal(val[2]!, latRef) : null;
      const lon = val[4] != null ? dmsToDecimal(val[4]!, lonRef) : null;
      const altRaw = val[6]; const altBelow = val[5] === 1;
      const altitude = typeof altRaw === "number" ? (altBelow ? -altRaw : altRaw) : null;
      if (lat !== null && lon !== null && Number.isFinite(lat) && Number.isFinite(lon)) {
        result.gps = { lat, lon, altitude };
        result.entries.push({ group: "Location", label: "GPS position", value: `${lat.toFixed(6)}, ${lon.toFixed(6)}`, sensitivity: "location" });
      }
      if (altitude !== null) result.entries.push({ group: "Location", label: "GPS altitude", value: `${Number(altitude.toFixed(1))} m`, sensitivity: "location" });
      if (typeof val[0x11] === "number") result.entries.push({ group: "Location", label: "Direction faced", value: `${Math.round(val[0x11] as number)}°`, sensitivity: "location" });
      if (typeof val[0x1d] === "string") result.entries.push({ group: "Location", label: "GPS date", value: String(val[0x1d]), sensitivity: "location" });
      if (!result.gps && g.entries.length) result.entries.push({ group: "Location", label: "GPS block", value: `${g.entries.length} GPS field(s) present without a full position`, sensitivity: "location" });
    }
  }
  if (ifd0.next) {
    const ifd1 = readIfd(view, 0, ifd0.next, little);
    if (ifd1?.entries.some((e) => e.tag === 0x0201 || e.tag === 0x0202)) result.hasThumbnail = true;
  }
  return result;
}

const ascii = (b: Uint8Array, at: number, len: number) => { let s = ""; for (let i = at; i < Math.min(b.length, at + len); i++) s += String.fromCharCode(b[i]); return s; };
const u16 = (b: Uint8Array, at: number) => (b[at] << 8) | b[at + 1];
const u32 = (b: Uint8Array, at: number) => ((b[at] << 24) | (b[at + 1] << 16) | (b[at + 2] << 8) | b[at + 3]) >>> 0;

const emptyReport = (format: MetadataReport["format"]): MetadataReport => ({ format, entries: [], segments: [], orientation: null, density: null, gps: null, hasExif: false, hasXmp: false, hasIptc: false, hasIcc: false, hasThumbnail: false, trailingBytes: 0, animated: false, hasAlphaChannel: null, dimensions: null });

export function detectFormat(b: Uint8Array): MetadataReport["format"] {
  if (b.length > 3 && b[0] === 0xff && b[1] === 0xd8) return "jpeg";
  if (b.length > 8 && b[0] === 0x89 && ascii(b, 1, 3) === "PNG") return "png";
  if (b.length > 12 && ascii(b, 0, 4) === "RIFF" && ascii(b, 8, 4) === "WEBP") return "webp";
  if (b.length > 6 && ascii(b, 0, 3) === "GIF") return "gif";
  return "unknown";
}

/** True when an EXIF block carries nothing identifying (e.g. only Orientation / resolution). */
function isOnlyTechnical(ex: ExifResult) {
  return ex.entries.length > 0 && ex.entries.every((e) => e.sensitivity === "technical") && !ex.gps && !ex.hasThumbnail;
}

function mergeExif(report: MetadataReport, ex: ExifResult) {
  report.entries.push(...ex.entries);
  if (ex.orientation) report.orientation = ex.orientation;
  if (ex.gps) report.gps = ex.gps;
  if (ex.hasThumbnail) report.hasThumbnail = true;
  if (ex.density && !report.density) {
    const factor = ex.density.unit === 3 ? 2.54 : ex.density.unit === 2 ? 1 : 0;
    if (factor) report.density = { x: Math.round(ex.density.x * factor), y: Math.round(ex.density.y * factor), unit: "dpi", source: "EXIF" };
  }
}

/* ---------------------------------- JPEG ---------------------------------- */

interface JpegSegment { marker: number; start: number; end: number }

function walkJpeg(b: Uint8Array): { segments: JpegSegment[]; scanStart: number; eoi: number } {
  const segments: JpegSegment[] = [];
  let i = 2;
  let scanStart = -1;
  while (i + 4 <= b.length) {
    if (b[i] !== 0xff) { i++; continue; }
    const marker = b[i + 1];
    if (marker === 0xff) { i++; continue; }
    if (marker === 0xd9) return { segments, scanStart, eoi: i + 2 };
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd8)) { i += 2; continue; }
    const len = u16(b, i + 2);
    if (len < 2 || i + 2 + len > b.length) break;
    segments.push({ marker, start: i, end: i + 2 + len });
    i += 2 + len;
    if (marker === 0xda) {
      if (scanStart < 0) scanStart = i;
      // entropy-coded data: advance to the next real marker
      while (i + 1 < b.length) {
        if (b[i] === 0xff) {
          const n = b[i + 1];
          if (n === 0x00 || (n >= 0xd0 && n <= 0xd7) || n === 0xff) { i += n === 0xff ? 1 : 2; continue; }
          if (n === 0xd9) return { segments, scanStart, eoi: i + 2 };
          break;
        }
        i++;
      }
    }
  }
  return { segments, scanStart, eoi: b.length };
}

function readJpeg(b: Uint8Array): MetadataReport {
  const report = emptyReport("jpeg");
  const { segments, eoi } = walkJpeg(b);
  report.trailingBytes = Math.max(0, b.length - eoi);
  for (const seg of segments) {
    const bytes = seg.end - seg.start;
    const body = seg.start + 4;
    if (seg.marker >= 0xc0 && seg.marker <= 0xcf && seg.marker !== 0xc4 && seg.marker !== 0xc8 && seg.marker !== 0xcc && !report.dimensions) {
      report.dimensions = { height: u16(b, body + 1), width: u16(b, body + 3) };
    } else if (seg.marker === 0xe0 && ascii(b, body, 4) === "JFIF") {
      const unit = b[body + 7]; const x = u16(b, body + 8); const y = u16(b, body + 10);
      if (unit === 1 || unit === 2) report.density = { x: unit === 2 ? Math.round(x * 2.54) : x, y: unit === 2 ? Math.round(y * 2.54) : y, unit: "dpi", source: "JFIF" };
    } else if (seg.marker === 0xe1 && ascii(b, body, 6) === "Exif\0\0") {
      report.hasExif = true;
      const parsed = parseTiff(b, body + 6, seg.end);
      const onlyTechnical = isOnlyTechnical(parsed);
      report.segments.push({ name: onlyTechnical ? "EXIF (technical fields only)" : "EXIF", bytes, sensitive: !onlyTechnical, note: onlyTechnical ? "Orientation / resolution only" : "Camera, capture time and (if recorded) GPS position" });
      mergeExif(report, parsed);
    } else if (seg.marker === 0xe1 && ascii(b, body, 28).startsWith("http://ns.adobe.com/xap/1.0/")) {
      report.hasXmp = true;
      report.segments.push({ name: "XMP", bytes, sensitive: true, note: "Editing history, ratings, keywords, sometimes location" });
      report.entries.push({ group: "Embedded data", label: "XMP packet", value: `${bytes} bytes`, sensitivity: "identity" });
    } else if (seg.marker === 0xe2 && ascii(b, body, 11) === "ICC_PROFILE") {
      report.hasIcc = true;
      report.segments.push({ name: "ICC colour profile", bytes, sensitive: false, note: "Affects colour accuracy; removing can shift colours" });
      report.entries.push({ group: "Color profile", label: "ICC profile", value: `Embedded (${bytes} bytes)`, sensitivity: "technical" });
    } else if (seg.marker === 0xe2 && ascii(b, body, 4) === "MPF\0") {
      report.segments.push({ name: "Multi-picture data (MPF)", bytes, sensitive: true, note: "Can reference embedded secondary images" });
    } else if (seg.marker === 0xed) {
      report.hasIptc = true;
      report.segments.push({ name: "IPTC / Photoshop", bytes, sensitive: true, note: "Captions, credits, keywords" });
      report.entries.push({ group: "Embedded data", label: "IPTC / Photoshop block", value: `${bytes} bytes`, sensitivity: "identity" });
    } else if (seg.marker === 0xfe) {
      report.segments.push({ name: "JPEG comment", bytes, sensitive: true, note: ascii(b, body, Math.min(80, bytes - 4)) });
      report.entries.push({ group: "Embedded data", label: "Comment", value: ascii(b, body, Math.min(120, bytes - 4)), sensitivity: "identity" });
    } else if (seg.marker === 0xee) {
      report.segments.push({ name: "Adobe APP14", bytes, sensitive: false });
    } else if (seg.marker >= 0xe1 && seg.marker <= 0xef) {
      report.segments.push({ name: `APP${seg.marker - 0xe0}`, bytes, sensitive: true, note: "Application-specific data" });
    }
  }
  if (report.trailingBytes > 0) {
    report.segments.push({ name: "Trailing data after image", bytes: report.trailingBytes, sensitive: true, note: "Extra data appended after the JPEG end marker (e.g. motion-photo video, depth maps)" });
    report.entries.push({ group: "Embedded data", label: "Trailing data", value: `${report.trailingBytes} bytes after end of image`, sensitivity: "identity" });
  }
  if (report.hasThumbnail) report.entries.push({ group: "Embedded data", label: "Embedded thumbnail", value: "Present (may show the uncropped original)", sensitivity: "identity" });
  report.hasAlphaChannel = false;
  return report;
}

/** 26-byte TIFF block whose only field is Orientation. */
export function orientationOnlyTiff(orientation: number): Uint8Array {
  return new Uint8Array([0x4d, 0x4d, 0, 42, 0, 0, 0, 8, 0, 1, 0x01, 0x12, 0, 3, 0, 0, 0, 1, 0, orientation, 0, 0, 0, 0, 0, 0]);
}

function pngChunk(type: string, data: Uint8Array): Uint8Array {
  const out = new Uint8Array(12 + data.length);
  const v = new DataView(out.buffer);
  v.setUint32(0, data.length, false);
  for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i);
  out.set(data, 8);
  v.setUint32(8 + data.length, crc32(out.subarray(4, 8 + data.length)), false);
  return out;
}

function webpChunk(type: string, data: Uint8Array): Uint8Array {
  const out = new Uint8Array(8 + data.length + (data.length & 1));
  for (let i = 0; i < 4; i++) out[i] = type.charCodeAt(i);
  new DataView(out.buffer).setUint32(4, data.length, true);
  out.set(data, 8);
  return out;
}

/** Minimal EXIF APP1 that only records orientation, so a cleaned photo still displays upright. */
export function buildOrientationExif(orientation: number): Uint8Array {
  const tiff = orientationOnlyTiff(orientation);
  const payload = new Uint8Array(6 + tiff.length);
  payload.set([0x45, 0x78, 0x69, 0x66, 0, 0], 0);
  payload.set(tiff, 6);
  const out = new Uint8Array(4 + payload.length);
  out.set([0xff, 0xe1, ((payload.length + 2) >> 8) & 255, (payload.length + 2) & 255], 0);
  out.set(payload, 4);
  return out;
}

/* ----------------------------------- PNG ----------------------------------- */

const PNG_TEXT = new Set(["tEXt", "zTXt", "iTXt"]);

function readPng(b: Uint8Array): MetadataReport {
  const report = emptyReport("png");
  let i = 8;
  let colorType = -1;
  let hasTrns = false;
  while (i + 12 <= b.length) {
    const len = u32(b, i);
    const type = ascii(b, i + 4, 4);
    const data = i + 8;
    if (data + len > b.length) break;
    const size = len + 12;
    if (type === "IHDR") { report.dimensions = { width: u32(b, data), height: u32(b, data + 4) }; colorType = b[data + 9]; }
    else if (type === "tRNS") hasTrns = true;
    else if (type === "acTL") report.animated = true;
    else if (type === "pHYs" && len >= 9 && b[data + 8] === 1) {
      report.density = { x: Math.round(u32(b, data) * 0.0254), y: Math.round(u32(b, data + 4) * 0.0254), unit: "dpi", source: "PNG pHYs" };
    } else if (type === "eXIf") {
      report.hasExif = true;
      const parsed = parseTiff(b, data, data + len);
      const onlyTechnical = isOnlyTechnical(parsed);
      report.segments.push({ name: onlyTechnical ? "EXIF (technical fields only)" : "EXIF (eXIf)", bytes: size, sensitive: !onlyTechnical });
      mergeExif(report, parsed);
    } else if (type === "iCCP") {
      report.hasIcc = true;
      report.segments.push({ name: "ICC colour profile", bytes: size, sensitive: false, note: "Affects colour accuracy" });
      report.entries.push({ group: "Color profile", label: "ICC profile", value: ascii(b, data, Math.min(len, 40)).split("\0")[0], sensitivity: "technical" });
    } else if (type === "tIME" && len === 7) {
      report.segments.push({ name: "Last-modified time (tIME)", bytes: size, sensitive: true });
      report.entries.push({ group: "Date & time", label: "Last modified", value: `${u16(b, data)}-${String(b[data + 2]).padStart(2, "0")}-${String(b[data + 3]).padStart(2, "0")}`, sensitivity: "timestamp" });
    } else if (PNG_TEXT.has(type)) {
      const nul = b.indexOf(0, data);
      const keyword = nul > data && nul < data + len ? ascii(b, data, nul - data) : type;
      const isXmp = keyword === "XML:com.adobe.xmp";
      if (isXmp) report.hasXmp = true;
      report.segments.push({ name: isXmp ? "XMP" : `Text: ${keyword}`, bytes: size, sensitive: true });
      const text = type === "tEXt" ? ascii(b, nul + 1, Math.min(160, data + len - nul - 1)) : "(compressed or international text)";
      report.entries.push({ group: isXmp ? "Embedded data" : "Author & rights", label: isXmp ? "XMP packet" : keyword, value: isXmp ? `${len} bytes` : text, sensitivity: keyword === "Software" ? "device" : "identity" });
    }
    if (type === "IEND") { report.trailingBytes = Math.max(0, b.length - (i + size)); break; }
    i += size;
  }
  report.hasAlphaChannel = colorType === 4 || colorType === 6 || hasTrns ? true : colorType >= 0 ? false : null;
  if (report.trailingBytes > 0) report.segments.push({ name: "Trailing data after image", bytes: report.trailingBytes, sensitive: true });
  return report;
}

/* ----------------------------------- WebP ----------------------------------- */

function readWebp(b: Uint8Array): MetadataReport {
  const report = emptyReport("webp");
  let i = 12;
  while (i + 8 <= b.length) {
    const type = ascii(b, i, 4);
    const len = b[i + 4] | (b[i + 5] << 8) | (b[i + 6] << 16) | (b[i + 7] << 24);
    const data = i + 8;
    if (len < 0 || data + len > b.length) break;
    const size = 8 + len + (len & 1);
    if (type === "VP8X") {
      const flags = b[data];
      report.hasAlphaChannel = Boolean(flags & 0x10);
      report.animated = Boolean(flags & 0x02);
      report.dimensions = { width: 1 + (b[data + 4] | (b[data + 5] << 8) | (b[data + 6] << 16)), height: 1 + (b[data + 7] | (b[data + 8] << 8) | (b[data + 9] << 16)) };
    } else if (type === "VP8L" && !report.dimensions) {
      const bits = b[data + 1] | (b[data + 2] << 8) | (b[data + 3] << 16) | (b[data + 4] << 24);
      report.dimensions = { width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1 };
      report.hasAlphaChannel = Boolean((b[data + 4] >> 4) & 1);
    } else if (type === "VP8 " && !report.dimensions) {
      report.dimensions = { width: (b[data + 6] | (b[data + 7] << 8)) & 0x3fff, height: (b[data + 8] | (b[data + 9] << 8)) & 0x3fff };
      report.hasAlphaChannel = false;
    } else if (type === "EXIF") {
      report.hasExif = true;
      const skip = ascii(b, data, 6) === "Exif\0\0" ? 6 : 0;
      const parsed = parseTiff(b, data + skip, data + len);
      const onlyTechnical = isOnlyTechnical(parsed);
      report.segments.push({ name: onlyTechnical ? "EXIF (technical fields only)" : "EXIF", bytes: size, sensitive: !onlyTechnical });
      mergeExif(report, parsed);
    } else if (type === "XMP ") {
      report.hasXmp = true;
      report.segments.push({ name: "XMP", bytes: size, sensitive: true });
      report.entries.push({ group: "Embedded data", label: "XMP packet", value: `${len} bytes`, sensitivity: "identity" });
    } else if (type === "ICCP") {
      report.hasIcc = true;
      report.segments.push({ name: "ICC colour profile", bytes: size, sensitive: false });
      report.entries.push({ group: "Color profile", label: "ICC profile", value: `Embedded (${len} bytes)`, sensitivity: "technical" });
    }
    i += size;
  }
  return report;
}

export function readMetadata(bytes: Uint8Array): MetadataReport {
  try {
    const format = detectFormat(bytes);
    if (format === "jpeg") return readJpeg(bytes);
    if (format === "png") return readPng(bytes);
    if (format === "webp") return readWebp(bytes);
    const report = emptyReport(format);
    if (format === "gif") { report.animated = ascii(bytes, 0, bytes.length).split("\x21\xf9\x04").length > 2; report.hasAlphaChannel = true; }
    return report;
  } catch {
    return emptyReport("unknown");
  }
}

/* --------------------------------- stripping --------------------------------- */

export interface StripOptions {
  /** Keep the ICC colour profile so colours render the same. Default true. */
  keepIcc?: boolean;
  /** Keep only the orientation flag so cleaned photos still display upright. Default true. */
  keepOrientation?: boolean;
  /** Keep DPI/density. Default true. */
  keepDensity?: boolean;
  /** "location" removes only GPS data (EXIF stays); "all" removes everything removable. Default "all". */
  scope?: "location" | "all";
}

export interface StripResult { bytes: Uint8Array; removed: string[]; supported: boolean; reason?: string }

function concat(parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of parts) { out.set(p, at); at += p.length; }
  return out;
}

/** Zeroes GPS values inside an EXIF TIFF block and empties the GPS IFD, leaving everything else intact. */
export function removeGpsFromTiff(bytes: Uint8Array, start: number, end: number): boolean {
  const view = new DataView(bytes.buffer, bytes.byteOffset + start, end - start);
  if (end - start < 8) return false;
  const little = view.getUint8(0) === 0x49;
  const ifd0 = readIfd(view, 0, view.getUint32(4, little), little);
  const ptr = ifd0?.entries.find((e) => e.tag === 0x8825);
  if (!ifd0 || !ptr) return false;
  const gpsOffset = Number(readValue(view, ptr, little));
  const gps = readIfd(view, 0, gpsOffset, little);
  if (!gps) return false;
  for (const e of gps.entries) {
    const size = (TYPE_SIZE[e.type] ?? 0) * e.count;
    for (let k = 0; k < size; k++) view.setUint8(e.valueAt + k, 0);
  }
  const at = gps.countAt;
  for (let k = 0; k < 2 + gps.entries.length * 12; k++) view.setUint8(at + k, 0);
  // Remove the pointer entry from IFD0 by neutralising it.
  const entryAt = ifd0.countAt + 2 + ifd0.entries.findIndex((e) => e === ptr) * 12;
  view.setUint16(entryAt, 0xc4a5, little);
  view.setUint16(entryAt + 2, 4, little);
  view.setUint32(entryAt + 4, 1, little);
  view.setUint32(entryAt + 8, 0, little);
  return true;
}

function stripJpeg(b: Uint8Array, o: Required<StripOptions>): StripResult {
  const info = readJpeg(b);
  const { segments, eoi } = walkJpeg(b);
  const parts: Uint8Array[] = [b.subarray(0, 2)];
  const removed: string[] = [];
  let cursor = 2;
  let insertedOrientation = false;
  const orientation = info.orientation && info.orientation !== 1 ? info.orientation : null;
  for (const seg of segments) {
    const body = seg.start + 4;
    const isExif = seg.marker === 0xe1 && ascii(b, body, 6) === "Exif\0\0";
    const isXmp = seg.marker === 0xe1 && ascii(b, body, 28).startsWith("http://ns.adobe.com/xap/1.0/");
    const isIcc = seg.marker === 0xe2 && ascii(b, body, 11) === "ICC_PROFILE";
    const isJfif = seg.marker === 0xe0 && ascii(b, body, 4) === "JFIF";
    let drop = false;
    if (o.scope === "location") {
      if (isExif) {
        const copy = b.slice(seg.start, seg.end);
        const done = removeGpsFromTiff(copy, 10, copy.length);
        if (done) { parts.push(b.subarray(cursor, seg.start), copy); cursor = seg.end; removed.push("GPS location"); }
        continue;
      }
      continue;
    }
    if (isExif) { drop = true; removed.push("EXIF (camera, time, GPS, thumbnail)"); if (orientation && o.keepOrientation && !insertedOrientation) { parts.push(b.subarray(cursor, seg.start), buildOrientationExif(orientation)); cursor = seg.end; insertedOrientation = true; drop = false; if (!removed.includes("EXIF orientation kept")) removed.push("EXIF orientation kept"); continue; } }
    else if (isXmp) { drop = true; removed.push("XMP"); }
    else if (isIcc) drop = !o.keepIcc, drop && removed.push("ICC profile");
    else if (seg.marker === 0xed) { drop = true; removed.push("IPTC / Photoshop"); }
    else if (seg.marker === 0xfe) { drop = true; removed.push("Comment"); }
    else if (seg.marker === 0xe0 && !isJfif) { drop = true; removed.push("Application data (APP0)"); }
    else if (isJfif && !o.keepDensity) { drop = true; removed.push("JFIF density"); }
    else if (seg.marker >= 0xe1 && seg.marker <= 0xef && !isIcc && seg.marker !== 0xee) { drop = true; removed.push(`APP${seg.marker - 0xe0} data`); }
    if (drop) { parts.push(b.subarray(cursor, seg.start)); cursor = seg.end; }
  }
  const tailEnd = o.scope === "all" ? eoi : b.length;
  parts.push(b.subarray(cursor, tailEnd));
  if (o.scope === "all" && info.trailingBytes > 0) removed.push(`Trailing data (${info.trailingBytes} bytes)`);
  return { bytes: concat(parts), removed: [...new Set(removed)], supported: true };
}

function stripPng(b: Uint8Array, o: Required<StripOptions>): StripResult {
  const parts: Uint8Array[] = [b.subarray(0, 8)];
  const removed: string[] = [];
  let i = 8;
  while (i + 12 <= b.length) {
    const len = u32(b, i);
    const type = ascii(b, i + 4, 4);
    const size = len + 12;
    if (i + size > b.length) { parts.push(b.subarray(i)); break; }
    let drop = false;
    if (o.scope === "location") {
      if (type === "eXIf") {
        const copy = b.slice(i, i + size);
        if (removeGpsFromTiff(copy, 8, 8 + len)) {
          new DataView(copy.buffer).setUint32(8 + len, crc32(copy.subarray(4, 8 + len)), false);
          parts.push(copy); removed.push("GPS location"); i += size; continue;
        }
      }
    } else if (PNG_TEXT.has(type)) { drop = true; removed.push("Text / XMP chunks"); }
    else if (type === "eXIf") {
      drop = true; removed.push("EXIF");
      const orientation = parseTiff(b, i + 8, i + 8 + len).orientation;
      if (orientation && orientation !== 1 && o.keepOrientation) { parts.push(pngChunk("eXIf", orientationOnlyTiff(orientation))); removed.push("EXIF orientation kept"); }
    }
    else if (type === "tIME") { drop = true; removed.push("Last-modified time"); }
    else if (type === "iCCP" && !o.keepIcc) { drop = true; removed.push("ICC profile"); }
    else if (type === "pHYs" && !o.keepDensity) { drop = true; removed.push("Density"); }
    if (!drop) parts.push(b.subarray(i, i + size));
    i += size;
    if (type === "IEND") { if (o.scope === "all" && i < b.length) removed.push(`Trailing data (${b.length - i} bytes)`); else if (i < b.length) parts.push(b.subarray(i)); break; }
  }
  return { bytes: concat(parts), removed: [...new Set(removed)], supported: true };
}

function stripWebp(b: Uint8Array, o: Required<StripOptions>): StripResult {
  const chunks: { type: string; data: Uint8Array }[] = [];
  const removed: string[] = [];
  let i = 12;
  let flagsClear = 0;
  while (i + 8 <= b.length) {
    const type = ascii(b, i, 4);
    const len = b[i + 4] | (b[i + 5] << 8) | (b[i + 6] << 16) | (b[i + 7] << 24);
    if (len < 0 || i + 8 + len > b.length) break;
    const size = 8 + len + (len & 1);
    const whole = b.slice(i, Math.min(b.length, i + size));
    if (o.scope === "location") {
      if (type === "EXIF") { const skip = ascii(b, i + 8, 6) === "Exif\0\0" ? 6 : 0; if (removeGpsFromTiff(whole, 8 + skip, 8 + len)) removed.push("GPS location"); }
      chunks.push({ type, data: whole });
    } else if (type === "EXIF") {
      removed.push("EXIF");
      const skip = ascii(b, i + 8, 6) === "Exif\0\0" ? 6 : 0;
      const orientation = parseTiff(b, i + 8 + skip, i + 8 + len).orientation;
      if (orientation && orientation !== 1 && o.keepOrientation) { chunks.push({ type, data: webpChunk("EXIF", orientationOnlyTiff(orientation)) }); removed.push("EXIF orientation kept"); }
      else flagsClear |= 0x08;
    }
    else if (type === "XMP ") { removed.push("XMP"); flagsClear |= 0x04; }
    else if (type === "ICCP" && !o.keepIcc) { removed.push("ICC profile"); flagsClear |= 0x20; }
    else chunks.push({ type, data: whole });
    i += size;
  }
  const body = concat(chunks.map((c) => c.data));
  const out = new Uint8Array(12 + body.length);
  out.set(b.subarray(0, 12), 0);
  out.set(body, 12);
  const riffSize = out.length - 8;
  out[4] = riffSize & 255; out[5] = (riffSize >> 8) & 255; out[6] = (riffSize >> 16) & 255; out[7] = (riffSize >>> 24) & 255;
  if (ascii(out, 12, 4) === "VP8X") out[20] &= ~flagsClear;
  return { bytes: out, removed: [...new Set(removed)], supported: true };
}

/** Removes metadata by rewriting the container. Pixels are untouched (no re-encode). */
export function stripMetadataBytes(bytes: Uint8Array, options: StripOptions = {}): StripResult {
  const o: Required<StripOptions> = { keepIcc: true, keepOrientation: true, keepDensity: true, scope: "all", ...options };
  try {
    switch (detectFormat(bytes)) {
      case "jpeg": return stripJpeg(bytes, o);
      case "png": return stripPng(bytes, o);
      case "webp": return stripWebp(bytes, o);
      default: return { bytes, removed: [], supported: false, reason: "Lossless cleaning is available for JPEG, PNG and WebP. Other formats can be re-encoded to one of those to drop metadata." };
    }
  } catch {
    return { bytes, removed: [], supported: false, reason: "The file structure could not be parsed, so nothing was changed." };
  }
}

/** Re-reads cleaned bytes and lists anything sensitive that is still present. */
export function verifyCleaned(bytes: Uint8Array, scope: "location" | "all" = "all") {
  const report = readMetadata(bytes);
  const remaining: string[] = [];
  if (scope === "location") { if (report.gps) remaining.push("GPS position"); }
  else {
    for (const s of report.segments) if (s.sensitive) remaining.push(s.name);
    for (const e of report.entries) if (e.sensitivity === "location") remaining.push(e.label);
  }
  return { clean: remaining.length === 0, remaining: [...new Set(remaining)], report };
}

/* ------------------- carrying EXIF across a canvas re-encode ------------------- */

/** The complete EXIF APP1 segment (marker included) of a JPEG, or null. */
export function extractJpegExifSegment(bytes: Uint8Array): Uint8Array | null {
  if (detectFormat(bytes) !== "jpeg") return null;
  for (const seg of walkJpeg(bytes).segments) {
    if (seg.marker === 0xe1 && ascii(bytes, seg.start + 4, 6) === "Exif\0\0") return bytes.slice(seg.start, seg.end);
  }
  return null;
}

/**
 * Makes an EXIF segment safe to attach to a re-encoded JPEG: Orientation is reset to 1 (the canvas is already upright),
 * pixel-dimension tags are updated, the embedded thumbnail (which can show the uncropped original) is erased, and GPS is
 * optionally erased. Works on a copy.
 */
export function prepareExifForReencode(segment: Uint8Array, options: { removeGps: boolean; width?: number; height?: number }): Uint8Array {
  const out = segment.slice();
  const tiffStart = 10;
  if (out.length < tiffStart + 8) return out;
  const view = new DataView(out.buffer, out.byteOffset + tiffStart, out.length - tiffStart);
  const little = view.getUint8(0) === 0x49;
  const ifd0 = readIfd(view, 0, view.getUint32(4, little), little);
  if (!ifd0) return out;
  const setNumber = (e: Entry, value: number) => {
    if (e.count !== 1) return;
    if (e.type === 3) view.setUint16(e.valueAt, value, little);
    else if (e.type === 4) view.setUint32(e.valueAt, value, little);
  };
  for (const e of ifd0.entries) {
    if (e.tag === 0x0112) setNumber(e, 1);
    if (e.tag === 0x8769) {
      const sub = readIfd(view, 0, Number(readValue(view, e, little)), little);
      for (const s of sub?.entries ?? []) {
        if (s.tag === 0xa002 && options.width) setNumber(s, options.width);
        if (s.tag === 0xa003 && options.height) setNumber(s, options.height);
      }
    }
  }
  if (options.removeGps) removeGpsFromTiff(out, tiffStart, out.length);
  if (ifd0.next) {
    const ifd1 = readIfd(view, 0, ifd0.next, little);
    if (ifd1) {
      const off = ifd1.entries.find((e) => e.tag === 0x0201), len = ifd1.entries.find((e) => e.tag === 0x0202);
      const o = off ? Number(readValue(view, off, little)) : 0, l = len ? Number(readValue(view, len, little)) : 0;
      if (o > 0 && l > 0 && o + l <= view.byteLength) for (let k = 0; k < l; k++) view.setUint8(o + k, 0);
      const n = Math.min(view.getUint16(ifd1.countAt, little), 512);
      for (let k = 0; k < 2 + n * 12; k++) view.setUint8(ifd1.countAt + k, 0);
    }
    const n0 = Math.min(view.getUint16(ifd0.countAt, little), 512);
    view.setUint32(ifd0.countAt + 2 + n0 * 12, 0, little);
  }
  return out;
}

/** Inserts an EXIF APP1 segment right after SOI (and after a leading JFIF APP0, as the spec prefers). */
export function injectExifIntoJpeg(jpeg: Uint8Array, exifSegment: Uint8Array): Uint8Array {
  if (detectFormat(jpeg) !== "jpeg") return jpeg;
  let at = 2;
  if (jpeg[2] === 0xff && jpeg[3] === 0xe0 && ascii(jpeg, 6, 4) === "JFIF") at = 4 + u16(jpeg, 4);
  return concat([jpeg.subarray(0, at), exifSegment, jpeg.subarray(at)]);
}

/* ------------------------------- ICO container ------------------------------- */

/** Builds a multi-resolution .ico from PNG-encoded frames (supported by every current browser and Windows Vista+). */
export function buildIco(frames: { size: number; png: Uint8Array }[]): Uint8Array {
  if (!frames.length) throw new Error("An ICO needs at least one image.");
  const header = new Uint8Array(6 + frames.length * 16);
  const v = new DataView(header.buffer);
  v.setUint16(2, 1, true); v.setUint16(4, frames.length, true);
  let offset = header.length;
  frames.forEach((f, i) => {
    const at = 6 + i * 16;
    header[at] = f.size >= 256 ? 0 : f.size; header[at + 1] = f.size >= 256 ? 0 : f.size;
    v.setUint16(at + 4, 1, true); v.setUint16(at + 6, 32, true); v.setUint32(at + 8, f.png.length, true); v.setUint32(at + 12, offset, true);
    offset += f.png.length;
  });
  return concat([header, ...frames.map((f) => f.png)]);
}
