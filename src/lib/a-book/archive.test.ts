import assert from "node:assert/strict";
import test from "node:test";
import { createABookArchive, readABookArchive } from "./archive.ts";
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
