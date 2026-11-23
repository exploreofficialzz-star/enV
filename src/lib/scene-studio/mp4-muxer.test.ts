import test from "node:test";
import assert from "node:assert/strict";
import { Mp4Muxer } from "./mp4-muxer.ts";
import type { ChunkInfo } from "./mp4-muxer.ts";
import { decodeErrors, hasFfmpeg, makeAac, makeH264, probe } from "./test-media.ts";

const skip = !hasFfmpeg;
const frameUs = (fps: number) => 1_000_000 / fps;

function videoChunks(clip: ReturnType<typeof makeH264>): ChunkInfo[] {
  return clip.samples.map((s, i) => ({ data: s.data, isKey: s.isKey, timestampUs: Math.round(i * frameUs(clip.fps)), durationUs: Math.round(frameUs(clip.fps)) }));
}
function audioChunks(clip: ReturnType<typeof makeAac>): ChunkInfo[] {
  const dur = (1024 / clip.sampleRate) * 1_000_000;
  return clip.frames.map((data, i) => ({ data, isKey: true, timestampUs: Math.round(i * dur), durationUs: Math.round(dur) }));
}

for (const fastStart of [true, false]) {
  test(`video only (fastStart ${fastStart}): ffprobe sees every frame and ffmpeg decodes with no errors`, { skip }, () => {
    const clip = makeH264(2, 30, 320, 240);
    assert.equal(clip.samples.length, 60);
    const mux = new Mp4Muxer({ video: { codec: "avc", width: 320, height: 240, avcC: clip.avcC }, fastStart });
    for (const c of videoChunks(clip)) mux.addVideoChunk(c);
    const bytes = mux.finish();
    const info = probe(bytes);
    const v = info.streams.find((s) => s.codec_type === "video")!;
    assert.equal(v.codec_name, "h264");
    assert.equal(v.width, 320);
    assert.equal(v.height, 240);
    assert.equal(v.nb_frames, "60");
    assert.ok(Math.abs(Number(info.format.duration) - 2) < 1 / 30 + 1e-6, `duration ${info.format.duration}`);
    assert.equal(decodeErrors(bytes), "");
    // fastStart puts moov before mdat so playback can begin while downloading
    const text = Buffer.from(bytes).toString("latin1");
    assert.equal(text.indexOf("moov") < text.indexOf("mdat"), fastStart);
  });
}

test("video + AAC audio: both streams present, durations agree, decodes cleanly", { skip }, () => {
  const v = makeH264(2, 30, 320, 240);
  const a = makeAac(2, 44100, 2);
  const mux = new Mp4Muxer({
    video: { codec: "avc", width: 320, height: 240, avcC: v.avcC },
    audio: { codec: "aac", sampleRate: 44100, channels: 2, audioSpecificConfig: a.audioSpecificConfig },
  });
  for (const c of videoChunks(v)) mux.addVideoChunk(c);
  for (const c of audioChunks(a)) mux.addAudioChunk(c);
  const bytes = mux.finish();
  const info = probe(bytes);
  const video = info.streams.find((s) => s.codec_type === "video")!;
  const audio = info.streams.find((s) => s.codec_type === "audio")!;
  assert.equal(audio.codec_name, "aac");
  assert.equal(audio.sample_rate, "44100");
  assert.equal(audio.channels, 2);
  assert.ok(Math.abs(Number(video.duration) - Number(audio.duration)) < 0.1, `${video.duration} vs ${audio.duration}`);
  assert.equal(decodeErrors(bytes), "");
});

test("64-bit offsets (co64 + 64-bit mdat) are valid too", { skip }, () => {
  const clip = makeH264(1, 30, 320, 240);
  const mux = new Mp4Muxer({ video: { codec: "avc", width: 320, height: 240, avcC: clip.avcC }, wide: true });
  for (const c of videoChunks(clip)) mux.addVideoChunk(c);
  const bytes = mux.finish();
  assert.equal(probe(bytes).streams[0].nb_frames, "30");
  assert.equal(decodeErrors(bytes), "");
  assert.ok(Buffer.from(bytes).toString("latin1").includes("co64"));
});

