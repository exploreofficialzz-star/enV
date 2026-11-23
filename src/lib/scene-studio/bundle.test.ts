import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { deflateRawSync, inflateRawSync } from "node:zlib";
import { ALLOWED_EXTENSIONS, BUNDLE_LIMITS, checkLooseFile, cleanEntryName, crc32, readBundle, writeZip } from "./bundle.ts";
import type { BundleLimits, Inflate } from "./bundle.ts";
import { deflateRaw, inflateRaw } from "./bundle-streams.ts";
import { seededRandom } from "./animation.ts";

const enc = new TextEncoder();
const dec = new TextDecoder();
const hasPython = spawnSync("python3", ["--version"]).status === 0;

const SCENE = JSON.stringify({ version: "1.0", settings: { duration: 3 } });
const png = (extra = 40) => Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, ...Array.from({ length: extra }, (_, i) => i & 255)]);
function glb(extra = 20): Uint8Array {
  const b = new Uint8Array(20 + extra);
  b.set(enc.encode("glTF"));
  const v = new DataView(b.buffer);
  v.setUint32(4, 2, true);
  v.setUint32(8, b.length, true);
  return b;
}
const wav = () => Uint8Array.from([...enc.encode("RIFF"), 0, 0, 0, 0, ...enc.encode("WAVE"), ...new Array(30).fill(7)]);

/** inflate backed by node:zlib, with the same "stop at the promised size" rule */
const nodeInflate: Inflate = async (data, expected) => {
  const out = inflateRawSync(data, { maxOutputLength: Math.max(1, expected + 1) });
  if (out.length > expected) throw new Error("larger than promised");
  return new Uint8Array(out);
};
const nodeDeflate = async (d: Uint8Array) => new Uint8Array(deflateRawSync(d));

async function make(files: Record<string, Uint8Array | string>, deflate = false): Promise<Uint8Array> {
  return writeZip(
    Object.entries(files).map(([name, data]) => ({ name, data: typeof data === "string" ? enc.encode(data) : data })),
    deflate ? nodeDeflate : undefined,
  );
}

/** Replace `from` with `to` (same length) everywhere: renames an entry in both its local and central headers. */
function renameInZip(zip: Uint8Array, from: string, to: string): Uint8Array {
  assert.equal(from.length, to.length);
  const out = Uint8Array.from(zip);
  const a = enc.encode(from);
  const b = enc.encode(to);
  let hits = 0;
  for (let i = 0; i + a.length <= out.length; i++) {
    if (a.every((x, k) => out[i + k] === x)) {
      out.set(b, i);
      hits++;
    }
  }
  assert.ok(hits >= 2, `expected the name "${from}" in two headers, found ${hits}`);
  return out;
}

function centralOffset(zip: Uint8Array, name: string): number {
  const v = new DataView(zip.buffer, zip.byteOffset, zip.byteLength);
  for (let i = 0; i + 46 < zip.length; i++) {
    if (v.getUint32(i, true) === 0x02014b50) {
      const n = v.getUint16(i + 28, true);
      if (dec.decode(zip.subarray(i + 46, i + 46 + n)) === name) return i;
    }
  }
  throw new Error(`no central entry ${name}`);
}
function patch(zip: Uint8Array, name: string, field: "flags" | "method" | "compressed" | "size" | "offset", value: number): Uint8Array {
  const out = Uint8Array.from(zip);
  const at = centralOffset(out, name);
  const v = new DataView(out.buffer);
  if (field === "flags") v.setUint16(at + 8, value, true);
  if (field === "method") v.setUint16(at + 10, value, true);
  if (field === "compressed") v.setUint32(at + 20, value, true);
  if (field === "size") v.setUint32(at + 24, value, true);
  if (field === "offset") v.setUint32(at + 42, value, true);
  return out;
}
function localDataOffset(zip: Uint8Array, name: string): number {
  const v = new DataView(zip.buffer, zip.byteOffset, zip.byteLength);
  const off = v.getUint32(centralOffset(zip, name) + 42, true);
  return off + 30 + v.getUint16(off + 26, true) + v.getUint16(off + 28, true);
}

