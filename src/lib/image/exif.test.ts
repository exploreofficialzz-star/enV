import test from "node:test";
import assert from "node:assert/strict";
import { readMetadata, stripMetadataBytes, verifyCleaned, detectFormat } from "./exif.ts";
import { crc32 } from "./crc32.ts";
import { buildZip, safeZipName } from "./zip.ts";

// 16×16 images written by Pillow with camera EXIF (make/model/artist), Exif-IFD fields and a GPS position.
const b64 = (s: string) => new Uint8Array(Buffer.from(s, "base64"));
const FIXTURES = {
  jpeg: b64("/9j/4AAQSkZJRgABAQEBLAEsAAD/4QF6RXhpZgAATU0AKgAAAAgABwEPAAIAAAANAAAAYgEQAAIAAAAJAAAAcAESAAMAAAABAAYAAAExAAIAAAARAAAAegE7AAIAAAASAAAAjIdpAAQAAAABAAAAnoglAAQAAAABAAABDAAAAABBY21lIENhbWVyYXMAAE1vZGVsIFo5AABGaXJtd2FyZVRvb2wgMS4yAABKYW5lIFBob3RvZ3JhcGhlcgAABYKaAAUAAAABAAAA4IKdAAUAAAABAAAA6IgnAAMAAAABAZAAAJADAAIAAAAUAAAA8JIKAAUAAAABAAABBAAAAAAAAAABAAAA+gAAAA4AAAAFMjAyNjowODowMSAwOTozMDowMAAAAAAyAAAAAQAEAAEAAgAAAAJOAAAAAAIABQAAAAMAAAFCAAMAAgAAAAJXAAAAAAQABQAAAAMAAAFaAAAAAAAAACgAAAABAAAAGgAAAAEAAAAuAAAAAQAAAE8AAAABAAAAOgAAAAEAAAA4AAAAAf/bAEMAAwICAwICAwMDAwQDAwQFCAUFBAQFCgcHBggMCgwMCwoLCw0OEhANDhEOCwsQFhARExQVFRUMDxcYFhQYEhQVFP/bAEMBAwQEBQQFCQUFCRQNCw0UFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFP/AABEIABAAEAMBIgACEQEDEQH/xAAfAAABBQEBAQEBAQAAAAAAAAAAAQIDBAUGBwgJCgv/xAC1EAACAQMDAgQDBQUEBAAAAX0BAgMABBEFEiExQQYTUWEHInEUMoGRoQgjQrHBFVLR8CQzYnKCCQoWFxgZGiUmJygpKjQ1Njc4OTpDREVGR0hJSlNUVVZXWFlaY2RlZmdoaWpzdHV2d3h5eoOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4eLj5OXm5+jp6vHy8/T19vf4+fr/xAAfAQADAQEBAQEBAQEBAAAAAAAAAQIDBAUGBwgJCgv/xAC1EQACAQIEBAMEBwUEBAABAncAAQIDEQQFITEGEkFRB2FxEyIygQgUQpGhscEJIzNS8BVictEKFiQ04SXxFxgZGiYnKCkqNTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqCg4SFhoeIiYqSk5SVlpeYmZqio6Slpqeoqaqys7S1tre4ubrCw8TFxsfIycrS09TV1tfY2dri4+Tl5ufo6ery8/T19vf4+fr/2gAMAwEAAhEDEQA/AMuS0tfDdtaQ6NKl1PdxmdYU06Im4kjDTRI8IUFAQ1vgqxEiu7KyLhm39ev5fB/iZ5NMkk0641bU5VubXTbeSRrW4W4US7yUeVtoMm4Lv4kUKpEaxnI1LSr7V44oxYwanoTumkR3zSJ5PmrA4HYs8ai5kKeUVSN5G2RzsIY3pa/oEN5rfhey0XSr68tWu9TvxDeSS3DwzwiWN1MQjk3xM0iwhI8rJHGcYdvMOdSpRqwVRyulGTtNXXLo+aTTbbulZOPo7NJemsUsR7Gja3NzNxXvLSMpOXwq0oafb1UElKMZKR//2Q=="),
  png: b64("iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAIAAACQkWg2AAAACXBIWXMAABYlAAAWJQFJUiTwAAABcmVYSWZNTQAqAAAACAAHAQ8AAgAAAA0AAABiARAAAgAAAAkAAABwARIAAwAAAAEABgAAATEAAgAAABEAAAB6ATsAAgAAABIAAACMh2kABAAAAAEAAACeiCUABAAAAAEAAAEMAAAAAEFjbWUgQ2FtZXJhcwAATW9kZWwgWjkAAEZpcm13YXJlVG9vbCAxLjIAAEphbmUgUGhvdG9ncmFwaGVyAAAFgpoABQAAAAEAAADggp0ABQAAAAEAAADoiCcAAwAAAAEBkAAAkAMAAgAAABQAAADwkgoABQAAAAEAAAEEAAAAAAAAAAEAAAD6AAAADgAAAAUyMDI2OjA4OjAxIDA5OjMwOjAwAAAAADIAAAABAAQAAQACAAAAAk4AAAAAAgAFAAAAAwAAAUIAAwACAAAAAlcAAAAABAAFAAAAAwAAAVoAAAAAAAAAKAAAAAEAAAAaAAAAAQAAAC4AAAABAAAATwAAAAEAAAA6AAAAAQAAADgAAAABnpNGUwAAAxtJREFUeJwBEAPv/AEVPMx/3KLmEE2iO8hRMjmGs+m+AltHAlDrSSjicjyaEPSOHfhfiRjrFu93/sYTD60EwyiuTXbcuZTU6zmvwCI8nVWPSEH1p28CKS8WmQ652MPvXqO4q/delOHX/6mJ6U1rBLXOBPoWPucedSGYuf4tKNT3JOrslnD1MgcNsHG8g6t9ERf6xZ6dOtma4KEl0X6qywRgDKe63BTDmBzjvCSbeqLi6T5MtlkPPyHhSSxAlgc59xsQMCrA19R73OAi1M4FO0IE8nBmSPvHG66P8mqn3J0cibcT5xnwbCAN7o4IfkLlGwB0hyanbBHZBKaUKmdbM4XbAgSF3iYTIfgOkiyNKaiyyojVbvD9HUchFbYVjdQ3TVIkMXzNIcHwpQXPHymFPunS5QJ+T2oJVMM7000gDwoJ5cES04vdYhApEUPTdU27LHmG7RjzERGdqHq1AiwXHBXbGLoATUG6l+ayS1IfPZq6S1fM9BUSwX5socER9fRqd0WVNIjmgdIt4R82t00eFsoFDvHHBBHwIzHEqu6nZpAa3aWNA1cHMRTFaMa3SsQiQn7yLwYKwxXaolyFP9NqD7cReKvWRALQqXmjmTYuaPxPfwDZRTXCAscAidlr4Rg39tAm+KKOjycf6joJEEoh8iUmrhB1fjwCd0Qp2JwfD/5KlczuljbFAjkSS/RC002XF3tVSd9ysM16XNDVOqVvqyVBOCH6WRsWAC6gQhD+LiF6AckTCvaD7OS7B6QQAtdOvofHo/h52dGVgW2kMW+lTjcbzd/UtJoO4AJKD9yuJ8aUDaVxbAtRxT6GVf+w7LeW5GDj3y99YPUHv/a78dkIhCv35Z6OtWvlPjQC8Psv96QPgcHxQhH9AuGURD3ZzgimPb9juPIyW3lLTn9wB2nR3OStQTTD2FbqbCaoBBpH4YyQfh4FfwRDyyBpGaMk382hloqUHTxmFlNwZHY1+RTPvtQG8iMCQza5EFmx7AI1MBfkG8qJ9o4iHduEmwoCn4K4eK/pbAD92EpSTZq4WOOhCDFK+xFPEV37RtWqvJRTd3GrjX7GQwAAAABJRU5ErkJggg=="),
  webp: b64("UklGRqgCAABXRUJQVlA4WAoAAAAIAAAADwAADwAAVlA4IBABAAAQBgCdASoQABAAAUAmJbACdH8EwAbwR+1XpTFir8jv4r8wXyP7AH8d/mn+46wH6zewB+ug6qeyE6AA/sJR2492VbBYlBCrqNAx/W2b71Ii/i/wT8VW7u2j//xuIW8UXTnI/3H/CMLIplqdf4oR3DJvd1/TtjqecZHDO9S0EL12m4XCWBH5MI1N7PIA04sv8lRcRS/W8fCOtYOYtPOOrn2rNP5v3eykL/marQ5H0QqB9sFEn8FxtWee35jbZ/T7tF+J2RBtMPt5lU8t6lqKaddvzLsHSryGb4hyqbe2oSkM9ec7nqnr7Gv3m8fkaZi+NhP2enOzWl73/01ufu6IeKVlMocB2BnW6unBiK/ze4wAAEVYSUZyAQAATU0AKgAAAAgABwEPAAIAAAANAAAAYgEQAAIAAAAJAAAAcAESAAMAAAABAAYAAAExAAIAAAARAAAAegE7AAIAAAASAAAAjIdpAAQAAAABAAAAnoglAAQAAAABAAABDAAAAABBY21lIENhbWVyYXMAAE1vZGVsIFo5AABGaXJtd2FyZVRvb2wgMS4yAABKYW5lIFBob3RvZ3JhcGhlcgAABYKaAAUAAAABAAAA4IKdAAUAAAABAAAA6IgnAAMAAAABAZAAAJADAAIAAAAUAAAA8JIKAAUAAAABAAABBAAAAAAAAAABAAAA+gAAAA4AAAAFMjAyNjowODowMSAwOTozMDowMAAAAAAyAAAAAQAEAAEAAgAAAAJOAAAAAAIABQAAAAMAAAFCAAMAAgAAAAJXAAAAAAQABQAAAAMAAAFaAAAAAAAAACgAAAABAAAAGgAAAAEAAAAuAAAAAQAAAE8AAAABAAAAOgAAAAEAAAA4AAAAAQ=="),
};
const ascii = (b: Uint8Array, at: number, n: number) => String.fromCharCode(...b.subarray(at, at + n));
const find = (b: Uint8Array, needle: number[], from = 0) => { outer: for (let i = from; i <= b.length - needle.length; i++) { for (let k = 0; k < needle.length; k++) if (b[i + k] !== needle[k]) continue outer; return i; } return -1; };
const label = (r: ReturnType<typeof readMetadata>, name: string) => r.entries.find((e) => e.label === name)?.value;

