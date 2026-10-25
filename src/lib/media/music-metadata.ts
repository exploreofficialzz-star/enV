export type MusicArtwork = {
  mimeType: string;
  bytes: Uint8Array;
};

export type MusicMetadata = {
  title?: string;
  artist?: string;
  album?: string;
  albumArtist?: string;
  year?: string;
  genre?: string;
  trackNumber?: string;
  discNumber?: string;
  composer?: string;
  comment?: string;
  copyright?: string;
  publisher?: string;
  bpm?: string;
  durationSeconds?: number;
  artwork?: MusicArtwork;
};

function ascii(bytes: Uint8Array, start: number, end: number): string {
  let value = "";
  for (let index = start; index < end && index < bytes.length; index += 1) {
    value += String.fromCharCode(bytes[index]);
  }
  return value;
}

function uint32be(bytes: Uint8Array, offset: number): number {
  if (offset < 0 || offset + 4 > bytes.length) return 0;
  return ((bytes[offset] * 0x1000000) + (bytes[offset + 1] << 16) + (bytes[offset + 2] << 8) + bytes[offset + 3]) >>> 0;
}

function uint32le(bytes: Uint8Array, offset: number): number {
  if (offset < 0 || offset + 4 > bytes.length) return 0;
  return (bytes[offset] | (bytes[offset + 1] << 8) | (bytes[offset + 2] << 16) | (bytes[offset + 3] << 24)) >>> 0;
}

function uint16be(bytes: Uint8Array, offset: number): number {
  if (offset < 0 || offset + 2 > bytes.length) return 0;
  return (bytes[offset] << 8) | bytes[offset + 1];
}

function uint16le(bytes: Uint8Array, offset: number): number {
  if (offset < 0 || offset + 2 > bytes.length) return 0;
  return bytes[offset] | (bytes[offset + 1] << 8);
}

function synchsafe32(bytes: Uint8Array, offset: number): number {
  if (offset < 0 || offset + 4 > bytes.length) return 0;
  return ((bytes[offset] & 0x7f) << 21) | ((bytes[offset + 1] & 0x7f) << 14) | ((bytes[offset + 2] & 0x7f) << 7) | (bytes[offset + 3] & 0x7f);
}

function clean(value: string): string {
  return value.replace(/\u0000/g, "").replace(/\s+/g, " ").trim();
}

function decode(bytes: Uint8Array, encoding = "utf-8"): string {
  try {
    return clean(new TextDecoder(encoding).decode(bytes));
  } catch {
    return clean(new TextDecoder().decode(bytes));
  }
}

function setText(metadata: MusicMetadata, key: string, raw: string): void {
  const value = clean(raw);
  if (!value) return;
  const keyUpper = key.toUpperCase().replace(/[\s_-]/g, "");
  const target: keyof MusicMetadata | undefined = ({
    TITLE: "title", TIT2: "title", TT2: "title",
    ARTIST: "artist", TPE1: "artist", TP1: "artist",
    ALBUM: "album", TALB: "album", TAL: "album",
    ALBUMARTIST: "albumArtist", ALBUMARTISTCREDIT: "albumArtist", TPE2: "albumArtist", TP2: "albumArtist", AART: "albumArtist",
    DATE: "year", YEAR: "year", TDRC: "year", TYER: "year", TYE: "year", DAY: "year",
    GENRE: "genre", TCON: "genre", TCO: "genre", GNRE: "genre",
    TRACKNUMBER: "trackNumber", TRACK: "trackNumber", TRCK: "trackNumber", TRK: "trackNumber",
    DISCNUMBER: "discNumber", DISC: "discNumber", TPOS: "discNumber", TPA: "discNumber",
    COMPOSER: "composer", TCOM: "composer", TCM: "composer", "\u00a9WRT": "composer",
    COMMENT: "comment", DESCRIPTION: "comment", COMM: "comment", "\u00a9CMT": "comment",
    COPYRIGHT: "copyright", TCOP: "copyright", TCR: "copyright", CPRT: "copyright",
    PUBLISHER: "publisher", TPUB: "publisher", TPB: "publisher",
    BPM: "bpm", TBPM: "bpm", TBP: "bpm",
  } as Record<string, keyof MusicMetadata>)[keyUpper];
  if (target && !metadata[target]) {
    if (target === "year") {
      const year = value.match(/\b(?:19|20)\d{2}\b/);
      metadata.year = year?.[0] ?? value;
    } else {
      (metadata as Record<string, unknown>)[target] = value;
    }
  }
  if ((keyUpper === "TLEN" || keyUpper === "LENGTH" || keyUpper === "DURATION") && !metadata.durationSeconds) {
    const milliseconds = Number(value);
    if (Number.isFinite(milliseconds) && milliseconds > 0) metadata.durationSeconds = milliseconds / 1000;
  }
}

