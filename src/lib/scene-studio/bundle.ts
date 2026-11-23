/**
 * Reading and writing the .zip files Scene Studio accepts: a scene plus the models, pictures and sounds it uses.
 *
 * The reader treats every zip as hostile. It never writes anywhere (everything stays in memory), checks every size
 * before decompressing anything, refuses path tricks, overlapping or lying entries, and requires each file's first
 * bytes to match its extension. Compression is injected (`Inflate`) so this file has no browser or Node
 * dependency; `bundle-streams.ts` supplies the real one.
 *
 * Not supported on purpose: encrypted zips, Zip64 (archives over 4 GB), several-disk archives, .gltf with loose
 * files (use a single .glb), and SVG (it can contain scripts).
 */
import { LIMITS } from "./constants.ts";

export interface BundleIssue {
  severity: "error" | "warning";
  code: string;
  /** The file name inside the zip, or "" for the zip as a whole. */
  path: string;
  message: string;
  fix: string;
}

export interface BundleLimits {
  maxArchiveBytes: number;
  maxEntries: number;
  maxFileBytes: number;
  maxTotalBytes: number;
  maxSceneBytes: number;
  /** An entry bigger than `ratioFloorBytes` may not expand more than this many times. */
  maxRatio: number;
  ratioFloorBytes: number;
}

const MiB = 1024 * 1024;
export const BUNDLE_LIMITS: BundleLimits = {
  maxArchiveBytes: 120 * MiB,
  maxEntries: 400,
  maxFileBytes: 50 * MiB,
  maxTotalBytes: 250 * MiB,
  maxSceneBytes: LIMITS.maxJsonBytes,
  maxRatio: 100,
  ratioFloorBytes: MiB,
};

/** Decompress raw deflate data. Must stop and throw as soon as the output would exceed `expectedSize`. */
export type Inflate = (compressed: Uint8Array, expectedSize: number) => Promise<Uint8Array>;
export type Deflate = (data: Uint8Array) => Promise<Uint8Array>;

export type AssetKind = "model" | "image" | "audio" | "hdri" | "text";

const ascii = (b: Uint8Array, at: number, s: string) => s.length + at <= b.length && [...s].every((ch, i) => b[at + i] === ch.charCodeAt(0));
const isText = (b: Uint8Array) => {
  const n = Math.min(b.length, 4096);
  for (let i = 0; i < n; i++) if (b[i] === 0) return false;
  try {
    new TextDecoder("utf-8", { fatal: true }).decode(b);
    return true;
  } catch {
    return false;
  }
};

interface Format {
  kind: AssetKind;
  /** What the file must be, in words, and a test of its first bytes. */
  what: string;
  matches(b: Uint8Array): boolean;
}