for (const format of ["jpeg", "png", "webp"] as const) {
  test(`${format}: reads camera, capture and GPS fields with the right sensitivity`, () => {
    const r = readMetadata(FIXTURES[format]);
    assert.equal(r.format, format); assert.deepEqual(r.dimensions, { width: 16, height: 16 });
    assert.equal(label(r, "Camera make"), "Acme Cameras"); assert.equal(label(r, "Camera model"), "Model Z9"); assert.equal(label(r, "Artist"), "Jane Photographer");
    assert.equal(label(r, "Exposure time"), "1/250 s"); assert.equal(label(r, "Aperture"), "f/2.8"); assert.equal(label(r, "Focal length"), "50 mm"); assert.equal(label(r, "ISO"), "ISO 400"); assert.equal(r.orientation, 6);
    assert.ok(r.gps && Math.abs(r.gps.lat - 40.446111) < 1e-4 && Math.abs(r.gps.lon + 79.982222) < 1e-4);
    assert.equal(r.entries.find((e) => e.label === "GPS position")?.sensitivity, "location");
    assert.equal(r.entries.find((e) => e.label === "Artist")?.sensitivity, "identity");
    assert.equal(r.entries.find((e) => e.label === "ISO")?.sensitivity, "technical");
  });

  test(`${format}: "remove all" leaves nothing sensitive, keeps orientation, never touches pixel data`, () => {
    const src = FIXTURES[format], out = stripMetadataBytes(src);
    assert.equal(out.supported, true); assert.ok(out.bytes.length < src.length);
    const v = verifyCleaned(out.bytes); assert.equal(v.clean, true, `remaining: ${v.remaining}`);
    assert.equal(v.report.orientation, 6); assert.equal(v.report.gps, null); assert.equal(label(v.report, "Camera make"), undefined);
    assert.equal(detectFormat(out.bytes), format);
    // the compressed pixel stream must be byte-identical
    if (format === "jpeg") { const a = find(src, [0xff, 0xda]), b = find(out.bytes, [0xff, 0xda]); assert.deepEqual(src.subarray(a), out.bytes.subarray(b)); }
    if (format === "png") { const a = find(src, [0x49, 0x44, 0x41, 0x54]) - 4, b = find(out.bytes, [0x49, 0x44, 0x41, 0x54]) - 4; assert.deepEqual(src.subarray(a), out.bytes.subarray(b)); }
    if (format === "webp") { const a = find(src, [0x56, 0x50, 0x38]), b = find(out.bytes, [0x56, 0x50, 0x38]); assert.deepEqual(src.subarray(a, a + 32), out.bytes.subarray(b, b + 32)); }
  });

  test(`${format}: "location only" removes GPS but keeps the rest`, () => {
    const src = FIXTURES[format], out = stripMetadataBytes(src, { scope: "location" });
    const v = verifyCleaned(out.bytes, "location"); assert.equal(v.clean, true);
    assert.equal(v.report.gps, null); assert.equal(label(v.report, "Camera make"), "Acme Cameras"); assert.equal(v.report.orientation, 6);
    assert.equal(out.bytes.length, src.length);
    if (format === "png") { // every chunk CRC must still be valid after editing eXIf in place
      let i = 8; while (i + 12 <= out.bytes.length) { const len = new DataView(out.bytes.buffer, out.bytes.byteOffset + i).getUint32(0); const crc = new DataView(out.bytes.buffer, out.bytes.byteOffset + i + 8 + len).getUint32(0); assert.equal(crc32(out.bytes.subarray(i + 4, i + 8 + len)), crc, `bad CRC in ${ascii(out.bytes, i + 4, 4)}`); i += 12 + len; }
    }
  });
}