function id3Text(frame: Uint8Array): string {
  if (!frame.length) return "";
  const encoding = frame[0];
  const payload = frame.subarray(1);
  if (encoding === 0) return decode(payload, "windows-1252").split("\u0000")[0] ?? "";
  if (encoding === 1) return decode(payload, "utf-16").split("\u0000")[0] ?? "";
  if (encoding === 2) return decode(payload, "utf-16be").split("\u0000")[0] ?? "";
  return decode(payload).split("\u0000")[0] ?? "";
}

function terminatorOffset(bytes: Uint8Array, start: number, encoding: number): number {
  if (encoding === 1 || encoding === 2) {
    for (let index = start; index + 1 < bytes.length; index += 2) {
      if (bytes[index] === 0 && bytes[index + 1] === 0) return index + 2;
    }
    return bytes.length;
  }
  for (let index = start; index < bytes.length; index += 1) {
    if (bytes[index] === 0) return index + 1;
  }
  return bytes.length;
}

function parseApic(frame: Uint8Array, metadata: MusicMetadata): void {
  if (frame.length < 5 || metadata.artwork) return;
  const encoding = frame[0];
  let mimeEnd = 1;
  while (mimeEnd < frame.length && frame[mimeEnd] !== 0) mimeEnd += 1;
  if (mimeEnd >= frame.length || mimeEnd + 2 >= frame.length) return;
  const mimeType = ascii(frame, 1, mimeEnd).toLowerCase() || "image/jpeg";
  const descriptionStart = mimeEnd + 2;
  const imageStart = terminatorOffset(frame, descriptionStart, encoding);
  if (imageStart >= frame.length) return;
  const picture = frame.slice(imageStart);
  if (picture.length) metadata.artwork = { mimeType, bytes: picture };
}

function parseId3(bytes: Uint8Array, metadata: MusicMetadata): void {
  if (bytes.length >= 10 && ascii(bytes, 0, 3) === "ID3") {
    const version = bytes[3];
    const flags = bytes[5];
    const size = synchsafe32(bytes, 6);
    const end = Math.min(bytes.length, 10 + size);
    let offset = 10;
    if ((flags & 0x40) !== 0 && offset + 4 <= end) {
      const extendedSize = version === 4 ? synchsafe32(bytes, offset) : uint32be(bytes, offset);
      offset += version === 4 ? extendedSize : extendedSize + 4;
    }
    while (offset + (version === 2 ? 6 : 10) <= end) {
      const headerSize = version === 2 ? 6 : 10;
      const idLength = version === 2 ? 3 : 4;
      const id = ascii(bytes, offset, offset + idLength);
      if (!id || !/^[A-Z0-9]{3,4}$/.test(id)) break;
      const frameSize = version === 2
        ? ((bytes[offset + 3] << 16) | (bytes[offset + 4] << 8) | bytes[offset + 5])
        : (version === 4 ? synchsafe32(bytes, offset + 4) : uint32be(bytes, offset + 4));
      if (frameSize <= 0 || offset + headerSize + frameSize > end) break;
      const frame = bytes.subarray(offset + headerSize, offset + headerSize + frameSize);
      if (id === "APIC" || id === "PIC") {
        parseApic(id === "PIC" && frame.length > 5 ? frame.slice(3) : frame, metadata);
      } else if (id.startsWith("T") && id !== "TXXX" && id !== "TXX") {
        const mapped = id === "TT2" ? "TT2" : id === "TP1" ? "TP1" : id === "TAL" ? "TAL" : id;
        setText(metadata, mapped, id3Text(frame));
      } else if ((id === "COMM" || id === "COM") && frame.length > 4 && !metadata.comment) {
        const encoding = frame[0];
        const descriptionEnd = terminatorOffset(frame, 4, encoding);
        const encodedComment = new Uint8Array(1 + Math.max(0, frame.length - descriptionEnd));
        encodedComment[0] = encoding;
        encodedComment.set(frame.subarray(descriptionEnd), 1);
        metadata.comment = id3Text(encodedComment);
      }
      offset += headerSize + frameSize;
    }
  }

  if (bytes.length >= 128 && ascii(bytes, bytes.length - 128, bytes.length - 125) === "TAG") {
    const start = bytes.length - 128;
    const legacyFields: Array<[string, number, number]> = [
      ["TITLE", start + 3, start + 33],
      ["ARTIST", start + 33, start + 63],
      ["ALBUM", start + 63, start + 93],
      ["YEAR", start + 93, start + 97],
    ];
    for (const [key, first, last] of legacyFields) {
      if (!({ TITLE: metadata.title, ARTIST: metadata.artist, ALBUM: metadata.album, YEAR: metadata.year } as Record<string, string | undefined>)[key]) {
        setText(metadata, key, decode(bytes.subarray(first, last), "windows-1252"));
      }
    }
    if (!metadata.comment) metadata.comment = decode(bytes.subarray(start + 97, start + 127), "windows-1252");
    if (bytes[start + 125] === 0 && bytes[start + 126] !== 0 && !metadata.trackNumber) {
      metadata.trackNumber = String(bytes[start + 126]);
    }
  }
}