const FORMATS: Record<string, Format> = {
  glb: {
    kind: "model",
    what: "a binary glTF model (.glb)",
    matches: (b) => {
      if (b.length < 20 || !ascii(b, 0, "glTF")) return false;
      const v = new DataView(b.buffer, b.byteOffset, b.byteLength);
      return v.getUint32(4, true) === 2 && v.getUint32(8, true) === b.length;
    },
  },
  png: { kind: "image", what: "a PNG picture", matches: (b) => b.length > 8 && [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every((x, i) => b[i] === x) },
  jpg: { kind: "image", what: "a JPEG picture", matches: (b) => b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  webp: { kind: "image", what: "a WebP picture", matches: (b) => ascii(b, 0, "RIFF") && ascii(b, 8, "WEBP") },
  wav: { kind: "audio", what: "a WAV sound", matches: (b) => ascii(b, 0, "RIFF") && ascii(b, 8, "WAVE") },
  mp3: { kind: "audio", what: "an MP3 sound", matches: (b) => ascii(b, 0, "ID3") || (b.length > 2 && b[0] === 0xff && (b[1] & 0xe0) === 0xe0) },
  ogg: { kind: "audio", what: "an Ogg sound", matches: (b) => ascii(b, 0, "OggS") },
  m4a: { kind: "audio", what: "an M4A sound", matches: (b) => ascii(b, 4, "ftyp") },
  hdr: { kind: "hdri", what: "a Radiance HDR image", matches: (b) => ascii(b, 0, "#?RADIANCE") || ascii(b, 0, "#?RGBE") },
  txt: { kind: "text", what: "a plain text file", matches: isText },
  md: { kind: "text", what: "a plain text file", matches: isText },
};
FORMATS.jpeg = FORMATS.jpg;

export const ALLOWED_EXTENSIONS: readonly string[] = [...Object.keys(FORMATS), "json"];

const extensionOf = (name: string) => {
  const base = name.slice(name.lastIndexOf("/") + 1);
  const dot = base.lastIndexOf(".");
  return dot <= 0 ? "" : base.slice(dot + 1).toLowerCase();
};

// ---- CRC-32 ----------------------------------------------------------------------------------

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

export function crc32(data: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < data.length; i++) c = CRC_TABLE[(c ^ data[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

// ---- names -----------------------------------------------------------------------------------

/** Returns the safe, cleaned name, or a reason it is unsafe. Directory names end with "/". */
export function cleanEntryName(raw: string): { name: string } | { unsafe: string } {
  let name = raw;
  if (name.startsWith("./")) name = name.slice(2);
  if (name === "") return { unsafe: "it has no name" };
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001f\u007f]/.test(name)) return { unsafe: "its name has hidden control characters" };
  if (name.includes("\\")) return { unsafe: "its name contains a backslash" };
  if (name.startsWith("/")) return { unsafe: "its name starts with a slash" };
  if (/^[a-zA-Z]:/.test(name)) return { unsafe: "its name starts with a drive letter" };
  const parts = name.endsWith("/") ? name.slice(0, -1).split("/") : name.split("/");
  if (parts.some((p) => p === "..")) return { unsafe: 'its name climbs out of the folder with ".."' };
  if (parts.some((p) => p === "." || p === "")) return { unsafe: "its name has an empty or \".\" folder" };
  return { name };
}

const isJunk = (name: string) => {
  const base = name.slice(name.lastIndexOf("/") + 1);
  return name.startsWith("__MACOSX/") || name.includes("/__MACOSX/") || base === ".DS_Store" || base === "Thumbs.db" || base.startsWith("._");
};

// ---- reading ---------------------------------------------------------------------------------

export interface BundleResult {
  /** True when there is a usable scene and no errors. */
  ok: boolean;
  scenePath?: string;
  sceneText?: string;
  /** Every allowed non-scene file, keyed by its name inside the zip (after removing a single wrapper folder). */
  assets: Map<string, Uint8Array>;
  /** The bytes of project.json when the zip has one (checked for damage like every other file). */
  projectInfo?: Uint8Array;
  /** Names that were left out on purpose (junk, unsupported types). */
  ignored: string[];
  issues: BundleIssue[];
}

interface Entry {
  rawName: string;
  name: string;
  flags: number;
  method: number;
  crc: number;
  compressed: number;
  size: number;
  offset: number;
}

const fail = (issues: BundleIssue[], code: string, path: string, message: string, fix: string): BundleResult => {
  issues.push({ severity: "error", code, path, message, fix });
  return { ok: false, assets: new Map(), ignored: [], issues };
};

const mb = (n: number) => `${Math.round(n / MiB)} MB`;
const sizeWords = (n: number) => (n >= MiB ? mb(n) : `${n} bytes`);

/** Read a zip held in memory. Never throws for bad input; problems come back as plain-words issues. */
export async function readBundle(bytes: Uint8Array, inflate: Inflate, limits: BundleLimits = BUNDLE_LIMITS): Promise<BundleResult> {
  const issues: BundleIssue[] = [];
  const bad = (code: string, path: string, message: string, fix: string) => fail(issues, code, path, message, fix);
  const damaged = (what: string) => bad("zip-damaged", "", `This zip file is damaged (${what}).`, "Make the zip again from the original folder, or download it again.");

  if (bytes.length > limits.maxArchiveBytes) return bad("zip-too-big", "", `This zip is ${mb(bytes.length)}; the limit is ${mb(limits.maxArchiveBytes)}.`, "Remove large files, or use smaller models and pictures.");
  if (bytes.length < 22) return damaged("it is too short to be a zip");

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let eocd = -1;
  for (let at = bytes.length - 22; at >= Math.max(0, bytes.length - 65_557); at--) {
    if (view.getUint32(at, true) === 0x06054b50) {
      eocd = at;
      break;
    }
  }
  if (eocd < 0) return bad("not-a-zip", "", "This file is not a zip file.", "Choose a .zip file, or paste the scene text instead.");
  const disk = view.getUint16(eocd + 4, true);
  const dirDisk = view.getUint16(eocd + 6, true);
  const count = view.getUint16(eocd + 10, true);
  const dirSize = view.getUint32(eocd + 12, true);
  const dirOffset = view.getUint32(eocd + 16, true);
  if (disk !== 0 || dirDisk !== 0 || view.getUint16(eocd + 8, true) !== count) return bad("zip-unsupported", "", "This zip is split over several files, which is not supported.", "Make one single .zip file.");
  if (count === 0xffff || dirSize === 0xffffffff || dirOffset === 0xffffffff) return bad("zip-unsupported", "", "This zip uses the very-large-file format (Zip64), which is not supported.", "Make a smaller zip with fewer or smaller files.");
  if (count > limits.maxEntries * 2 + 50) return bad("too-many-files", "", `This zip has ${count} entries; the limit is ${limits.maxEntries} files.`, "Remove files you do not need.");
  if (dirOffset + dirSize > eocd) return damaged("its file list is out of place");

  const entries: Entry[] = [];
  const decoder = new TextDecoder("utf-8");
  let cursor = dirOffset;
  for (let i = 0; i < count; i++) {
    if (cursor + 46 > bytes.length || view.getUint32(cursor, true) !== 0x02014b50) return damaged("its file list is broken");
    const flags = view.getUint16(cursor + 8, true);
    const method = view.getUint16(cursor + 10, true);
    const nameLength = view.getUint16(cursor + 28, true);
    const extraLength = view.getUint16(cursor + 30, true);
    const commentLength = view.getUint16(cursor + 32, true);
    const end = cursor + 46 + nameLength + extraLength + commentLength;
    if (end > bytes.length) return damaged("a file entry is cut off");
    const entry: Entry = {
      rawName: decoder.decode(bytes.subarray(cursor + 46, cursor + 46 + nameLength)),
      name: "",
      flags,
      method,
      crc: view.getUint32(cursor + 16, true),
      compressed: view.getUint32(cursor + 20, true),
      size: view.getUint32(cursor + 24, true),
      offset: view.getUint32(cursor + 42, true),
    };
    if (entry.compressed === 0xffffffff || entry.size === 0xffffffff || entry.offset === 0xffffffff) return bad("zip-unsupported", entry.rawName, "This zip uses the very-large-file format (Zip64), which is not supported.", "Make a smaller zip.");
    entries.push(entry);
    cursor = end;
  }
  if (cursor !== dirOffset + dirSize) return damaged("its file list has the wrong length");

  // names: safety first, before anything is looked at or decompressed
  for (const e of entries) {
    const cleaned = cleanEntryName(e.rawName);
    if ("unsafe" in cleaned) return bad("unsafe-path", e.rawName, `The zip contains a file called "${e.rawName.slice(0, 80)}" that is not allowed: ${cleaned.unsafe}.`, "Make the zip again from a normal folder. File names must be plain relative names like models/tree.glb.");
    e.name = cleaned.name;
  }

  const ignored: string[] = [];
  let files = entries.filter((e) => {
    if (e.name.endsWith("/")) return false;
    if (isJunk(e.name)) {
      ignored.push(e.name);
      return false;
    }
    return true;
  });

  // A zip made with "compress this folder" wraps everything in one folder. Remove it.
  if (files.length > 0 && files.every((e) => e.name.includes("/"))) {
    const first = files[0].name.slice(0, files[0].name.indexOf("/") + 1);
    if (files.every((e) => e.name.startsWith(first))) for (const e of files) e.name = e.name.slice(first.length);
  }

  if (files.length > limits.maxEntries) return bad("too-many-files", "", `This zip has ${files.length} files; the limit is ${limits.maxEntries}.`, "Remove files you do not need.");
  const seen = new Map<string, string>();
  for (const e of files) {
    const key = e.name.toLowerCase();
    const other = seen.get(key);
    if (other !== undefined) return bad("duplicate-name", e.name, other === e.name ? `The zip contains "${e.name}" twice.` : `The zip contains "${other}" and "${e.name}", which differ only by capital letters.`, "Rename or remove one of them.");
    seen.set(key, e.name);
  }

  // sizes: declared limits before any decompression
  let total = 0;
  for (const e of files) {
    if (e.flags & 1) return bad("zip-encrypted", e.name, `"${e.name}" is password-protected, which is not supported.`, "Make the zip again without a password.");
    if (e.method !== 0 && e.method !== 8) return bad("zip-unsupported", e.name, `"${e.name}" uses a compression method that is not supported.`, "Make the zip again with normal (deflate) compression.");
    const ext = extensionOf(e.name);
    const isScene = ext === "json";
    const cap = isScene ? limits.maxSceneBytes : limits.maxFileBytes;
    if (e.size > cap) return bad("file-too-big", e.name, `"${e.name}" is ${sizeWords(e.size)}; the limit for this kind of file is ${sizeWords(cap)}.`, isScene ? "Make the scene smaller." : "Use a smaller or more compressed file.");
    if (e.method === 0 && e.compressed !== e.size) return damaged(`the size of "${e.name}" does not add up`);
    if (e.size > limits.ratioFloorBytes && e.compressed > 0 && e.size / e.compressed > limits.maxRatio) return bad("zip-bomb", e.name, `"${e.name}" expands more than ${limits.maxRatio} times when opened, which looks like a zip bomb.`, "Remove that file.");
    if (e.size > 0 && e.compressed === 0) return damaged(`"${e.name}" has no data`);
    total += e.size;
    if (total > limits.maxTotalBytes) return bad("zip-too-big", "", `Everything in this zip adds up to more than ${mb(limits.maxTotalBytes)} when opened.`, "Remove large files, or use smaller models and pictures.");
  }

  // where each entry's data sits; no two may overlap
  const located: { e: Entry; start: number; end: number }[] = [];
  for (const e of files) {
    if (e.offset + 30 > bytes.length || view.getUint32(e.offset, true) !== 0x04034b50) return damaged(`"${e.name}" cannot be found inside it`);
    const nameLength = view.getUint16(e.offset + 26, true);
    const extraLength = view.getUint16(e.offset + 28, true);
    const nameEnd = e.offset + 30 + nameLength;
    if (nameEnd > bytes.length || decoder.decode(bytes.subarray(e.offset + 30, nameEnd)) !== e.rawName) return damaged(`"${e.name}" has two different names inside it`);
    const start = nameEnd + extraLength;
    const end = start + e.compressed;
    if (end > bytes.length || end > dirOffset) return damaged(`"${e.name}" is cut off`);
    located.push({ e, start, end });
  }
  const byStart = [...located].sort((a, b) => a.start - b.start);
  for (let i = 1; i < byStart.length; i++) if (byStart[i].start < byStart[i - 1].end) return damaged("two files share the same bytes");

  // sort out which file is the scene before decompressing anything
  const rootJson = files.filter((e) => extensionOf(e.name) === "json" && !e.name.includes("/") && e.name !== "project.json");
  const sceneEntry = rootJson.find((e) => e.name === "scene.json") ?? (rootJson.length === 1 ? rootJson[0] : undefined);
  if (!sceneEntry) {
    if (rootJson.length === 0) return bad("no-scene", "", "This zip has no scene file. Scene Studio looks for scene.json.", 'Add the scene text to the zip as a file named "scene.json".');
    return bad("several-scenes", "", `This zip has ${rootJson.length} .json files (${rootJson.map((e) => e.name).join(", ")}) and none is called scene.json.`, 'Rename the scene file to "scene.json" and remove the others.');
  }

  const assets = new Map<string, Uint8Array>();
  let sceneBytes: Uint8Array | undefined;
  let projectInfo: Uint8Array | undefined;
  for (const { e, start, end } of located) {
    const ext = extensionOf(e.name);
    const format = FORMATS[ext];
    const isScene = e === sceneEntry;
    const isProject = e.name === "project.json";
    if (!isScene && !isProject && !format) {
      ignored.push(e.name);
      issues.push(
        ext === "gltf"
          ? { severity: "warning", code: "gltf-not-supported", path: e.name, message: `"${e.name}" was left out: a .gltf file needs loose files next to it.`, fix: "Export the model as one .glb file instead." }
          : { severity: "warning", code: "unsupported-file", path: e.name, message: `"${e.name}" was left out because Scene Studio does not use ${ext ? `.${ext}` : "this kind of"} files.`, fix: `Allowed: ${ALLOWED_EXTENSIONS.join(", ")}.` },
      );
      continue;
    }
    const stored = bytes.subarray(start, end);
    let data: Uint8Array;
    if (e.method === 0) data = stored;
    else {
      try {
        data = await inflate(stored, e.size);
      } catch {
        issues.push({ severity: "error", code: "file-damaged", path: e.name, message: `"${e.name}" is damaged and cannot be opened.`, fix: "Make the zip again, or replace that file." });
        continue;
      }
    }
    if (data.length !== e.size) {
      issues.push({ severity: "error", code: "size-mismatch", path: e.name, message: `"${e.name}" is not the size the zip says it is, so the zip was probably tampered with or damaged.`, fix: "Make the zip again from the original files." });
      continue;
    }
    if (crc32(data) !== e.crc) {
      issues.push({ severity: "error", code: "file-damaged", path: e.name, message: `"${e.name}" is damaged (its contents do not match its checksum).`, fix: "Make the zip again, or replace that file." });
      continue;
    }
    if (format && !format.matches(data)) {
      issues.push({ severity: "error", code: "wrong-file-type", path: e.name, message: `"${e.name}" is not really ${format.what}: its contents are something else.`, fix: `Replace it with a real ${format.what}, or rename it to match what it is.` });
      continue;
    }
    if (isScene) sceneBytes = data;
    else if (isProject) projectInfo = data;
    else assets.set(e.name, data);
  }

  let sceneText: string | undefined;
  if (sceneBytes) {
    try {
      sceneText = new TextDecoder("utf-8", { fatal: true }).decode(sceneBytes);
    } catch {
      issues.push({ severity: "error", code: "scene-not-text", path: sceneEntry.name, message: `"${sceneEntry.name}" is not readable text.`, fix: "Save the scene as plain text (UTF-8)." });
    }
  }
  const ok = sceneText !== undefined && !issues.some((i) => i.severity === "error");
  return { ok, scenePath: sceneEntry.name, sceneText, assets, projectInfo, ignored, issues };
}

// ---- writing ---------------------------------------------------------------------------------

export interface ZipEntry {
  name: string;
  data: Uint8Array;
}

const DOS_DATE = 0x0021; // 1980-01-01, so the same files always give the same zip
const encoder = new TextEncoder();

/**
 * Write a zip. Entries are sorted by name and carry a fixed date, so the same files give the same layout.
 * With `deflate`, an entry is compressed when that makes it smaller; without it everything is stored as is.
 */
export async function writeZip(entries: readonly ZipEntry[], deflate?: Deflate): Promise<Uint8Array> {
  if (entries.length > 0xfffe) throw new Error("There are too many files to put in one zip.");
  const sorted = [...entries].sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  const names = new Set<string>();
  const local: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;
  for (const entry of sorted) {
    const cleaned = cleanEntryName(entry.name);
    if ("unsafe" in cleaned || cleaned.name.endsWith("/")) throw new Error(`"${entry.name}" cannot go in a zip: ${"unsafe" in cleaned ? cleaned.unsafe : "it is a folder"}.`);
    if (names.has(cleaned.name.toLowerCase())) throw new Error(`"${entry.name}" appears twice.`);
    names.add(cleaned.name.toLowerCase());
    if (entry.data.length > 0xfffffff0) throw new Error(`"${entry.name}" is too large for a zip.`);
    let method = 0;
    let body = entry.data;
    if (deflate && entry.data.length > 64) {
      const packed = await deflate(entry.data);
      if (packed.length < entry.data.length) {
        method = 8;
        body = packed;
      }
    }
    const name = encoder.encode(cleaned.name);
    const crc = crc32(entry.data);
    const head = new Uint8Array(30 + name.length);
    const hv = new DataView(head.buffer);
    hv.setUint32(0, 0x04034b50, true);
    hv.setUint16(4, 20, true);
    hv.setUint16(6, 0x0800, true);
    hv.setUint16(8, method, true);
    hv.setUint16(10, 0, true);
    hv.setUint16(12, DOS_DATE, true);
    hv.setUint32(14, crc, true);
    hv.setUint32(18, body.length, true);
    hv.setUint32(22, entry.data.length, true);
    hv.setUint16(26, name.length, true);
    head.set(name, 30);
    const dir = new Uint8Array(46 + name.length);
    const dv = new DataView(dir.buffer);
    dv.setUint32(0, 0x02014b50, true);
    dv.setUint16(4, 20, true);
    dv.setUint16(6, 20, true);
    dv.setUint16(8, 0x0800, true);
    dv.setUint16(10, method, true);
    dv.setUint16(14, DOS_DATE, true);
    dv.setUint32(16, crc, true);
    dv.setUint32(20, body.length, true);
    dv.setUint32(24, entry.data.length, true);
    dv.setUint16(28, name.length, true);
    dv.setUint32(42, offset, true);
    dir.set(name, 46);
    local.push(head, body);
    central.push(dir);
    offset += head.length + body.length;
    if (offset > 0xfffffff0) throw new Error("The files add up to more than a zip can hold.");
  }
  const dirSize = central.reduce((n, c) => n + c.length, 0);
  const end = new Uint8Array(22);
  const ev = new DataView(end.buffer);
  ev.setUint32(0, 0x06054b50, true);
  ev.setUint16(8, sorted.length, true);
  ev.setUint16(10, sorted.length, true);
  ev.setUint32(12, dirSize, true);
  ev.setUint32(16, offset, true);
  const parts = [...local, ...central, end];
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out;
}

// ---- single files ----------------------------------------------------------------------------

export type LooseFileResult = { ok: true; name: string; kind: AssetKind } | { ok: false; issue: BundleIssue };

/**
 * One file the person picked on its own (not inside a zip): the same name, size and "is it really that kind of file"
 * rules a zip entry gets. Scene text itself (.json) is not an asset and is handled by the caller.
 */
export function checkLooseFile(name: string, bytes: Uint8Array, limits: BundleLimits = BUNDLE_LIMITS): LooseFileResult {
  const bad = (code: string, message: string, fix: string): LooseFileResult => ({ ok: false, issue: { severity: "error", code, path: name, message, fix } });
  const cleaned = cleanEntryName(name);
  if ("unsafe" in cleaned) return bad("unsafe-name", `"${name}" cannot be used because ${cleaned.unsafe}.`, "Rename the file so it has a plain name like hero.glb.");
  if (cleaned.name.includes("/")) return bad("unsafe-name", `"${name}" cannot be used because it has a folder in its name.`, "Rename the file so it has a plain name like hero.glb.");
  const ext = extensionOf(cleaned.name);
  const format = FORMATS[ext];
  if (!format) {
    return ext === "gltf"
      ? bad("gltf-not-supported", `"${name}" was not added: a .gltf file needs loose files next to it.`, "Export the model as one .glb file instead.")
      : bad("unsupported-file", `"${name}" was not added because Scene Studio does not use ${ext ? `.${ext}` : "this kind of"} files.`, `Allowed: ${ALLOWED_EXTENSIONS.join(", ")}.`);
  }
  if (bytes.length > limits.maxFileBytes) return bad("file-too-big", `"${name}" is ${sizeWords(bytes.length)}; the limit for one file is ${sizeWords(limits.maxFileBytes)}.`, "Use a smaller or more compressed version of the file.");
  if (!format.matches(bytes)) return bad("wrong-file-type", `"${name}" is not really ${format.what}: its contents are something else.`, `Replace it with a real ${format.what}, or rename it to match what it is.`);
  return { ok: true, name: cleaned.name, kind: format.kind };
}
