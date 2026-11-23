/**
 * Compression for bundle.ts using the platform's built-in streams (browsers and Node 18+ both have them), so Scene
 * Studio needs no extra library. `inflateRaw` stops reading the moment the output passes the size the zip promised,
 * so a zip bomb never gets to fill memory.
 */
import type { Deflate, Inflate } from "./bundle.ts";

async function collect(stream: ReadableStream<Uint8Array>, limit: number): Promise<Uint8Array> {
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.length;
      if (total > limit) {
        await reader.cancel().catch(() => undefined);
        throw new Error("The data is larger than the zip says it is.");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const out = new Uint8Array(total);
  let at = 0;
  for (const c of chunks) {
    out.set(c, at);
    at += c.length;
  }
  return out;
}

function toStream(data: Uint8Array): ReadableStream<Uint8Array> {
  return new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(data);
      controller.close();
    },
  });
}

export const inflateRaw: Inflate = async (compressed, expectedSize) => {
  const stream = toStream(compressed).pipeThrough(new DecompressionStream("deflate-raw") as unknown as ReadableWritablePair<Uint8Array, Uint8Array>);
  return collect(stream, expectedSize);
};

export const deflateRaw: Deflate = async (data) => {
  const stream = toStream(data).pipeThrough(new CompressionStream("deflate-raw") as unknown as ReadableWritablePair<Uint8Array, Uint8Array>);
  return collect(stream, Number.MAX_SAFE_INTEGER);
};