function parseVorbisComments(block: Uint8Array, metadata: MusicMetadata, offset = 0): void {
  if (offset + 8 > block.length) return;
  let cursor = offset;
  const vendorLength = uint32le(block, cursor);
  cursor += 4 + vendorLength;
  if (cursor + 4 > block.length) return;
  const count = Math.min(uint32le(block, cursor), 10000);
  cursor += 4;
  for (let index = 0; index < count && cursor + 4 <= block.length; index += 1) {
    const length = uint32le(block, cursor);
    cursor += 4;
    if (length > block.length - cursor) return;
    const comment = decode(block.subarray(cursor, cursor + length));
    cursor += length;
    const separator = comment.indexOf("=");
    if (separator > 0) setText(metadata, comment.slice(0, separator), comment.slice(separator + 1));
  }
}

function parseFlac(bytes: Uint8Array, metadata: MusicMetadata): void {
  if (ascii(bytes, 0, 4) !== "fLaC") return;
  let offset = 4;
  let done = false;
  while (!done && offset + 4 <= bytes.length) {
    const first = bytes[offset];
    const type = first & 0x7f;
    done = (first & 0x80) !== 0;
    const length = (bytes[offset + 1] << 16) | (bytes[offset + 2] << 8) | bytes[offset + 3];
    const payloadStart = offset + 4;
    const payloadEnd = Math.min(bytes.length, payloadStart + length);
    if (payloadEnd - payloadStart < length) return;
    const block = bytes.subarray(payloadStart, payloadEnd);
    if (type === 0 && length >= 18 && !metadata.durationSeconds) {
      const sampleRate = (block[10] << 12) | (block[11] << 4) | (block[12] >> 4);
      const sampleCount = ((block[13] & 0x0f) * 0x100000000) + (block[14] * 0x1000000) + (block[15] << 16) + (block[16] << 8) + block[17];
      if (sampleRate > 0 && sampleCount > 0) metadata.durationSeconds = sampleCount / sampleRate;
    } else if (type === 4) {
      parseVorbisComments(block, metadata);
    } else if (type === 6 && !metadata.artwork && length >= 32) {
      let cursor = 4;
      const mimeLength = uint32be(block, cursor); cursor += 4;
      if (mimeLength > length - cursor) { offset = payloadEnd; continue; }
      const mimeType = decode(block.subarray(cursor, cursor + mimeLength)); cursor += mimeLength;
      const descriptionLength = uint32be(block, cursor); cursor += 4 + descriptionLength;
      if (cursor + 20 > block.length) { offset = payloadEnd; continue; }
      cursor += 16;
      const dataLength = uint32be(block, cursor); cursor += 4;
      if (dataLength > 0 && dataLength <= block.length - cursor) {
        metadata.artwork = { mimeType: mimeType || "image/jpeg", bytes: block.slice(cursor, cursor + dataLength) };
      }
    }
    offset = payloadEnd;
  }
}

