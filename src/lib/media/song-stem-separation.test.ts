import assert from "node:assert/strict";
import { test } from "node:test";
import { separateSongChunks } from "./song-stem-separation.ts";

class FakeAudioBuffer {
  readonly channels: Float32Array[];
  numberOfChannels: number;
  length: number;
  sampleRate: number;
  constructor(numberOfChannels: number, length: number, sampleRate: number) { this.numberOfChannels = numberOfChannels; this.length = length; this.sampleRate = sampleRate; this.channels = Array.from({ length: numberOfChannels }, () => new Float32Array(length)); }
  get duration() { return this.length / this.sampleRate; }
  getChannelData(index: number) { return this.channels[index]; }
  copyToChannel(data: Float32Array, index: number) { this.channels[index].set(data); }
}
const asAudio = (buffer: FakeAudioBuffer) => buffer as unknown as AudioBuffer;

test("chunked separation joins every sample and preserves stereo and the final tail", async () => {
  const rate = 44_100, frames = rate * 3 + 123;
  const source = new FakeAudioBuffer(2, frames, rate);
  for (let i = 0; i < frames; i++) { source.channels[0][i] = 0.3 * i / frames; source.channels[1][i] = -0.3 * i / frames; }
  let calls = 0;
  const separator = async (audio: AudioBuffer) => { calls++; return Array.from({ length: 4 }, () => audio); };
  const progress: number[] = [];
  const results = await separateSongChunks(asAudio(source), ["Vocals"], new AbortController().signal, separator, (channels, length, sampleRate) => asAudio(new FakeAudioBuffer(channels, length, sampleRate)), 1, (fraction) => progress.push(fraction));
  assert.equal(calls, 4);
  assert.equal(results[0].duration_seconds, frames / rate);
  const bytes = await results[0].blob.arrayBuffer();
  const view = new DataView(bytes);
  assert.equal(view.getUint16(22, true), 2);
  assert.equal(view.getUint32(24, true), rate);
  assert.equal(view.getUint32(40, true), frames * 4);
  for (const frame of [0, rate - 1, rate, 2 * rate, frames - 1]) {
    const left = view.getInt16(44 + frame * 4, true) / 32767;
    const right = view.getInt16(46 + frame * 4, true) / 32768;
    assert.ok(Math.abs(left - source.channels[0][frame]) < 0.0001);
    assert.ok(Math.abs(right - source.channels[1][frame]) < 0.0001);
  }
  assert.equal(progress.at(-1), 1);
});

test("cancellation prevents any model work", async () => {
  const controller = new AbortController(); controller.abort();
  let called = false;
  await assert.rejects(separateSongChunks(asAudio(new FakeAudioBuffer(2, 44_100, 44_100)), ["Bass"], controller.signal, async () => { called = true; return []; }, (channels, frames, rate) => asAudio(new FakeAudioBuffer(channels, frames, rate)), 1, () => {}), (error: unknown) => error instanceof Error && error.name === "AbortError");
  assert.equal(called, false);
});
