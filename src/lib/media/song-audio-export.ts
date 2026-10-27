/** PCM16 interleaved WAV, preserving the decoded channels and sample rate. */
export function encodeSongSection(
  channels: readonly Float32Array[],
  sampleRate: number,
  startSeconds: number,
  endSeconds: number,
): Uint8Array {
  if (
    !channels.length ||
    channels.length > 8 ||
    !Number.isInteger(sampleRate) ||
    sampleRate < 8000 ||
    sampleRate > 192000
  )
    throw new Error("Invalid audio format.");
  if (
    !Number.isFinite(startSeconds) ||
    !Number.isFinite(endSeconds) ||
    startSeconds < 0 ||
    endSeconds <= startSeconds
  )
    throw new Error("Invalid section range.");
  if (channels.some((channel) => channel.length !== channels[0].length))
    throw new Error("Channel lengths differ.");
  const start = Math.round(startSeconds * sampleRate);
  const end = Math.min(channels[0].length, Math.round(endSeconds * sampleRate));
  if (end <= start) throw new Error("Section is outside the audio.");
  const dataBytes = (end - start) * channels.length * 2;
  if (dataBytes > 100 * 1024 * 1024) throw new Error("Section exceeds the 100 MB export limit.");
  const bytes = new Uint8Array(44 + dataBytes),
    view = new DataView(bytes.buffer);
  const text = (offset: number, value: string) => {
    for (let i = 0; i < value.length; i++) bytes[offset + i] = value.charCodeAt(i);
  };
  text(0, "RIFF");
  view.setUint32(4, 36 + dataBytes, true);
  text(8, "WAVE");
  text(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, channels.length, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * channels.length * 2, true);
  view.setUint16(32, channels.length * 2, true);
  view.setUint16(34, 16, true);
  text(36, "data");
  view.setUint32(40, dataBytes, true);
  let offset = 44;
  for (let frame = start; frame < end; frame++)
    for (const channel of channels) {
      const sample = channel[frame];
      const bounded = Number.isFinite(sample) ? Math.max(-1, Math.min(1, sample)) : 0;
      view.setInt16(offset, Math.round(bounded * (bounded < 0 ? 32768 : 32767)), true);
      offset += 2;
    }
  return bytes;
}

export async function renderSongSection(
  file: File,
  start: number,
  end: number,
  signal: AbortSignal,
) {
  const context = new AudioContext();
  try {
    const decoded = await context.decodeAudioData(await file.arrayBuffer());
    if (signal.aborted) throw new DOMException("Cancelled", "AbortError");
    if (decoded.length * decoded.numberOfChannels * 4 > 180 * 1024 * 1024)
      throw new Error("Decoded audio exceeds the export memory limit.");
    return encodeSongSection(
      Array.from({ length: decoded.numberOfChannels }, (_, index) => decoded.getChannelData(index)),
      decoded.sampleRate,
      start,
      end,
    );
  } finally {
    await context.close().catch(() => undefined);
  }
}
