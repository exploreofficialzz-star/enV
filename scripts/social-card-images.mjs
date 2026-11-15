import { deflateSync } from "node:zlib";
import { socialCardRepresentativeTools } from "../src/lib/seo-social-cards.ts";

const WIDTH = 1200;
const HEIGHT = 630;
const FONT = {
  " ": ["00000","00000","00000","00000","00000","00000","00000"],
  A: ["01110","10001","10001","11111","10001","10001","10001"],
  B: ["11110","10001","10001","11110","10001","10001","11110"],
  C: ["01111","10000","10000","10000","10000","10000","01111"],
  D: ["11110","10001","10001","10001","10001","10001","11110"],
  E: ["11111","10000","10000","11110","10000","10000","11111"],
  F: ["11111","10000","10000","11110","10000","10000","10000"],
  G: ["01111","10000","10000","10111","10001","10001","01111"],
  H: ["10001","10001","10001","11111","10001","10001","10001"],
  I: ["11111","00100","00100","00100","00100","00100","11111"],
  J: ["00111","00010","00010","00010","10010","10010","01100"],
  K: ["10001","10010","10100","11000","10100","10010","10001"],
  L: ["10000","10000","10000","10000","10000","10000","11111"],
  M: ["10001","11011","10101","10101","10001","10001","10001"],
  N: ["10001","11001","10101","10011","10001","10001","10001"],
  O: ["01110","10001","10001","10001","10001","10001","01110"],
  P: ["11110","10001","10001","11110","10000","10000","10000"],
  Q: ["01110","10001","10001","10001","10101","10010","01101"],
  R: ["11110","10001","10001","11110","10100","10010","10001"],
  S: ["01111","10000","10000","01110","00001","00001","11110"],
  T: ["11111","00100","00100","00100","00100","00100","00100"],
  U: ["10001","10001","10001","10001","10001","10001","01110"],
  V: ["10001","10001","10001","10001","10001","01010","00100"],
  W: ["10001","10001","10001","10101","10101","10101","01010"],
  X: ["10001","10001","01010","00100","01010","10001","10001"],
  Y: ["10001","10001","01010","00100","00100","00100","00100"],
  Z: ["11111","00001","00010","00100","01000","10000","11111"],
  "0": ["01110","10001","10011","10101","11001","10001","01110"],
  "1": ["00100","01100","00100","00100","00100","00100","01110"],
  "2": ["01110","10001","00001","00010","00100","01000","11111"],
  "3": ["11110","00001","00001","01110","00001","00001","11110"],
  "4": ["00010","00110","01010","10010","11111","00010","00010"],
  "5": ["11111","10000","10000","11110","00001","00001","11110"],
  "6": ["01110","10000","10000","11110","10001","10001","01110"],
  "7": ["11111","00001","00010","00100","01000","01000","01000"],
  "8": ["01110","10001","10001","01110","10001","10001","01110"],
  "9": ["01110","10001","10001","01111","00001","00001","01110"],
  ".": ["00000","00000","00000","00000","00000","00110","00110"],
  ",": ["00000","00000","00000","00000","00110","00110","00100"],
  ":": ["00000","00110","00110","00000","00110","00110","00000"],
  ";": ["00000","00110","00110","00000","00110","00110","00100"],
  "!": ["00100","00100","00100","00100","00100","00000","00100"],
  "?": ["01110","10001","00001","00010","00100","00000","00100"],
  "-": ["00000","00000","00000","11111","00000","00000","00000"],
  "/": ["00001","00010","00010","00100","01000","01000","10000"],
  "&": ["01100","10010","10100","01000","10101","10010","01101"],
  "'": ["00100","00100","00000","00000","00000","00000","00000"],
  "(": ["00010","00100","01000","01000","01000","00100","00010"],
  ")": ["01000","00100","00010","00010","00010","00100","01000"],
  "+": ["00000","00100","00100","11111","00100","00100","00000"],
  "=": ["00000","00000","11111","00000","11111","00000","00000"],
  "%": ["11001","11010","00100","01000","10110","00110","00000"],
  "#": ["01010","11111","01010","01010","11111","01010","00000"],
  "_": ["00000","00000","00000","00000","00000","00000","11111"],
  "[": ["01110","01000","01000","01000","01000","01000","01110"],
  "]": ["01110","00010","00010","00010","00010","00010","01110"],
  "$": ["00100","01111","10100","01110","00101","11110","00100"],
};

const COLORS = {
  top: [14, 25, 41],
  bottom: [27, 45, 64],
  lime: [199, 243, 107],
  white: [247, 249, 246],
  muted: [175, 190, 199],
  line: [61, 79, 94],
  panel: [35, 53, 71],
};

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data) {
  const name = Buffer.from(type, "ascii");
  const chunk = Buffer.alloc(12 + data.length);
  chunk.writeUInt32BE(data.length, 0);
  name.copy(chunk, 4);
  data.copy(chunk, 8);
  chunk.writeUInt32BE(crc32(Buffer.concat([name, data])), 8 + data.length);
  return chunk;
}