const codes = (r: { issues: { code: string }[] }) => r.issues.map((i) => i.code);

test("crc32 matches the standard check value", () => {
  assert.equal(crc32(enc.encode("123456789")), 0xcbf43926);
  assert.equal(crc32(new Uint8Array(0)), 0);
});

test("cleanEntryName allows plain names and refuses path tricks", () => {
  assert.deepEqual(cleanEntryName("models/tree.glb"), { name: "models/tree.glb" });
  assert.deepEqual(cleanEntryName("./scene.json"), { name: "scene.json" });
  assert.deepEqual(cleanEntryName("folder/"), { name: "folder/" });
  for (const bad of ["../evil.json", "a/../../b", "/etc/passwd", "a\\b.png", "C:/x.png", "c:x.png", "a//b.png", "a/./b.png", "", "bad\u0000.png", "tab\t.png", "a/.."]) {
    assert.ok("unsafe" in cleanEntryName(bad), `"${JSON.stringify(bad)}" should be refused`);
  }
});

test("a zip written here reads back exactly, in any entry order, and is byte-for-byte repeatable", async () => {
  const files = { "scene.json": SCENE, "models/hero.glb": glb(), "pics/logo.png": png(), "sound/boom.wav": wav(), "credits.txt": "Models by Quaternius (CC0)" };
  const a = await make(files);
  const b = await make(Object.fromEntries(Object.entries(files).reverse()));
  assert.deepEqual(a, b);
  const r = await readBundle(a, nodeInflate);
  assert.equal(r.ok, true, JSON.stringify(r.issues));
  assert.equal(r.sceneText, SCENE);
  assert.equal(r.scenePath, "scene.json");
  assert.deepEqual([...r.assets.keys()].sort(), ["credits.txt", "models/hero.glb", "pics/logo.png", "sound/boom.wav"]);
  assert.deepEqual(r.assets.get("models/hero.glb"), glb());
  assert.deepEqual(r.issues, []);
});

test("compressed zips read back, are smaller, and are valid for other zip tools", async () => {
  const big = enc.encode(JSON.stringify({ a: "x".repeat(5000) })).slice(0, 4000);
  const files = { "scene.json": SCENE, "textures/big.png": Uint8Array.from([...png(), ...big, ...big]) };
  const stored = await make(files);
  const packed = await make(files, true);
  assert.ok(packed.length < stored.length);
  const r = await readBundle(packed, nodeInflate);
  assert.equal(r.ok, true, JSON.stringify(r.issues));
  assert.deepEqual(r.assets.get("textures/big.png"), files["textures/big.png"]);
  if (hasPython) {
    const check = spawnSync("python3", ["-c", "import sys,zipfile,io,json; z=zipfile.ZipFile(io.BytesIO(sys.stdin.buffer.read())); assert z.testzip() is None; print(json.dumps(sorted(z.namelist())))"], { input: packed });
    assert.equal(check.status, 0, check.stderr.toString());
    assert.deepEqual(JSON.parse(check.stdout.toString()), ["scene.json", "textures/big.png"]);
  }
});

test("the real browser-style streams (DecompressionStream) work as the inflate and deflate", async () => {
  const data = enc.encode("hello hello hello hello ".repeat(500));
  const packed = await deflateRaw(data);
  assert.ok(packed.length < data.length / 5);
  assert.deepEqual(await inflateRaw(packed, data.length), data);
  assert.deepEqual(new Uint8Array(inflateRawSync(packed)), data); // standard deflate, readable by anyone
  await assert.rejects(inflateRaw(packed, 100), /larger than/); // stops early at the promised size
  await assert.rejects(inflateRaw(Uint8Array.from([1, 2, 3, 4, 5]), 100));
  const r = await readBundle(await make({ "scene.json": SCENE, "pics/a.png": Uint8Array.from([...png(), ...data]) }, true), inflateRaw);
  assert.equal(r.ok, true, JSON.stringify(r.issues));
});

