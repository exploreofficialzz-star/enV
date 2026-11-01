export type ScatterStyle = "dots" | "stars" | "confetti";
export type TextureStyle = "paper" | "halftone" | "topography" | "woven";

type Rgb = { r: number; g: number; b: number };

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, Number.isFinite(value) ? value : minimum));
}

function safeHex(value: string | undefined, fallback: string): string {
  const input = (value ?? "").trim();
  if (/^#[0-9a-f]{6}$/i.test(input)) return input.toLowerCase();
  if (/^#[0-9a-f]{3}$/i.test(input)) {
    return "#" + input.slice(1).split("").map((channel) => channel + channel).join("").toLowerCase();
  }
  return fallback;
}

function toRgb(value: string): Rgb {
  const safe = safeHex(value, "#0d9f8a").slice(1);
  return {
    r: Number.parseInt(safe.slice(0, 2), 16),
    g: Number.parseInt(safe.slice(2, 4), 16),
    b: Number.parseInt(safe.slice(4, 6), 16),
  };
}

function toHex(color: Rgb): string {
  return "#" + [color.r, color.g, color.b]
    .map((channel) => Math.round(clamp(channel, 0, 255)).toString(16).padStart(2, "0"))
    .join("");
}

function mixColor(first: string, second: string, amount: number): string {
  const a = toRgb(first);
  const b = toRgb(second);
  const ratio = clamp(amount, 0, 1);
  return toHex({
    r: a.r + (b.r - a.r) * ratio,
    g: a.g + (b.g - a.g) * ratio,
    b: a.b + (b.b - a.b) * ratio,
  });
}

function createRandom(seed: number): () => number {
  let state = Math.round(clamp(seed, 1, 999999)) >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

function svgStart(title: string, width = 1200, height = 800): string {
  return '<svg xmlns="http://www.w3.org/2000/svg" width="' + width + '" height="' + height
    + '" viewBox="0 0 ' + width + ' ' + height + '" role="img" aria-label="' + title
    + '"><title>' + title + '</title>';
}

export type LowPolySvgOptions = {
  seed: number;
  detail: number;
  color: string;
  secondary: string;
  background?: string;
  stroke?: string;
  strokeWidth?: number;
  rotation?: number;
  transparent?: boolean;
};

/** Build deterministic, lightweight triangulated artwork without external assets. */
export function buildLowPolySvg(options: LowPolySvgOptions): string {
  const columns = Math.round(clamp(options.detail, 3, 18));
  const rows = Math.max(2, Math.round(columns * 0.62));
  const base = safeHex(options.color, "#0d9f8a");
  const accent = safeHex(options.secondary, "#7c4dff");
  const background = safeHex(options.background, "#f8fafc");
  const stroke = safeHex(options.stroke, background);
  const strokeWidth = clamp(options.strokeWidth ?? 0.8, 0, 4);
  const rotation = clamp(options.rotation ?? 0, 0, 360);
  const random = createRandom(options.seed);
  const width = 1200;
  const height = 800;
  const cellWidth = width / columns;
  const cellHeight = height / rows;
  const points = Array.from({ length: rows + 1 }, (_, row) =>
    Array.from({ length: columns + 1 }, (_, column) => {
      const boundary = row === 0 || row === rows || column === 0 || column === columns;
      const jitter = boundary ? 0 : 0.28;
      return {
        x: column * cellWidth + (random() - 0.5) * cellWidth * jitter,
        y: row * cellHeight + (random() - 0.5) * cellHeight * jitter,
      };
    }),
  );
  const triangles: string[] = [];
  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      const topLeft = points[row][column];
      const topRight = points[row][column + 1];
      const bottomLeft = points[row + 1][column];
      const bottomRight = points[row + 1][column + 1];
      const pair = random() > 0.5
        ? [[topLeft, topRight, bottomRight], [topLeft, bottomRight, bottomLeft]]
        : [[topLeft, topRight, bottomLeft], [topRight, bottomRight, bottomLeft]];
      for (const triangle of pair) {
        const coordinates = triangle.map((point) => point.x.toFixed(1) + "," + point.y.toFixed(1)).join(" ");
        const fill = mixColor(base, accent, 0.12 + random() * 0.76);
        const line = strokeWidth > 0
          ? ' stroke="' + stroke + '" stroke-width="' + strokeWidth + '" stroke-linejoin="round"'
          : "";
        triangles.push('<polygon points="' + coordinates + '" fill="' + fill + '"' + line + '/>');
      }
    }
  }
  const backgroundLayer = options.transparent ? "" : '<rect width="' + width + '" height="' + height + '" fill="' + background + '"/>';
  return svgStart("Generated low-poly geometric background", width, height)
    + backgroundLayer
    + '<g transform="rotate(' + rotation + ' ' + width / 2 + ' ' + height / 2 + ')">' + triangles.join("") + '</g></svg>';
}