test("unsupported and corrupt input never claims success", () => {
  const gif = new Uint8Array([0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 1, 0, 1, 0, 0, 0, 0]);
  const out = stripMetadataBytes(gif); assert.equal(out.supported, false); assert.ok(out.reason);
  assert.equal(readMetadata(new Uint8Array([1, 2, 3])).format, "unknown");
  const truncated = FIXTURES.jpeg.slice(0, 60); assert.doesNotThrow(() => readMetadata(truncated)); assert.doesNotThrow(() => stripMetadataBytes(truncated));
});

test("ZIP writer produces a readable archive with unique safe names", () => {
  const used = new Set<string>();
  assert.equal(safeZipName("../../etc/passwd", used), "passwd"); assert.equal(safeZipName("a/b/passwd", used), "passwd-2"); assert.equal(safeZipName("bad:name?.png", used), "bad_name_.png");
  const files = [{ name: "a.txt", data: new TextEncoder().encode("hello") }, { name: "ü.bin", data: new Uint8Array([0, 1, 2, 255]) }];
  return buildZip(files).arrayBuffer().then((buf) => {
    const b = new Uint8Array(buf), dv = new DataView(buf);
    assert.equal(dv.getUint32(b.length - 22, true), 0x06054b50); assert.equal(dv.getUint16(b.length - 12, true), 2);
    let at = dv.getUint32(b.length - 6, true);
    for (const f of files) {
      assert.equal(dv.getUint32(at, true), 0x02014b50);
      assert.equal(dv.getUint32(at + 16, true), crc32(f.data)); assert.equal(dv.getUint32(at + 24, true), f.data.length);
      const nameLen = dv.getUint16(at + 28, true), local = dv.getUint32(at + 42, true);
      assert.equal(new TextDecoder().decode(b.subarray(at + 46, at + 46 + nameLen)), f.name);
      assert.deepEqual(b.subarray(local + 30 + nameLen, local + 30 + nameLen + f.data.length), f.data);
      at += 46 + nameLen;
    }
  });
});