test("zips made by other tools: wrapper folder removed, junk ignored, folders skipped", { skip: !hasPython }, async () => {
  const script = `
import sys, zipfile, io
z = zipfile.ZipFile(sys.stdout.buffer, "w", zipfile.ZIP_DEFLATED)
z.writestr("my-scene/", b"")
z.writestr("my-scene/scene.json", ${JSON.stringify(SCENE)})
z.writestr("my-scene/models/", b"")
z.writestr("my-scene/models/hero.glb", bytes(sys.argv[1], "latin1") if False else open(sys.argv[1], "rb").read())
z.writestr("__MACOSX/my-scene/._scene.json", b"junk")
z.writestr("my-scene/.DS_Store", b"junk")
z.close()
`;
  const { writeFileSync, mkdtempSync, rmSync } = await import("node:fs");
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");
  const dir = mkdtempSync(join(tmpdir(), "bundle-"));
  try {
    writeFileSync(join(dir, "hero.glb"), glb());
    const made = spawnSync("python3", ["-c", script, join(dir, "hero.glb")]);
    assert.equal(made.status, 0, made.stderr.toString());
    const r = await readBundle(new Uint8Array(made.stdout), nodeInflate);
    assert.equal(r.ok, true, JSON.stringify(r.issues));
    assert.equal(r.scenePath, "scene.json");
    assert.deepEqual([...r.assets.keys()], ["models/hero.glb"]);
    assert.deepEqual(r.assets.get("models/hero.glb"), glb());
    assert.deepEqual(r.ignored.sort(), ["__MACOSX/my-scene/._scene.json", "my-scene/.DS_Store"]);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("finding the scene: one other .json is the scene; none or several is explained", async () => {
  const one = await readBundle(await make({ "my-story.json": SCENE, "a.png": png() }), nodeInflate);
  assert.equal(one.ok, true);
  assert.equal(one.scenePath, "my-story.json");

  const none = await readBundle(await make({ "a.png": png() }), nodeInflate);
  assert.equal(none.ok, false);
  assert.deepEqual(codes(none), ["no-scene"]);
  assert.match(none.issues[0].message, /scene\.json/);

  const several = await readBundle(await make({ "one.json": SCENE, "two.json": SCENE }), nodeInflate);
  assert.deepEqual(codes(several), ["several-scenes"]);

  const preferred = await readBundle(await make({ "scene.json": SCENE, "other.json": "{}" }), nodeInflate);
  assert.equal(preferred.ok, true);
  assert.equal(preferred.scenePath, "scene.json");
  assert.deepEqual(codes(preferred), ["unsupported-file"]); // the other .json is left out, with a warning

  const empty = await readBundle(await make({}), nodeInflate);
  assert.deepEqual(codes(empty), ["no-scene"]);
});

test("path tricks reject the whole zip before anything is read", async () => {
  for (const [safe, evil] of [
    ["xx/evil.json", "../evil.json"],
    ["xxx/evil.png", "/xx/evil.png"],
    ["abc.png", "a\\c.png"],
    ["xx/y.png", "C:/y.png"],
    ["xxxx/a.png", "a/../a.png"],
  ]) {
    const zip = renameInZip(await make({ "scene.json": SCENE, [safe]: png() }), safe, evil);
    let called = 0;
    const r = await readBundle(zip, async (d, n) => {
      called++;
      return nodeInflate(d, n);
    });
    assert.equal(r.ok, false, evil);
    assert.deepEqual(codes(r), ["unsafe-path"], evil);
    assert.equal(r.sceneText, undefined);
    assert.equal(called, 0);
    assert.match(r.issues[0].message, /not allowed/);
  }
});

test("duplicate names, even differing only by capitals, are refused", async () => {
  const dup = renameInZip(await make({ "scene.json": SCENE, "a.png": png(), "b.png": png(4) }), "b.png", "a.png");
  assert.deepEqual(codes(await readBundle(dup, nodeInflate)), ["duplicate-name"]);
  const cased = renameInZip(await make({ "scene.json": SCENE, "a.png": png(), "B.png": png(4) }), "B.png", "A.png");
  const r = await readBundle(cased, nodeInflate);
  assert.deepEqual(codes(r), ["duplicate-name"]);
  assert.match(r.issues[0].message, /capital letters/);
});

test("password-protected and unusual compression are refused with plain words", async () => {
  const zip = await make({ "scene.json": SCENE, "a.png": png() });
  const enc1 = await readBundle(patch(zip, "a.png", "flags", 0x0801), nodeInflate);
  assert.deepEqual(codes(enc1), ["zip-encrypted"]);
  assert.match(enc1.issues[0].message, /password/);
  const bz = await readBundle(patch(zip, "a.png", "method", 12), nodeInflate);
  assert.deepEqual(codes(bz), ["zip-unsupported"]);
});

test("zip bombs are stopped from the sizes alone, without decompressing", async () => {
  const zeros = new Uint8Array(8 * 1024 * 1024);
  const zip = await make({ "scene.json": SCENE, "bomb.wav": Uint8Array.from([...wav(), ...zeros]) }, true);
  assert.ok(zip.length < 100_000, `bomb is ${zip.length} bytes`);
  let called = 0;
  const r = await readBundle(zip, async (d, n) => {
    called++;
    return nodeInflate(d, n);
  });
  assert.deepEqual(codes(r), ["zip-bomb"]);
  assert.equal(called, 0);
});

test("sizes that lie are caught whichever way they lie", async () => {
  const text = enc.encode("some plain notes that compress well ".repeat(50));
  const zip = await make({ "scene.json": SCENE, "notes.txt": text }, true);
  const bigger = await readBundle(patch(zip, "notes.txt", "size", text.length + 10), nodeInflate);
  assert.equal(bigger.ok, false);
  assert.ok(codes(bigger).includes("size-mismatch"), codes(bigger).join());
  const smaller = await readBundle(patch(zip, "notes.txt", "size", text.length - 10), nodeInflate);
  assert.equal(smaller.ok, false);
  assert.ok(codes(smaller).includes("file-damaged"), codes(smaller).join());

  const stored = await make({ "scene.json": SCENE, "a.png": png() });
  assert.deepEqual(codes(await readBundle(patch(stored, "a.png", "size", 7), nodeInflate)), ["zip-damaged"]);
  assert.deepEqual(codes(await readBundle(patch(stored, "a.png", "compressed", 9999999), nodeInflate)), ["zip-damaged"]);
});

test("limits: archive size, number of files, file size and total size", async () => {
  const zip = await make({ "scene.json": SCENE, "a.png": png(500), "b.png": png(500) });
  const tweak = (over: Partial<BundleLimits>): BundleLimits => ({ ...BUNDLE_LIMITS, ...over });
  assert.deepEqual(codes(await readBundle(zip, nodeInflate, tweak({ maxArchiveBytes: 100 }))), ["zip-too-big"]);
  assert.deepEqual(codes(await readBundle(zip, nodeInflate, tweak({ maxEntries: 2 }))), ["too-many-files"]);
  const one = await readBundle(zip, nodeInflate, tweak({ maxFileBytes: 100 }));
  assert.deepEqual(codes(one), ["file-too-big"]);
  assert.match(one.issues[0].message, /bytes/);
  assert.deepEqual(codes(await readBundle(zip, nodeInflate, tweak({ maxTotalBytes: 600 }))), ["zip-too-big"]);
  const scene = await readBundle(await make({ "scene.json": "x".repeat(2000) }), nodeInflate, tweak({ maxSceneBytes: 1000 }));
  assert.deepEqual(codes(scene), ["file-too-big"]);
});

test("damaged contents are noticed (checksum) and entries that point at each other are refused", async () => {
  const zip = await make({ "scene.json": SCENE, "a.png": png(60), "b.png": png(30) });
  const flipped = Uint8Array.from(zip);
  flipped[localDataOffset(zip, "a.png") + 40] ^= 0xff;
  const r = await readBundle(flipped, nodeInflate);
  assert.equal(r.ok, false);
  assert.deepEqual(codes(r), ["file-damaged"]);
  assert.equal(r.issues[0].path, "a.png");

  const crossed = patch(zip, "b.png", "offset", new DataView(zip.buffer).getUint32(centralOffset(zip, "a.png") + 42, true));
  assert.deepEqual(codes(await readBundle(crossed, nodeInflate)), ["zip-damaged"]);
});

test("files must really be what their extension says", async () => {
  const lies = await readBundle(await make({ "scene.json": SCENE, "model.glb": "this is not a model at all, just text", "pic.png": enc.encode("<html>nope</html>"), "boom.wav": glb(), "ok.png": png() }), nodeInflate);
  assert.equal(lies.ok, false);
  assert.deepEqual(
    lies.issues.map((i) => [i.code, i.path]),
    [
      ["wrong-file-type", "boom.wav"],
      ["wrong-file-type", "model.glb"],
      ["wrong-file-type", "pic.png"],
    ],
  );
  assert.match(lies.issues[1].message, /binary glTF model/);
  // a .glb whose own length field is wrong is not accepted either
  const badLength = glb();
  new DataView(badLength.buffer).setUint32(8, 12345, true);
  assert.deepEqual(codes(await readBundle(await make({ "scene.json": SCENE, "m.glb": badLength }), nodeInflate)), ["wrong-file-type"]);
  // other real formats pass
  const formats: Record<string, Uint8Array> = {
    "a.jpg": Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]),
    "a.jpeg": Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]),
    "a.webp": Uint8Array.from([...enc.encode("RIFF"), 1, 0, 0, 0, ...enc.encode("WEBP"), 1, 2]),
    "a.mp3": enc.encode("ID3\u0004\u0000more"),
    "b.mp3": Uint8Array.from([0xff, 0xfb, 0x90, 0x00, 1]),
    "a.ogg": enc.encode("OggS\u0000\u0002xxxx"),
    "a.m4a": Uint8Array.from([0, 0, 0, 0x20, ...enc.encode("ftypM4A "), 0, 0]),
    "sky.hdr": enc.encode("#?RADIANCE\nFORMAT=32-bit_rle_rgbe\n"),
    "NOTES.MD": enc.encode("# notes"),
  };
  const good = await readBundle(await make({ "scene.json": SCENE, ...formats }), nodeInflate);
  assert.equal(good.ok, true, JSON.stringify(good.issues));
  assert.equal(good.assets.size, Object.keys(formats).length);
  assert.ok(ALLOWED_EXTENSIONS.includes("glb") && !ALLOWED_EXTENSIONS.includes("svg") && !ALLOWED_EXTENSIONS.includes("html"));
});

