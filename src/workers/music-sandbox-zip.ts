import { inflateSync } from "fflate";
import { crc32 } from "../lib/media/song-metadata-analyzer";
self.onmessage = (
  event: MessageEvent<{ data: Uint8Array; size: number; crc: number; method: number }>,
) => {
  try {
    const { data, size, crc, method } = event.data;
    // A fixed output buffer bounds inflation even if a compressed payload lies about its size.
    const output = method === 0 ? data : inflateSync(data, { out: new Uint8Array(size) });
    if (output.length !== size || crc32(output) !== crc)
      throw new Error("The archive entry failed its size or checksum check.");
    self.postMessage({ data: output }, { transfer: [output.buffer] });
  } catch (e) {
    self.postMessage({ error: e instanceof Error ? e.message : "This archive entry is damaged." });
  }
};