export type ScatterSvgOptions = {
  seed: number;
  count: number;
  color: string;
  secondary: string;
  background?: string;
  style?: ScatterStyle;
  size?: number;
  opacity?: number;
  transparent?: boolean;
};

/** Create a repeatable particle field for cover art, cards and section backgrounds. */
export function buildScatterSvg(options: ScatterSvgOptions): string {
  const count = Math.round(clamp(options.count, 12, 400));
  const primary = safeHex(options.color, "#0d9f8a");
  const secondary = safeHex(options.secondary, "#7c4dff");
  const background = safeHex(options.background, "#f8fafc");
  const style: ScatterStyle = options.style === "stars" || options.style === "confetti" ? options.style : "dots";
  const maximumSize = clamp(options.size ?? 8, 2, 28);
  const opacity = clamp(options.opacity ?? 0.72, 0, 1);
  const random = createRandom(options.seed);
  const width = 1200;
  const height = 800;
  const shapes = Array.from({ length: count }, (_, index) => {
    const x = random() * width;
    const y = random() * height;
    const size = maximumSize * (0.35 + random() * 0.65);
    const fill = index % 3 === 0 ? secondary : primary;
    const alpha = (0.28 + random() * 0.72) * opacity;
    const rotation = Math.round(random() * 360);
    if (style === "stars") {
      const points = Array.from({ length: 10 }, (_, point) => {
        const angle = -Math.PI / 2 + point * Math.PI / 5;
        const radius = point % 2 === 0 ? size : size * 0.42;
        return (x + Math.cos(angle) * radius).toFixed(1) + "," + (y + Math.sin(angle) * radius).toFixed(1);
      }).join(" ");
      return '<polygon points="' + points + '" fill="' + fill + '" opacity="' + alpha.toFixed(3) + '"/>';
    }
    if (style === "confetti") {
      const widthSize = size * (0.6 + random() * 1.8);
      const heightSize = Math.max(2, size * 0.42);
      return '<rect x="' + (x - widthSize / 2).toFixed(1) + '" y="' + (y - heightSize / 2).toFixed(1)
        + '" width="' + widthSize.toFixed(1) + '" height="' + heightSize.toFixed(1)
        + '" rx="' + (heightSize * 0.22).toFixed(1) + '" fill="' + fill + '" opacity="' + alpha.toFixed(3)
        + '" transform="rotate(' + rotation + ' ' + x.toFixed(1) + ' ' + y.toFixed(1) + ')"/>';
    }
    return '<circle cx="' + x.toFixed(1) + '" cy="' + y.toFixed(1) + '" r="' + Math.max(1, size * 0.36).toFixed(1)
      + '" fill="' + fill + '" opacity="' + alpha.toFixed(3) + '"/>';
  }).join("");
  const backgroundLayer = options.transparent ? "" : '<rect width="' + width + '" height="' + height + '" fill="' + background + '"/>';
  return svgStart("Generated scatter and particle background", width, height) + backgroundLayer + shapes + "</svg>";
}

export type MeshGradientSvgOptions = {
  seed: number;
  colors: string[];
  background?: string;
  softness?: number;
  transparent?: boolean;
};

/** Generate a portable SVG mesh-like gradient with bounded, sanitized color stops. */
export function buildMeshGradientSvg(options: MeshGradientSvgOptions): string {
  const background = safeHex(options.background, "#101827");
  const colors = options.colors
    .filter((value) => typeof value === "string")
    .slice(0, 8)
    .map((value) => safeHex(value, "#0d9f8a"));
  const safeColors = colors.length >= 2 ? colors : ["#0d9f8a", "#7c4dff"];
  const softness = clamp(options.softness ?? 72, 35, 95);
  const random = createRandom(options.seed);
  const width = 1200;
  const height = 800;
  const definitions = safeColors.map((color, index) => {
    const x = Math.round(10 + random() * 80);
    const y = Math.round(8 + random() * 84);
    const radius = Math.round(62 + softness * 0.42);
    return '<radialGradient id="mesh-' + index + '" cx="' + x + '%" cy="' + y + '%" r="' + radius
      + '%"><stop offset="0%" stop-color="' + color + '" stop-opacity="0.96"/><stop offset="48%" stop-color="'
      + color + '" stop-opacity="0.62"/><stop offset="100%" stop-color="' + color + '" stop-opacity="0"/></radialGradient>';
  }).join("");
  const layers = safeColors.map((_, index) => {
    const x = Math.round(10 + random() * 80) * 12;
    const y = Math.round(8 + random() * 84) * 8;
    const rx = Math.round(440 + random() * 220);
    const ry = Math.round(300 + random() * 180);
    return '<ellipse cx="' + x + '" cy="' + y + '" rx="' + rx + '" ry="' + ry + '" fill="url(#mesh-' + index + ')"/>';
  }).join("");
  const backgroundLayer = options.transparent ? "" : '<rect width="' + width + '" height="' + height + '" fill="' + background + '"/>';
  return svgStart("Generated multi-colour mesh gradient", width, height)
    + '<defs>' + definitions + '</defs>' + backgroundLayer + '<g style="mix-blend-mode:screen">' + layers + '</g></svg>';
}