test("unsupported files are left out with a warning, and the scene still opens", async () => {
  const r = await readBundle(await make({ "scene.json": SCENE, "run.exe": "MZ", "page.html": "<script>alert(1)</script>", "pic.svg": "<svg onload='x'/>", "model.gltf": "{}", "noext": "x", "ok.png": png() }), nodeInflate);
  assert.equal(r.ok, true);
  assert.deepEqual([...r.assets.keys()], ["ok.png"]);
  assert.deepEqual(r.ignored.sort(), ["model.gltf", "noext", "page.html", "pic.svg", "run.exe"]);
  assert.ok(r.issues.every((i) => i.severity === "warning"));
  assert.equal(r.issues.find((i) => i.path === "model.gltf")!.code, "gltf-not-supported");
  assert.match(r.issues.find((i) => i.path === "model.gltf")!.fix, /\.glb/);
});

test("not a zip, too short, or cut off: plain explanations and no crash", async () => {
  assert.deepEqual(codes(await readBundle(enc.encode("hello, this is just text and definitely not a zip file"), nodeInflate)), ["not-a-zip"]);
  assert.deepEqual(codes(await readBundle(new Uint8Array(5), nodeInflate)), ["zip-damaged"]);
  const zip = await make({ "scene.json": SCENE, "a.png": png() });
  assert.deepEqual(codes(await readBundle(zip.subarray(0, zip.length - 10), nodeInflate)), ["not-a-zip"]);
  const r = await readBundle(enc.encode("hello, this is just text and definitely not a zip file"), nodeInflate);
  assert.ok(r.issues.every((i) => i.message.length > 10 && i.fix.length > 5 && !/undefined|Error:/.test(i.message)));
});

