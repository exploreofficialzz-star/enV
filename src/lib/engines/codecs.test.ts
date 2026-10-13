import { test } from "node:test";
import assert from "node:assert/strict";
import { runCodec } from "./codecs.ts";

test("base-convert converts common bases and signed values", async () => {
  assert.equal(await runCodec("base-convert", "255", { fromBase: "10", toBase: "16" }), "ff");
  assert.equal(await runCodec("base-convert", "ff", { fromBase: "16", toBase: "2" }), "11111111");
  assert.equal(await runCodec("base-convert", "-ff", { fromBase: "16", toBase: "2" }), "-11111111");
  assert.equal(await runCodec("base-convert", "+42", { fromBase: "10", toBase: "8" }), "52");
  assert.equal(await runCodec("base-convert", "-0", { fromBase: "10", toBase: "2" }), "0");
});

test("base-convert preserves integers beyond JavaScript's safe-number range", async () => {
  const decimal = "123456789012345678901234567890";
  const expected = BigInt(decimal).toString(36);
  assert.equal(await runCodec("base-convert", decimal, { fromBase: "10", toBase: "36" }), expected);
});

test("base-convert rejects partial parses and digits outside the source base", async () => {
  await assert.rejects(runCodec("base-convert", "12z", { fromBase: "10", toBase: "16" }), /Invalid number/);
  await assert.rejects(runCodec("base-convert", "102", { fromBase: "2", toBase: "10" }), /Invalid number/);
  await assert.rejects(runCodec("base-convert", "-", { fromBase: "10", toBase: "2" }), /Invalid number/);
  await assert.rejects(runCodec("base-convert", "1 2", { fromBase: "10", toBase: "2" }), /Invalid number/);
});

test("base-convert enforces supported source and target bases", async () => {
  await assert.rejects(runCodec("base-convert", "10", { fromBase: "1", toBase: "2" }), /fromBase must be 2–36/);
  await assert.rejects(runCodec("base-convert", "10", { fromBase: "10", toBase: "37" }), /toBase must be 2–36/);
});


test("Base64 decoding rejects malformed UTF-8 and non-canonical pad bits", async () => {
  await assert.rejects(runCodec("base64-decode", "/w=="), /valid UTF-8/);
  await assert.rejects(runCodec("base64-decode", "Zh=="), /non-canonical trailing bits/);
  await assert.rejects(runCodec("base64-decode", "TQ="), /padding/);
  assert.equal(await runCodec("base64-decode", "TQ"), "M");
  assert.equal(await runCodec("base64-decode", "SGVsbG8g8J+MjQ=="), "Hello 🌍");
});

test("URI-component decoding keeps plus literal and rejects invalid UTF-8", async () => {
  assert.equal(await runCodec("url-decode", "a+b%2Bc"), "a+b+c");
  await assert.rejects(runCodec("url-decode", "%E2%28%A1"), /Invalid URL encoding/);
  await assert.rejects(runCodec("url-decode", "bad%2"), /Invalid URL encoding/);
});

test("multi-hash reports SHA-384 alongside the SHA family with known digests", async () => {
  const out = await runCodec("multi-hash", "abc");
  assert.match(out, /SHA-384\tcb00753f45a35e8bb5a03d699ac65007272c32ab0eded1631a8b605a43ff5bed8086072ba1e7cc2358baeca134c825a7/);
  assert.match(out, /SHA-256\tba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad/);
});

test("hash compare normalizes case only for valid hexadecimal digest lengths", async () => {
  const digest = "900150983cd24fb0d6963f7d28e17f72";
  assert.equal(await runCodec("hash-compare", "", { a: digest.toUpperCase(), b: digest }), "match");
  assert.equal(await runCodec("hash-compare", "", { a: "AbCd", b: "abcd" }), "different");
  assert.equal(await runCodec("hash-compare", "", { a: "QWxwaGE=", b: "QWxwaGE=" }), "match");
  assert.equal(await runCodec("hash-compare", "", { a: "QWxwaGE=", b: "qWxwaGE=" }), "different");
});

test("HTML entity decoder handles quoted named entities without double decoding", async () => {
  assert.equal(await runCodec("html-decode", "&quot;quoted&apos; &amp;quot; &#x1F30D;"), '\"quoted\' &quot; 🌍');
});
