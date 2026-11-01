import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";
import type { ABookAttachment, ABookNote, ABookRevision } from "./local-store.ts";

export type ABookArchiveData = {
  notes: ABookNote[];
  revisions: ABookRevision[];
  attachments: ABookAttachment[];
};

type ABookArchiveManifest = {
  format: "env.abook.archive.v1";
  createdAt: string;
  notes: ABookNote[];
  revisions: ABookRevision[];
  attachments: Array<Omit<ABookAttachment, "blob"> & { path: string }>;
};

const MAX_ARCHIVE_BYTES = 180 * 1024 * 1024;
const MAX_UNCOMPRESSED_BYTES = 150 * 1024 * 1024;
const MAX_ATTACHMENT_BYTES = 100 * 1024 * 1024;
const MAX_NOTES = 10_000;
const MAX_REVISIONS = 100_000;
const MAX_ATTACHMENTS = 10_000;

function fail(message: string): never {
  throw new Error(message);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isValidNote(value: unknown): value is ABookNote {
  if (!isRecord(value)) return false;
  return typeof value.id === "string" && value.id.length > 0 && value.id.length <= 180
    && typeof value.title === "string" && value.title.length <= 10_000
    && typeof value.body === "string" && value.body.length <= 5_000_000
    && typeof value.notebook === "string" && value.notebook.length <= 500
    && Array.isArray(value.tags) && value.tags.length <= 50
    && value.tags.every((tag) => typeof tag === "string" && tag.length <= 200)
    && typeof value.pinned === "boolean" && typeof value.archived === "boolean"
    && (value.deletedAt === null || (typeof value.deletedAt === "number" && Number.isFinite(value.deletedAt)))
    && Number.isSafeInteger(value.createdAt) && Number.isSafeInteger(value.updatedAt)
    && Number.isSafeInteger(value.revision) && Number(value.revision) >= 0;
}

function isValidRevision(value: unknown, noteIds: Set<string>): value is ABookRevision {
  if (!isRecord(value)) return false;
  return typeof value.id === "string" && value.id.length > 0 && value.id.length <= 180
    && typeof value.noteId === "string" && noteIds.has(value.noteId)
    && Number.isSafeInteger(value.revision) && Number(value.revision) >= 0
    && typeof value.title === "string" && value.title.length <= 10_000
    && typeof value.body === "string" && value.body.length <= 5_000_000
    && typeof value.notebook === "string" && value.notebook.length <= 500
    && Array.isArray(value.tags) && value.tags.length <= 50
    && value.tags.every((tag) => typeof tag === "string" && tag.length <= 200)
    && Number.isSafeInteger(value.createdAt);
}

function inspectZipDirectory(bytes: Uint8Array): string[] {
  if (bytes.byteLength < 22) fail("This is not a valid A book backup archive.");
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const min = Math.max(0, bytes.byteLength - 65_557);
  let end = -1;
  for (let offset = bytes.byteLength - 22; offset >= min; offset -= 1) {
    if (view.getUint32(offset, true) === 0x06054b50) { end = offset; break; }
  }
  if (end < 0) fail("The backup archive directory is missing or damaged.");
  const entries = view.getUint16(end + 10, true);
  const directorySize = view.getUint32(end + 12, true);
  const directoryOffset = view.getUint32(end + 16, true);
  if (entries > MAX_ATTACHMENTS + 1 || directorySize === 0xffffffff || directoryOffset === 0xffffffff
    || directoryOffset + directorySize > end) {
    fail("The backup archive is too large or uses an unsupported ZIP format.");
  }
  const names: string[] = [];
  let total = 0;
  let cursor = directoryOffset;
  for (let index = 0; index < entries; index += 1) {
    if (cursor + 46 > bytes.byteLength || view.getUint32(cursor, true) !== 0x02014b50) {
      fail("The backup archive directory is damaged.");
    }
    const flags = view.getUint16(cursor + 8, true);
    const method = view.getUint16(cursor + 10, true);
    const compressed = view.getUint32(cursor + 20, true);
    const uncompressed = view.getUint32(cursor + 24, true);
    const nameLength = view.getUint16(cursor + 28, true);
    const extraLength = view.getUint16(cursor + 30, true);
    const commentLength = view.getUint16(cursor + 32, true);
    if ((flags & 1) !== 0 || (method !== 0 && method !== 8)
      || compressed === 0xffffffff || uncompressed === 0xffffffff) {
      fail("Encrypted or unsupported ZIP entries cannot be imported.");
    }
    if (cursor + 46 + nameLength + extraLength + commentLength > bytes.byteLength) {
      fail("The backup archive contains an invalid entry.");
    }
    const name = new TextDecoder().decode(bytes.subarray(cursor + 46, cursor + 46 + nameLength));
    if (!name || name.startsWith("/") || name.includes("\\")
      || name.split("/").some((part) => part === ".." || part === "." || part === "")) {
      fail("The backup archive contains an unsafe file path.");
    }
    if (names.includes(name)) fail("The backup archive contains duplicate file names.");
    names.push(name);
    total += uncompressed;
    if (uncompressed > MAX_ATTACHMENT_BYTES || total > MAX_UNCOMPRESSED_BYTES) {
      fail("The backup expands beyond A book's 150 MB safety limit.");
    }
    cursor += 46 + nameLength + extraLength + commentLength;
  }
  if (cursor !== directoryOffset + directorySize) fail("The backup archive directory is inconsistent.");
  return names;
}

export async function createABookArchive(
  notes: ABookNote[],
  revisions: ABookRevision[],
  attachments: ABookAttachment[],
): Promise<Blob> {
  if (notes.length > MAX_NOTES || revisions.length > MAX_REVISIONS || attachments.length > MAX_ATTACHMENTS) {
    fail("This library exceeds the A book backup item limit. Export smaller groups of notes.");
  }
  const noteIds = new Set(notes.map((note) => note.id));
  const revisionIds = new Set(revisions.map((revision) => revision.id));
  const attachmentIds = new Set(attachments.map((attachment) => attachment.id));
  if (noteIds.size !== notes.length || revisionIds.size !== revisions.length || attachmentIds.size !== attachments.length
    || notes.some((note) => !isValidNote(note))
    || revisions.some((revision) => !isValidRevision(revision, noteIds))) {
    fail("The local library contains a record that cannot be safely exported.");
  }
  const files: Record<string, Uint8Array> = {};
  const attachmentManifest: ABookArchiveManifest["attachments"] = [];
  let totalBytes = 0;
  for (let index = 0; index < attachments.length; index += 1) {
    const attachment = attachments[index];
    if (!noteIds.has(attachment.noteId) || !attachment.id || attachment.name.length > 500
      || attachment.type.length > 200 || attachment.size !== attachment.blob.size
      || attachment.size > MAX_ATTACHMENT_BYTES) {
      fail("An attachment is invalid or exceeds the 100 MB per-file backup limit.");
    }
    totalBytes += attachment.size;
    if (totalBytes > MAX_UNCOMPRESSED_BYTES) fail("This backup exceeds the 150 MB total attachment limit.");
    const path = `attachments/${index}.bin`;
    files[path] = new Uint8Array(await attachment.blob.arrayBuffer());
    attachmentManifest.push({
      id: attachment.id,
      noteId: attachment.noteId,
      name: attachment.name,
      type: attachment.type,
      size: attachment.size,
      createdAt: attachment.createdAt,
      path,
    });
  }
  const manifest: ABookArchiveManifest = {
    format: "env.abook.archive.v1",
    createdAt: new Date().toISOString(),
    notes,
    revisions,
    attachments: attachmentManifest,
  };
  const manifestBytes = strToU8(JSON.stringify(manifest));
  if (manifestBytes.byteLength + totalBytes > MAX_UNCOMPRESSED_BYTES) fail("This backup exceeds the 150 MB total library limit.");
  files["manifest.json"] = manifestBytes;
  const zipped = zipSync(files, { level: 0 });
  if (zipped.byteLength > MAX_ARCHIVE_BYTES) fail("The backup archive exceeds 180 MB.");
  const copy = zipped.slice();
  return new Blob([copy.buffer as ArrayBuffer], { type: "application/zip" });
}

export async function readABookArchive(file: Blob): Promise<ABookArchiveData> {
  if (file.size <= 0 || file.size > MAX_ARCHIVE_BYTES) {
    fail("Choose a non-empty A book backup smaller than 180 MB.");
  }
  const bytes = new Uint8Array(await file.arrayBuffer());
  const paths = inspectZipDirectory(bytes);
  if (!paths.includes("manifest.json")) fail("This archive is missing its A book manifest.");
  const files = unzipSync(bytes);
  const manifestBytes = files["manifest.json"];
  if (!manifestBytes) fail("The A book manifest could not be read.");
  let manifest: unknown;
  try { manifest = JSON.parse(strFromU8(manifestBytes)); }
  catch { fail("The A book backup manifest is not valid JSON."); }
  if (!isRecord(manifest) || manifest.format !== "env.abook.archive.v1"
    || !Array.isArray(manifest.notes) || !Array.isArray(manifest.revisions) || !Array.isArray(manifest.attachments)) {
    fail("This is not a supported A book backup.");
  }
  if (manifest.notes.length > MAX_NOTES || manifest.revisions.length > MAX_REVISIONS
    || manifest.attachments.length > MAX_ATTACHMENTS) fail("The backup contains too many records.");
  const notes = manifest.notes;
  if (!notes.every(isValidNote)) fail("The backup contains an invalid note.");
  const noteIds = new Set(notes.map((note) => note.id));
  if (noteIds.size !== notes.length) fail("The backup contains duplicate note IDs.");
  const revisions = manifest.revisions;
  const revisionIds = new Set(revisions.filter(isRecord).map((revision) => revision.id));
  if (!revisions.every((revision) => isValidRevision(revision, noteIds)) || revisionIds.size !== revisions.length) {
    fail("The backup contains an invalid note revision.");
  }
  const attachments: ABookAttachment[] = [];
  const attachmentIds = new Set<string>();
  const expectedPaths = new Set(["manifest.json"]);
  let totalBytes = 0;
  for (const raw of manifest.attachments) {
    if (!isRecord(raw) || typeof raw.path !== "string" || typeof raw.id !== "string"
      || typeof raw.noteId !== "string" || typeof raw.name !== "string" || typeof raw.type !== "string"
      || !Number.isSafeInteger(raw.size) || !Number.isSafeInteger(raw.createdAt)
      || !noteIds.has(raw.noteId) || raw.name.length > 500 || raw.type.length > 200) {
      fail("The backup contains invalid attachment metadata.");
    }
    if (!raw.id || attachmentIds.has(raw.id)) fail("The backup contains duplicate attachment IDs.");
    attachmentIds.add(raw.id);
    if (!/^attachments\/\d+\.bin$/.test(raw.path) || expectedPaths.has(raw.path)) {
      fail("The backup contains an invalid or duplicate attachment path.");
    }
    expectedPaths.add(raw.path);
    const data = files[raw.path];
    if (!data || data.byteLength !== raw.size || data.byteLength > MAX_ATTACHMENT_BYTES) {
      fail("An attachment is missing, damaged, or larger than the supported limit.");
    }
    totalBytes += data.byteLength;
    if (totalBytes > MAX_UNCOMPRESSED_BYTES) fail("The backup exceeds the 150 MB attachment limit.");
    const copy = data.slice();
    attachments.push({
      id: raw.id,
      noteId: raw.noteId,
      name: raw.name,
      type: raw.type || "application/octet-stream",
      size: raw.size as number,
      createdAt: raw.createdAt as number,
      blob: new Blob([copy.buffer as ArrayBuffer], { type: raw.type }),
    });
  }
  if (paths.length !== expectedPaths.size || paths.some((path) => !expectedPaths.has(path))) {
    fail("The backup archive contains unexpected files.");
  }
  return { notes, revisions, attachments };
}