test("the scene file must be readable text; a leading byte-order mark is dropped", async () => {
  const badText = await readBundle(await make({ "scene.json": Uint8Array.from([0x7b, 0xff, 0xfe, 0x7d]) }), nodeInflate);
  assert.deepEqual(codes(badText), ["scene-not-text"]);
  const bom = await readBundle(await make({ "scene.json": Uint8Array.from([0xef, 0xbb, 0xbf, ...enc.encode(SCENE)]) }), nodeInflate);
  assert.equal(bom.ok, true);
  assert.equal(bom.sceneText, SCENE);
});

test("fuzz: damaged zips never throw and never return a half-read scene as OK with errors", async () => {
  const base = await make({ "scene.json": SCENE, "models/a.glb": glb(), "p.png": png(80), "notes.txt": "hello ".repeat(40) }, true);
  const rnd = seededRandom(20260521);
  for (let round = 0; round < 400; round++) {
    const bytes = Uint8Array.from(base);
    const flips = 1 + Math.floor(rnd() * 6);
    for (let k = 0; k < flips; k++) bytes[Math.floor(rnd() * bytes.length)] = Math.floor(rnd() * 256);
    const cut = rnd() < 0.2 ? bytes.subarray(0, Math.floor(rnd() * bytes.length)) : bytes;
    const r = await readBundle(cut, nodeInflate);
    assert.equal(typeof r.ok, "boolean");
    if (r.ok) assert.ok(r.sceneText !== undefined && !r.issues.some((i) => i.severity === "error"));
    for (const [name] of r.assets) assert.ok(!("unsafe" in cleanEntryName(name)), name);
  }
});

