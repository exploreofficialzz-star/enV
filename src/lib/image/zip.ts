import { crc32 } from "./crc32.ts";

export interface ZipEntry { name: string; data: Uint8Array; date?: Date }

const enc = new TextEncoder();

function dosDateTime(d: Date) {
  const year = Math.max(1980, d.getFullYear());
  return {
    time: (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1),
    date: ((year - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate(),
  };
}

/** Removes path tricks and control characters; keeps names unique inside one archive. */
export function safeZipName(name: string, used: Set<string>): string {
  let base = name.replace(/\\/g, "/").split("/").pop()!.replace(/[\u0000-\u001f<>:"|?*]+/g, "_").replace(/^\.+/, "").trim() || "file";
  if (base.length > 120) { const dot = base.lastIndexOf("."); const ext = dot > 0 ? base.slice(dot) : ""; base = base.slice(0, 120 - ext.length) + ext; }
  let candidate = base, n = 2;
  while (used.has(candidate.toLowerCase())) {
    const dot = base.lastIndexOf(".");
    candidate = dot > 0 ? `${base.slice(0, dot)}-${n}${base.slice(dot)}` : `${base}-${n}`;
    n++;
  }
  used.add(candidate.toLowerCase());
  return candidate;
}

/** Builds a stored (uncompressed) ZIP. Image files are already compressed, so storing is the right trade-off. */
export function buildZip(entries: ZipEntry[]): Blob {
  if (entries.length > 65_000) throw new Error("Too many files for a single ZIP archive.");
  const parts: BlobPart[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;
  const now = new Date();
  for (const entry of entries) {
    const name = enc.encode(entry.name);
    const { time, date } = dosDateTime(entry.date ?? now);
    const crc = crc32(entry.data);
    if (entry.data.length >= 0xffffffff || offset >= 0xffffffff) throw new Error("The archive would exceed 4 GB.");
    const local = new Uint8Array(30 + name.length);
    const lv = new DataView(local.buffer);
    lv.setUint32(0, 0x04034b50, true); lv.setUint16(4, 20, true); lv.setUint16(6, 0x0800, true); lv.setUint16(8, 0, true);
    lv.setUint16(10, time, true); lv.setUint16(12, date, true); lv.setUint32(14, crc, true);
    lv.setUint32(18, entry.data.length, true); lv.setUint32(22, entry.data.length, true); lv.setUint16(26, name.length, true); lv.setUint16(28, 0, true);
    local.set(name, 30);
    const cd = new Uint8Array(46 + name.length);
    const cv = new DataView(cd.buffer);
    cv.setUint32(0, 0x02014b50, true); cv.setUint16(4, 20, true); cv.setUint16(6, 20, true); cv.setUint16(8, 0x0800, true); cv.setUint16(10, 0, true);
    cv.setUint16(12, time, true); cv.setUint16(14, date, true); cv.setUint32(16, crc, true);
    cv.setUint32(20, entry.data.length, true); cv.setUint32(24, entry.data.length, true); cv.setUint16(28, name.length, true);
    cv.setUint32(42, offset, true);
    cd.set(name, 46);
    central.push(cd);
    parts.push(local as BlobPart, entry.data as BlobPart);
    offset += local.length + entry.data.length;
  }
  const cdSize = central.reduce((n, c) => n + c.length, 0);
  const end = new Uint8Array(22);
  const ev = new DataView(end.buffer);
  ev.setUint32(0, 0x06054b50, true); ev.setUint16(8, entries.length, true); ev.setUint16(10, entries.length, true);
  ev.setUint32(12, cdSize, true); ev.setUint32(16, offset, true);
  return new Blob([...parts, ...(central as BlobPart[]), end as BlobPart], { type: "application/zip" });
}
