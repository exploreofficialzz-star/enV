import assert from "node:assert/strict";
import test from "node:test";
import { createABookArchive, readABookArchive } from "./archive.ts";
import { assertABookAttachmentBatch, assertABookAttachmentSize, assertABookImportQuotas, assertABookNoteForStorage, getABookLocalDatabaseName } from "./local-store.ts";
import type { ABookAttachment, ABookNote, ABookRevision } from "./local-store.ts";

const note: ABookNote = {
  id: "note-1", title: "Research", body: "Local-only content", notebook: "Inbox", tags: ["local", "pdf"],
  pinned: true, archived: false, deletedAt: null, createdAt: 1_700_000_000_000, updatedAt: 1_700_000_000_100, revision: 1,
};
const revision: ABookRevision = {
  id: "revision-1", noteId: note.id, revision: 1, title: "Older title", body: "Earlier text",
  notebook: "Inbox", tags: ["local"], createdAt: 1_700_000_000_050,
};
const attachment: ABookAttachment = {
  id: "file-1", noteId: note.id, name: "sample.pdf", type: "application/pdf",
  size: 5, createdAt: 1_700_000_000_200, blob: new Blob([new Uint8Array([1, 2, 3, 4, 5])], { type: "application/pdf" }),
};

test("A book backup round-trips notes, revision history and attachment bytes", async () => {
  const archive = await createABookArchive([note], [revision], [attachment]);
  const restored = await readABookArchive(archive);
  assert.equal(restored.notes[0].title, note.title);
  assert.equal(restored.revisions[0].body, revision.body);
  assert.equal(restored.attachments[0].name, attachment.name);
  assert.deepEqual([...new Uint8Array(await restored.attachments[0].blob.arrayBuffer())], [1, 2, 3, 4, 5]);
});

test("A book backup rejects an empty or unsupported archive", async () => {
  await assert.rejects(() => readABookArchive(new Blob()), /non-empty/);
  await assert.rejects(() => readABookArchive(new Blob(["not a zip"])), /archive directory/);
});

test("A book backup rejects inconsistent attachment metadata", async () => {
  const archive = await createABookArchive([note], [], [attachment]);
  const { unzipSync, zipSync, strFromU8, strToU8 } = await import("fflate");
  const files = unzipSync(new Uint8Array(await archive.arrayBuffer()));
  const manifest = JSON.parse(strFromU8(files["manifest.json"])) as { attachments: Array<{ size: number }> };
  manifest.attachments[0].size += 1;
  files["manifest.json"] = strToU8(JSON.stringify(manifest));
  const damaged = new Blob([zipSync(files)]);
  await assert.rejects(() => readABookArchive(damaged), /missing, damaged/);
});
test("A book backups reject duplicate note, revision and attachment IDs", async () => {
  await assert.rejects(() => createABookArchive([note, { ...note }], [], []), /cannot be safely exported/);
  await assert.rejects(() => createABookArchive([note], [revision, { ...revision }], []), /cannot be safely exported/);
  await assert.rejects(() => createABookArchive([note], [], [attachment, { ...attachment }]), /cannot be safely exported/);
});


test("legacy JSON import validates the complete file before any local writes", async () => {
  const { parseABookLegacyNotesJson } = await import("./archive.ts");
  const parsed = parseABookLegacyNotesJson(JSON.stringify({
    format: "env.abook.notes.v1",
    notes: [{ id: "legacy-1", title: "Imported", body: "Body", notebook: "Research", tags: ["local"], pinned: true, archived: false }],
  }));
  assert.equal(parsed.length, 1);
  assert.equal(parsed[0].notebook, "Research");
  assert.equal(parsed[0].pinned, true);
  assert.equal(parsed[0].revision, 0);
  assert.equal(parsed[0].deletedAt, null);
});

test("legacy JSON import rejects duplicate IDs and a malformed later record", async () => {
  const { parseABookLegacyNotesJson } = await import("./archive.ts");
  assert.throws(() => parseABookLegacyNotesJson(JSON.stringify({
    format: "env.abook.notes.v1",
    notes: [
      { id: "same", title: "One", body: "Body", tags: [] },
      { id: "same", title: "Two", body: "Body", tags: [] },
    ],
  })), /duplicate note IDs/);
  assert.throws(() => parseABookLegacyNotesJson(JSON.stringify({
    format: "env.abook.notes.v1",
    notes: [
      { id: "valid", title: "One", body: "Body", tags: [] },
      { id: "bad", title: "Two", body: "Body", tags: ["x".repeat(201)] },
    ],
  })), /invalid note record/);
});

test("legacy JSON import enforces record bounds", async () => {
  const { parseABookLegacyNotesJson } = await import("./archive.ts");
  assert.throws(() => parseABookLegacyNotesJson(JSON.stringify({
    format: "env.abook.notes.v1",
    notes: [{ id: "bad", title: "Title", body: "Body", tags: Array.from({ length: 51 }, () => "tag") }],
  })), /invalid note record/);
});


