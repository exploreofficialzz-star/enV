/** Builds a valid ICO container using a PNG image as the ICO payload. */
export async function pngToIco(png: Blob, size = 32): Promise<Blob> {
  const bytes = new Uint8Array(await png.arrayBuffer());
  const header = new Uint8Array(6);
  const view = new DataView(header.buffer);
  view.setUint16(0, 0, true);
  view.setUint16(2, 1, true);
  view.setUint16(4, 1, true);
  const entry = new Uint8Array(16);
  const ev = new DataView(entry.buffer);
  entry[0] = size >= 256 ? 0 : size;
  entry[1] = size >= 256 ? 0 : size;
  entry[2] = 0;
  entry[3] = 0;
  ev.setUint16(4, 1, true);
  ev.setUint16(6, 32, true);
  ev.setUint32(8, bytes.byteLength, true);
  ev.setUint32(12, 22, true);
  return new Blob([header, entry, bytes], { type: "image/x-icon" });
}