function parseWav(bytes: Uint8Array, metadata: MusicMetadata): void {
  if (ascii(bytes, 0, 4) !== "RIFF" || ascii(bytes, 8, 12) !== "WAVE") return;
  let offset = 12;
  let byteRate = 0;
  let dataLength = 0;
  while (offset + 8 <= bytes.length) {
    const id = ascii(bytes, offset, offset + 4);
    const length = uint32le(bytes, offset + 4);
    const start = offset + 8;
    const end = Math.min(bytes.length, start + length);
    if (end - start < length) break;
    if (id === "fmt " && length >= 12) byteRate = uint32le(bytes, start + 8);
    if (id === "data") dataLength += length;
    if (id === "LIST" && length >= 4 && ascii(bytes, start, start + 4) === "INFO") {
      let cursor = start + 4;
      while (cursor + 8 <= end) {
        const key = ascii(bytes, cursor, cursor + 4);
        const itemLength = uint32le(bytes, cursor + 4);
        const itemStart = cursor + 8;
        const itemEnd = Math.min(end, itemStart + itemLength);
        if (itemEnd - itemStart < itemLength) break;
        const map: Record<string, string> = {
          INAM: "TITLE", IART: "ARTIST", IPRD: "ALBUM", ICRD: "YEAR", IGNR: "GENRE", ITRK: "TRACKNUMBER", ICMT: "COMMENT", ICOP: "COPYRIGHT", ISFT: "PUBLISHER",
        };
        if (map[key]) setText(metadata, map[key], decode(bytes.subarray(itemStart, itemEnd), "windows-1252"));
        cursor = itemStart + itemLength + (itemLength % 2);
      }
    }
    offset = start + length + (length % 2);
  }
  if (byteRate > 0 && dataLength > 0 && !metadata.durationSeconds) metadata.durationSeconds = dataLength / byteRate;
}

function parseMp4Item(bytes: Uint8Array, type: string, start: number, end: number, metadata: MusicMetadata): void {
  let cursor = start;
  while (cursor + 8 <= end) {
    const size = uint32be(bytes, cursor);
    const childType = ascii(bytes, cursor + 4, cursor + 8);
    if (size < 8 || cursor + size > end) break;
    if (childType === "data" && size >= 16) {
      const dataType = uint32be(bytes, cursor + 8);
      const valueStart = cursor + 16;
      const valueEnd = cursor + size;
      const value = bytes.subarray(valueStart, valueEnd);
      const textValue = decode(value);
      const tags: Record<string, string> = {
        "\u00a9nam": "TITLE", "\u00a9ART": "ARTIST", "aART": "ALBUMARTIST",
        "\u00a9alb": "ALBUM", "\u00a9day": "DATE", "\u00a9gen": "GENRE",
        "\u00a9wrt": "COMPOSER", "\u00a9cmt": "COMMENT", "cprt": "COPYRIGHT",
        "\u00a9too": "PUBLISHER",
      };
      if (type === "trkn" || type === "disk") {
        const current = uint16be(value, 2);
        const total = uint16be(value, 4);
        if (current > 0) setText(metadata, type === "trkn" ? "TRACKNUMBER" : "DISCNUMBER", total > 0 ? String(current) + "/" + String(total) : String(current));
      } else if (type === "covr" && !metadata.artwork && value.length > 0) {
        metadata.artwork = { mimeType: dataType === 14 ? "image/png" : "image/jpeg", bytes: value.slice() };
      } else if (tags[type]) {
        setText(metadata, tags[type], textValue);
      }
    }
    cursor += size;
  }
}