test("A book local attachments stay within the portable backup limit", () => {
  assertABookAttachmentSize({ size: 1 });
  assertABookAttachmentSize({ size: 100 * 1024 * 1024 });
  assert.throws(() => assertABookAttachmentSize({ size: 0 }), /non-empty attachment/);
  assert.throws(() => assertABookAttachmentSize({ size: 100 * 1024 * 1024 + 1 }), /100 MB or smaller/);
});


test("A book attachment batches enforce per-file, total-library and count limits", () => {
  assertABookAttachmentBatch([{ size: 1 }, { size: 2 }], 10, 2);
  assertABookAttachmentBatch([{ size: 100 * 1024 * 1024 }], 50 * 1024 * 1024, 0);
  assert.throws(() => assertABookAttachmentBatch([{ size: 100 * 1024 * 1024 + 1 }]), /100 MB or smaller/);
  assert.throws(() => assertABookAttachmentBatch([{ size: 1 }, { size: 2 }], 150 * 1024 * 1024 - 2, 0), /150 MB/);
  assert.throws(() => assertABookAttachmentBatch([{ size: 1 }], 0, 10_000), /10,000 local attachments/);
  assert.throws(() => assertABookAttachmentBatch([]), /at least one attachment/);
});


test("A book exports stored ZIP entries accepted by the native iOS archive reader", async () => {
  const archive = await createABookArchive([note], [], [attachment]);
  const bytes = new Uint8Array(await archive.arrayBuffer());
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  assert.equal(view.getUint32(0, true), 0x04034b50, "first entry must be a ZIP local-file header");
  assert.equal(view.getUint16(8, true), 0, "Web backups must use ZIP STORE (method 0) for native iOS portability");
  const centralOffset = (() => {
    for (let offset = bytes.length - 22; offset >= Math.max(0, bytes.length - 65_557); offset -= 1) {
      if (view.getUint32(offset, true) === 0x06054b50) return view.getUint32(offset + 16, true);
    }
    throw new Error("ZIP end-of-central-directory record not found");
  })();
  assert.equal(view.getUint32(centralOffset, true), 0x02014b50);
  assert.equal(view.getUint16(centralOffset + 10, true), 0);
  assert.deepEqual((await readABookArchive(archive)).attachments[0].blob.size, attachment.size);
});


test("A book backup restore enforces combined local note, revision and attachment quotas", () => {
  const base = {
    incomingNotes: 2,
    existingNotes: 3,
    incomingRevisions: 4,
    existingRevisions: 5,
    incomingAttachments: [],
    existingAttachmentCount: 10,
    existingAttachmentBytes: 1024,
  };
  assertABookImportQuotas(base);
  assert.throws(() => assertABookImportQuotas({ ...base, incomingNotes: 10_000 }), /10,000 local notes/);
  assert.throws(() => assertABookImportQuotas({ ...base, incomingRevisions: 100_000 }), /100,000 local revisions/);
  assert.throws(() => assertABookImportQuotas({ ...base, existingAttachmentCount: 10_000, incomingAttachments: [{ blob: new Blob(["x"]), size: 1 }] }), /10,000 local attachments/);
  assert.throws(() => assertABookImportQuotas({ ...base, existingAttachmentBytes: 150 * 1024 * 1024 + 1 }), /portable backup limit/);
  assertABookImportQuotas({
    ...base,
    incomingAttachments: [{ blob: new Blob(["small"]), size: 5 }],
  });
  assert.throws(() => assertABookImportQuotas({
    ...base,
    incomingAttachments: [{ blob: new Blob(["different"]), size: 2 }],
  }), /invalid recorded size/);
  assert.throws(() => assertABookImportQuotas({
    ...base,
    existingAttachmentBytes: 150 * 1024 * 1024 - 1,
    incomingAttachments: [{ blob: new Blob(["more"]), size: 4 }],
  }), /150 MB/);
});


test("A book keeps a separate local IndexedDB namespace for each signed-in profile", () => {
  const first = getABookLocalDatabaseName("account-one");
  const second = getABookLocalDatabaseName("account-two");
  const guest = getABookLocalDatabaseName(null);
  assert.notEqual(first, second);
  assert.notEqual(first, guest);
  assert.equal(guest, getABookLocalDatabaseName(""));
  assert.equal(first, getABookLocalDatabaseName("account-one"));
});


test("A book note writes stay inside the portable local note limits", () => {
  assertABookNoteForStorage(note);
  assert.throws(() => assertABookNoteForStorage({ ...note, title: "x".repeat(10_001) }), /local storage limits/);
  assert.throws(() => assertABookNoteForStorage({ ...note, body: "x".repeat(5_000_001) }), /local storage limits/);
  assert.throws(() => assertABookNoteForStorage({ ...note, notebook: "x".repeat(501) }), /local storage limits/);
  assert.throws(() => assertABookNoteForStorage({ ...note, tags: Array.from({ length: 51 }, () => "tag") }), /local storage limits/);
  assert.throws(() => assertABookNoteForStorage({ ...note, tags: ["x".repeat(201)] }), /local storage limits/);
  assert.throws(() => assertABookNoteForStorage({ ...note, revision: -1 }), /local storage limits/);
});