function normalizedText(value) {
  return String(value ?? "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\x20-\x7e]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();
}

function wrapText(value, maxCharacters, maxLines) {
  const words = normalizedText(value).split(" ").filter(Boolean);
  const lines = [];
  let line = "";
  for (const word of words) {
    const candidate = line ? line + " " + word : word;
    if (candidate.length > maxCharacters && line) {
      lines.push(line);
      line = word;
    } else {
      line = candidate;
    }
  }
  if (line) lines.push(line);
  if (lines.length > maxLines) {
    const clipped = lines.slice(0, maxLines);
    const last = clipped[maxLines - 1];
    clipped[maxLines - 1] = last.slice(0, Math.max(1, maxCharacters - 3)).trimEnd() + "...";
    return clipped;
  }
  return lines;
}

function paintRect(pixels, x, y, width, height, color) {
  const x0 = Math.max(0, Math.floor(x));
  const y0 = Math.max(0, Math.floor(y));
  const x1 = Math.min(WIDTH, Math.ceil(x + width));
  const y1 = Math.min(HEIGHT, Math.ceil(y + height));
  for (let row = y0; row < y1; row += 1) {
    for (let column = x0; column < x1; column += 1) {
      const offset = (row * WIDTH + column) * 4;
      pixels[offset] = color[0];
      pixels[offset + 1] = color[1];
      pixels[offset + 2] = color[2];
      pixels[offset + 3] = 255;
    }
  }
}

function drawText(pixels, value, x, y, scale, color, maxCharacters, maxLines) {
  const lines = wrapText(value, maxCharacters, maxLines);
  lines.forEach((line, lineIndex) => {
    let cursor = x;
    for (const character of line) {
      const glyph = FONT[character] ?? FONT[" "];
      glyph.forEach((row, rowIndex) => {
        for (let column = 0; column < row.length; column += 1) {
          if (row[column] === "1") {
            paintRect(pixels, cursor + column * scale, y + lineIndex * 9 * scale + rowIndex * scale, scale, scale, color);
          }
        }
      });
      cursor += 6 * scale;
    }
  });
  return lines.length * 9 * scale;
}

export function buildSocialCardPng({ eyebrow = "TOOLS AND GUIDES", title, description }) {
  const pixels = Buffer.alloc(WIDTH * HEIGHT * 4);
  const scanlines = Buffer.alloc((WIDTH * 4 + 1) * HEIGHT);
  for (let y = 0; y < HEIGHT; y += 1) {
    const amount = y / (HEIGHT - 1);
    const rowColor = COLORS.top.map((value, index) => Math.round(value + (COLORS.bottom[index] - value) * amount));
    for (let x = 0; x < WIDTH; x += 1) {
      const offset = (y * WIDTH + x) * 4;
      pixels[offset] = rowColor[0];
      pixels[offset + 1] = rowColor[1];
      pixels[offset + 2] = rowColor[2];
      pixels[offset + 3] = 255;
    }
  }

  paintRect(pixels, 0, 0, 13, HEIGHT, COLORS.lime);
  paintRect(pixels, 72, 76, 90, 8, COLORS.lime);
  paintRect(pixels, 72, 104, 1056, 1, COLORS.line);
  paintRect(pixels, 72, 530, 1056, 1, COLORS.line);
  paintRect(pixels, 1010, 100, 118, 118, COLORS.panel);
  paintRect(pixels, 1022, 112, 94, 8, COLORS.lime);
  paintRect(pixels, 1022, 135, 68, 8, COLORS.muted);
  paintRect(pixels, 1022, 158, 82, 8, COLORS.muted);
  paintRect(pixels, 1022, 181, 54, 8, COLORS.muted);

  drawText(pixels, "ENV", 72, 125, 7, COLORS.lime, 5, 1);
  drawText(pixels, eyebrow, 72, 218, 2, COLORS.lime, 65, 1);
  const titleHeight = drawText(pixels, title, 72, 262, 5, COLORS.white, 34, 3);
  drawText(pixels, description, 72, 276 + titleHeight, 3, COLORS.muted, 57, 3);
  drawText(pixels, "ENVTOOLS.STORE", 72, 566, 2, COLORS.muted, 30, 1);
  drawText(pixels, "PRACTICAL TOOLS ACROSS WEB AND MOBILE", 690, 566, 1, COLORS.muted, 62, 1);

  for (let y = 0; y < HEIGHT; y += 1) {
    const sourceOffset = y * WIDTH * 4;
    const targetOffset = y * (WIDTH * 4 + 1);
    scanlines[targetOffset] = 0;
    pixels.copy(scanlines, targetOffset + 1, sourceOffset, sourceOffset + WIDTH * 4);
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(WIDTH, 0);
  ihdr.writeUInt32BE(HEIGHT, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    pngChunk("IHDR", ihdr),
    pngChunk("IDAT", deflateSync(scanlines, { level: 9 })),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
}

export function createSocialCardArtifacts({ categories, toolPages, guideTools, siteOrigin }) {
  const artifacts = [];
  const add = (path, eyebrow, title, description, alt) => {
    artifacts.push({
      path,
      url: siteOrigin + "/" + path.replace(/^public\//, ""),
      alt,
      content: buildSocialCardPng({ eyebrow, title, description }),
    });
  };

  add(
    "public/og/cards/home.png",
    "EN V · TOOL DISCOVERY",
    "Find the right tool for the task",
    "Browse practical calculators, converters, creative tools, file utilities, media tools and workspaces across web and mobile.",
    "enV homepage social preview with the enV brand and tool discovery message",
  );

  for (const category of categories) {
    add(
      "public/og/cards/categories/" + category.id + ".png",
      "EN V · CATEGORY",
      category.name,
      category.description + " " + (category.blurb ?? ""),
      "enV " + category.name + " category preview",
    );
  }

  for (const tool of socialCardRepresentativeTools(toolPages)) {
    add(
      "public/og/cards/tools/" + tool.id + ".png",
      "EN V · FEATURED TOOL",
      tool.name,
      tool.description,
      "enV preview for " + tool.name,
    );
  }

  for (const tool of socialCardRepresentativeTools(guideTools)) {
    add(
      "public/og/cards/guides/" + tool.id + ".png",
      "EN V · TOOL GUIDE",
      tool.name + " guide",
      tool.description,
      "enV usage guide preview for " + tool.name,
    );
  }

  return artifacts;
}
