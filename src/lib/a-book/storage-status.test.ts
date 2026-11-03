import assert from "node:assert/strict";
import test from "node:test";
import { formatABookStorageBytes, getABookStorageNotice } from "./local-store.ts";

const MB = 1024 * 1024;

test("A book formats browser storage estimates in readable binary units", () => {
  assert.equal(formatABookStorageBytes(0), "0 B");
  assert.equal(formatABookStorageBytes(1024), "1.0 KB");
  assert.equal(formatABookStorageBytes(1536), "1.5 KB");
  assert.equal(formatABookStorageBytes(40 * MB), "40 MB");
  assert.equal(formatABookStorageBytes(-1), "unknown size");
  assert.equal(formatABookStorageBytes(Number.NaN), "unknown size");
});

test("A book does not show an extra storage notice when persistent storage is available but estimates are not", () => {
  assert.equal(getABookStorageNotice({ persistent: true }), null);
});

test("A book warns that browser data may be cleared when persistence is unavailable", () => {
  const notice = getABookStorageNotice({ persistent: false });
  assert.equal(notice?.warning, true);
  assert.match(notice?.message ?? "", /may be cleared/);
  assert.match(notice?.message ?? "", /local backup/);
});

test("A book reports approximate origin-wide browser storage usage without claiming it belongs only to A book", () => {
  const notice = getABookStorageNotice({
    persistent: true,
    quota: 512 * MB,
    usage: 40 * MB,
  });
  assert.equal(notice?.warning, false);
  assert.match(notice?.message ?? "", /Browser storage estimate/);
  assert.match(notice?.message ?? "", /40 MB of 512 MB used/);
});

test("A book warns when the estimated browser storage remaining is low", () => {
  const notice = getABookStorageNotice({
    persistent: true,
    quota: 200 * MB,
    usage: 180 * MB,
  });
  assert.equal(notice?.warning, true);
  assert.match(notice?.message ?? "", /Low browser storage/);
  assert.match(notice?.message ?? "", /20 MB remaining/);
  assert.match(notice?.message ?? "", /Export a local backup/);
});

test("A book clamps an inconsistent estimate instead of reporting negative free space", () => {
  const notice = getABookStorageNotice({
    persistent: true,
    quota: 100 * MB,
    usage: 120 * MB,
  });
  assert.equal(notice?.warning, true);
  assert.match(notice?.message ?? "", /0 B remaining/);
});