test("writeZip refuses names it could not read back", async () => {
  await assert.rejects(writeZip([{ name: "../x.png", data: png() }]), /cannot go in a zip/);
  await assert.rejects(writeZip([{ name: "folder/", data: new Uint8Array(0) }]), /folder/);
  await assert.rejects(writeZip([{ name: "a.png", data: png() }, { name: "A.PNG", data: png() }]), /twice/);
  const empty = await writeZip([]);
  assert.equal(empty.length, 22);
});

test("non-ASCII names survive a round trip", async () => {
  const r = await readBundle(await make({ "scene.json": SCENE, "ñandú/été.png": png() }), nodeInflate);
  assert.equal(r.ok, true, JSON.stringify(r.issues));
  assert.deepEqual([...r.assets.keys()], ["ñandú/été.png"]);
});

test("checkLooseFile accepts a real picture and a real model and says what kind they are", () => {
  assert.deepEqual(checkLooseFile("logo.png", png()), { ok: true, name: "logo.png", kind: "image" });
  assert.deepEqual(checkLooseFile("hero.glb", glb()), { ok: true, name: "hero.glb", kind: "model" });
  assert.deepEqual(checkLooseFile("Photo.JPG", Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 1, 2])), { ok: true, name: "Photo.JPG", kind: "image" });
});

test("checkLooseFile refuses files that are not what their name says, unknown types, unsafe names and big files", () => {
  const issueOf = (r: ReturnType<typeof checkLooseFile>) => (r.ok ? "ok" : r.issue.code);
  assert.equal(issueOf(checkLooseFile("fake.png", enc.encode("not a picture at all"))), "wrong-file-type");
  assert.equal(issueOf(checkLooseFile("script.exe", Uint8Array.of(1, 2, 3))), "unsupported-file");
  assert.equal(issueOf(checkLooseFile("noextension", Uint8Array.of(1, 2, 3))), "unsupported-file");
  assert.equal(issueOf(checkLooseFile("model.gltf", enc.encode("{}"))), "gltf-not-supported");
  assert.equal(issueOf(checkLooseFile("../secret.png", png())), "unsafe-name");
  assert.equal(issueOf(checkLooseFile("folder/logo.png", png())), "unsafe-name");
  assert.equal(issueOf(checkLooseFile("C:\\logo.png", png())), "unsafe-name");
  const small: BundleLimits = { ...BUNDLE_LIMITS, maxFileBytes: 30 };
  assert.equal(issueOf(checkLooseFile("big.png", png(100), small)), "file-too-big");
  const bad = checkLooseFile("fake.png", enc.encode("not a picture at all"));
  assert.ok(!bad.ok && /not really a PNG picture/.test(bad.issue.message) && bad.issue.path === "fake.png");
});
