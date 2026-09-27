/**
 * Compact RFC 1321 MD5. Intended for checksums and non-security fingerprints.
 * Do not use for passwords or integrity of untrusted data.
 */

const S = [
  7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 5, 9, 14, 20, 5, 9,
  14, 20, 5, 9, 14, 20, 5, 9, 14, 20, 4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23,
  4, 11, 16, 23, 6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21,
] as const;

const K = new Uint32Array(64);
for (let i = 0; i < 64; i += 1) {
  K[i] = Math.floor(Math.abs(Math.sin(i + 1)) * 0x100000000);
}

function rotl(x: number, n: number): number {
  return (x << n) | (x >>> (32 - n));
}

function toUtf8(text: string): Uint8Array {
  return new TextEncoder().encode(text);
}

function bytesToHex(n: number): string {
  let out = "";
  for (let i = 0; i < 4; i += 1) {
    out += ((n >>> (i * 8)) & 0xff).toString(16).padStart(2, "0");
  }
  return out;
}

export function md5Bytes(bytes: Uint8Array): string {
  const originalLen = bytes.length;
  const bitLen = originalLen * 8;
  const paddedLen = (((originalLen + 8) >>> 6) + 1) << 6;
  const buf = new Uint8Array(paddedLen);
  buf.set(bytes);
  buf[originalLen] = 0x80;
  const view = new DataView(buf.buffer);
  view.setUint32(paddedLen - 8, bitLen >>> 0, true);
  view.setUint32(paddedLen - 4, Math.floor(bitLen / 0x100000000), true);

  let a0 = 0x67452301;
  let b0 = 0xefcdab89;
  let c0 = 0x98badcfe;
  let d0 = 0x10325476;

  const w = new Int32Array(16);

  for (let offset = 0; offset < paddedLen; offset += 64) {
    for (let i = 0; i < 16; i += 1) {
      w[i] = view.getInt32(offset + i * 4, true);
    }
    let a = a0;
    let b = b0;
    let c = c0;
    let d = d0;

    for (let i = 0; i < 64; i += 1) {
      let f: number;
      let g: number;
      if (i < 16) {
        f = (b & c) | (~b & d);
        g = i;
      } else if (i < 32) {
        f = (d & b) | (~d & c);
        g = (5 * i + 1) % 16;
      } else if (i < 48) {
        f = b ^ c ^ d;
        g = (3 * i + 5) % 16;
      } else {
        f = c ^ (b | ~d);
        g = (7 * i) % 16;
      }
      const tmp = d;
      d = c;
      c = b;
      const sum = (a + f + K[i]! + w[g]!) | 0;
      b = (b + rotl(sum, S[i]!)) | 0;
      a = tmp;
    }

    a0 = (a0 + a) | 0;
    b0 = (b0 + b) | 0;
    c0 = (c0 + c) | 0;
    d0 = (d0 + d) | 0;
  }

  return bytesToHex(a0) + bytesToHex(b0) + bytesToHex(c0) + bytesToHex(d0);
}

export function md5(text: string): string {
  return md5Bytes(toUtf8(text));
}

export default md5;