export type TextureSvgOptions = {
  seed: number;
  style: TextureStyle;
  color: string;
  background?: string;
  density?: number;
  opacity?: number;
  transparent?: boolean;
};

/** Build portable SVG textures: paper grain, halftone, topography and woven lines. */
export function buildTextureSvg(options: TextureSvgOptions): string {
  const color = safeHex(options.color, "#64748b");
  const background = safeHex(options.background, "#f8fafc");
  const density = clamp(options.density ?? 12, 4, 48);
  const opacity = clamp(options.opacity ?? 0.22, 0, 1);
  const seed = Math.round(clamp(options.seed, 1, 999999));
  const width = 1200;
  const height = 800;
  const backgroundLayer = options.transparent ? "" : '<rect width="' + width + '" height="' + height + '" fill="' + background + '"/>';
  if (options.style === "paper") {
    const frequency = (0.24 + density / 80).toFixed(3);
    const svg = '<defs><filter id="paper-grain"><feTurbulence type="fractalNoise" baseFrequency="' + frequency
      + '" numOctaves="3" seed="' + seed + '" stitchTiles="stitch"/></filter></defs><rect width="' + width
      + '" height="' + height + '" filter="url(#paper-grain)" opacity="' + opacity.toFixed(3) + '"/>';
    return svgStart("Generated paper grain texture", width, height) + backgroundLayer + svg + "</svg>";
  }
  if (options.style === "halftone") {
    const pitch = Math.round(density);
    const radius = Math.max(1, pitch * 0.18);
    const pattern = '<defs><pattern id="halftone" width="' + pitch + '" height="' + pitch
      + '" patternUnits="userSpaceOnUse"><circle cx="' + pitch / 2 + '" cy="' + pitch / 2 + '" r="' + radius
      + '" fill="' + color + '"/></pattern></defs><rect width="' + width + '" height="' + height
      + '" fill="url(#halftone)" opacity="' + opacity.toFixed(3) + '"/>';
    return svgStart("Generated halftone texture", width, height) + backgroundLayer + pattern + "</svg>";
  }
  if (options.style === "topography") {
    const random = createRandom(seed);
    const contours = Array.from({ length: Math.round(clamp(80 - density, 24, 72)) }, (_, index) => {
      const cx = Math.round(random() * width);
      const cy = Math.round(random() * height);
      const rx = Math.round(24 + random() * density * 8 + index * 1.4);
      const ry = Math.round(18 + random() * density * 5 + index * 0.9);
      const rotation = Math.round(random() * 180);
      return '<ellipse cx="' + cx + '" cy="' + cy + '" rx="' + rx + '" ry="' + ry + '" transform="rotate('
        + rotation + ' ' + cx + ' ' + cy + ')" fill="none" stroke="' + color + '" stroke-width="1.4" opacity="'
        + opacity.toFixed(3) + '"/>';
    }).join("");
    return svgStart("Generated topographic contour texture", width, height) + backgroundLayer + contours + "</svg>";
  }
  const pitch = Math.round(density);
  const woven = '<defs><pattern id="woven" width="' + pitch + '" height="' + pitch
    + '" patternUnits="userSpaceOnUse"><path d="M0 0V' + pitch + 'M0 0H' + pitch
    + '" fill="none" stroke="' + color + '" stroke-width="1"/></pattern></defs><rect width="' + width
    + '" height="' + height + '" fill="url(#woven)" opacity="' + opacity.toFixed(3) + '"/>';
  return svgStart("Generated woven line texture", width, height) + backgroundLayer + woven + "</svg>";
}
