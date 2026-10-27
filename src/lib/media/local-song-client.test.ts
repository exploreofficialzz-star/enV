import assert from "node:assert/strict";
import { test } from "node:test";
import { localCompanionUrl, localSongResultSchema } from "./local-song-client.ts";

test("local companion accepts loopback and rejects remote, credentials and URL payloads", () => {
  assert.equal(localCompanionUrl("http://127.0.0.1:8765"), "http://127.0.0.1:8765");
  assert.equal(localCompanionUrl("http://localhost:8765/"), "http://localhost:8765");
  for (const value of [
    "https://remote.example",
    "http://127.0.0.1.evil.test",
    "http://user@localhost:8765",
    "http://127.0.0.1:8765/x",
    "http://127.0.0.1:8765/?token=x",
    "http://192.168.1.1:8765",
  ])
    assert.throws(() => localCompanionUrl(value));
});

test("unknown remote result contracts and nonfinite scores are rejected", () => {
  assert.equal(
    localSongResultSchema.safeParse({ schema_version: "arbitrary", reviewed: true }).success,
    false,
  );
});