function parseMp4(bytes: Uint8Array, metadata: MusicMetadata): void {
  const containers = new Set(["moov", "udta", "trak", "mdia", "minf", "stbl", "edts", "dinf", "mvex"]);
  function walk(start: number, end: number, depth: number): void {
    if (depth > 10) return;
    let cursor = start;
    while (cursor + 8 <= end) {
      let size = uint32be(bytes, cursor);
      const type = ascii(bytes, cursor + 4, cursor + 8);
      let header = 8;
      if (size === 1) {
        if (cursor + 16 > end) break;
        const high = uint32be(bytes, cursor + 8);
        const low = uint32be(bytes, cursor + 12);
        size = high * 0x100000000 + low;
        header = 16;
      } else if (size === 0) {
        size = end - cursor;
      }
      if (size < header || !Number.isFinite(size) || cursor + size > end) break;
      const body = cursor + header;
      const itemEnd = cursor + size;
      if (type === "meta") {
        walk(body + 4, itemEnd, depth + 1);
      } else if (type === "ilst") {
        let item = body;
        while (item + 8 <= itemEnd) {
          let itemSize = uint32be(bytes, item);
          const itemType = ascii(bytes, item + 4, item + 8);
          if (itemSize < 8 || item + itemSize > itemEnd) break;
          parseMp4Item(bytes, itemType, item + 8, item + itemSize, metadata);
          item += itemSize;
        }
      } else if (type === "mvhd" && !metadata.durationSeconds && body + 20 <= itemEnd) {
        const version = bytes[body];
        const timescaleOffset = body + (version === 1 ? 20 : 12);
        const durationOffset = body + (version === 1 ? 24 : 16);
        const timescale = uint32be(bytes, timescaleOffset);
        let duration = uint32be(bytes, durationOffset);
        if (version === 1 && durationOffset + 8 <= itemEnd) {
          duration = uint32be(bytes, durationOffset) * 0x100000000 + uint32be(bytes, durationOffset + 4);
        }
        if (timescale > 0 && duration > 0) metadata.durationSeconds = duration / timescale;
      } else if (containers.has(type)) {
        walk(body, itemEnd, depth + 1);
      }
      cursor += size;
    }
  }
  walk(0, bytes.length, 0);
}

function parseOgg(bytes: Uint8Array, metadata: MusicMetadata): void {
  let offset = 0;
  let parts: Uint8Array[] = [];
  let packetLength = 0;
  while (offset + 27 <= bytes.length) {
    if (ascii(bytes, offset, offset + 4) !== "OggS") {
      offset += 1;
      continue;
    }
    const segmentCount = bytes[offset + 26];
    const laceStart = offset + 27;
    const bodyStart = laceStart + segmentCount;
    if (bodyStart > bytes.length) return;
    let bodyOffset = bodyStart;
    for (let index = 0; index < segmentCount; index += 1) {
      const length = bytes[laceStart + index];
      if (bodyOffset + length > bytes.length) return;
      if (packetLength + length <= 4 * 1024 * 1024) {
        parts.push(bytes.slice(bodyOffset, bodyOffset + length));
        packetLength += length;
      } else {
        parts = [];
        packetLength = 0;
      }
      bodyOffset += length;
      if (length < 255) {
        if (parts.length && packetLength > 0) {
          const packet = new Uint8Array(packetLength);
          let cursor = 0;
          for (const part of parts) { packet.set(part, cursor); cursor += part.length; }
          const signature = ascii(packet, 0, Math.min(packet.length, 8));
          if (packet[0] === 3 && ascii(packet, 1, 7) === "vorbis") {
            parseVorbisComments(packet, metadata, 7);
            return;
          }
          if (signature === "OpusTags") {
            parseVorbisComments(packet, metadata, 8);
            return;
          }
        }
        parts = [];
        packetLength = 0;
      }
    }
    offset = bodyOffset;
  }
}

function fallbackTitle(fileName: string): string {
  const lastSegment = fileName.split(/[?#]/, 1)[0]?.split(/[\\/]/).pop() ?? fileName;
  let decoded = lastSegment;
  try { decoded = decodeURIComponent(lastSegment); } catch { /* Keep the original file name. */ }
  return clean(decoded.replace(/\.[a-z0-9]{1,8}$/i, "").replace(/[_]+/g, " "));
}

/**
 * Reads common embedded tags locally from ID3/MP3, FLAC/Vorbis, Ogg/Opus, WAV/RIFF and MP4/M4A files.
 * The original audio bytes are never modified or uploaded by this parser.
 */
export function extractMusicMetadata(bytes: Uint8Array, fileName = ""): MusicMetadata {
  const metadata: MusicMetadata = {};
  parseId3(bytes, metadata);
  parseFlac(bytes, metadata);
  parseWav(bytes, metadata);
  parseOgg(bytes, metadata);
  if (ascii(bytes, 4, 8) === "ftyp" || ascii(bytes, 0, 8).includes("ftyp")) parseMp4(bytes, metadata);
  if (!metadata.title) metadata.title = fallbackTitle(fileName);
  if (metadata.year) {
    const year = metadata.year.match(/\b(?:19|20)\d{2}\b/);
    if (year) metadata.year = year[0];
  }
  return metadata;
}
