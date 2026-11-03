import test from "node:test";
import assert from "node:assert/strict";
import { formatArchiveBytes, sanitizeArchivePath, shouldStoreWithoutCompression } from "./archive-utils.ts";

test("archive paths reject traversal and absolute paths", () => {
  assert.equal(sanitizeArchivePath("../../private.txt"), null);
  assert.equal(sanitizeArchivePath("folder/../private.txt"), null);
  assert.equal(sanitizeArchivePath("/etc/passwd"), null);
  assert.equal(sanitizeArchivePath("C:\\Windows\\system.ini"), null);
  assert.equal(sanitizeArchivePath("folder\\safe.txt"), "folder/safe.txt");
  assert.equal(sanitizeArchivePath("./folder/safe.txt"), "folder/safe.txt");
});

test("pre-compressed media is stored without wasting CPU", () => {
  assert.equal(shouldStoreWithoutCompression("photo.JPG"), true);
  assert.equal(shouldStoreWithoutCompression("video.mp4"), true);
  assert.equal(shouldStoreWithoutCompression("notes.txt"), false);
});

test("file sizes are displayed in readable binary units", () => {
  assert.equal(formatArchiveBytes(0), "0 B");
  assert.equal(formatArchiveBytes(1024), "1.00 KB");
  assert.equal(formatArchiveBytes(1024 ** 3), "1.00 GB");
});