test("output is deterministic: same input, identical bytes", { skip }, () => {
  const clip = makeH264(1, 30, 320, 240);
  const build = () => {
    const m = new Mp4Muxer({ video: { codec: "avc", width: 320, height: 240, avcC: clip.avcC } });
    for (const c of videoChunks(clip)) m.addVideoChunk(c);
    return m.finish();
  };
  assert.deepEqual(build(), build());
});

test("an avcC wrapped in its own box is accepted", { skip }, () => {
  const clip = makeH264(1, 30, 320, 240);
  const boxed = new Uint8Array(8 + clip.avcC.length);
  new DataView(boxed.buffer).setUint32(0, boxed.length);
  boxed.set(Uint8Array.from("avcC", (c) => c.charCodeAt(0)), 4);
  boxed.set(clip.avcC, 8);
  const m = new Mp4Muxer({ video: { codec: "avc", width: 320, height: 240, avcC: boxed } });
  for (const c of videoChunks(clip)) m.addVideoChunk(c);
  assert.equal(decodeErrors(m.finish()), "");
});

// ---- input validation: needs no ffmpeg ----
const avcC = Uint8Array.of(1, 66, 0, 30, 0xff, 0xe1, 0, 1, 0x67, 1, 0, 1, 0x68);
const sample = (isKey = true): Uint8Array => Uint8Array.of(0, 0, 0, 2, isKey ? 0x65 : 0x41, 0x00);
const mk = () => new Mp4Muxer({ video: { codec: "avc", width: 320, height: 240, avcC } });

test("plain-words errors for bad input", () => {
  assert.throws(() => new Mp4Muxer({ video: { codec: "avc", width: 0, height: 240, avcC } }), /not valid/);
  assert.throws(() => new Mp4Muxer({ video: { codec: "vp9" as "avc", width: 320, height: 240, avcC } }), /H\.264/);
  assert.throws(() => new Mp4Muxer({ video: { codec: "avc", width: 320, height: 240, avcC: Uint8Array.of(9, 9, 9) } }), /avcC/);
  assert.throws(() => new Mp4Muxer({ video: { codec: "avc", width: 320, height: 240, avcC }, audio: { codec: "aac", sampleRate: 100, channels: 2, audioSpecificConfig: Uint8Array.of(18, 16) } }), /sample rate/);
  const m = mk();
  assert.throws(() => m.addAudioChunk({ data: sample(), timestampUs: 0, durationUs: 1, isKey: true }), /without an audio track/);
  assert.throws(() => m.addVideoChunk({ data: sample(), timestampUs: 5, durationUs: 1, isKey: true }), /time 0/);
  assert.throws(() => m.addVideoChunk({ data: sample(false), timestampUs: 0, durationUs: 1, isKey: false }), /key frame/);
  assert.throws(() => m.addVideoChunk({ data: Uint8Array.of(0, 0, 0, 1, 0x65, 0x88, 0x84, 0x00), timestampUs: 0, durationUs: 1, isKey: true }), /AVCC/);
  m.addVideoChunk({ data: sample(), timestampUs: 0, durationUs: 33_333, isKey: true });
  assert.throws(() => m.addVideoChunk({ data: sample(false), timestampUs: 0, durationUs: 1, isKey: false }), /not later/);
  assert.throws(() => m.addVideoChunk({ data: new Uint8Array(0), timestampUs: 40_000, durationUs: 1, isKey: false }), /no data/);
  assert.throws(() => mk().finish(), /no video frames/);
  const done = mk();
  done.addVideoChunk({ data: sample(), timestampUs: 0, durationUs: 33_333, isKey: true });
  done.finish();
  assert.throws(() => done.finish(), /already finished/);
  assert.throws(() => done.addVideoChunk({ data: sample(false), timestampUs: 40_000, durationUs: 1, isKey: false }), /already finished/);
});
