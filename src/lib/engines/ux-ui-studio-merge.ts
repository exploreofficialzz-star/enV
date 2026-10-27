import { roundedRectanglePath, shapeStrokeDasharray, type CornerRadii, type ShapeBorderStyle } from "./ux-ui-studio-shape-style.ts";

/** Compound-vector merge. This retains paths; it does not perform Boolean union. */
export type StudioVectorLayer = {
  id: string; kind: string; name: string;
  x: number; y: number; width: number; height: number; rotation?: number;
  color: string; background: string; borderColor: string; borderWidth: number;
  radius: number; opacity: number; shadow?: boolean; zIndex?: number;
  iconSvg: string; iconViewBox: string; componentKey?: string;
  hidden?: boolean; display?: string;
  cornerRadii?: CornerRadii; borderStyle?: ShapeBorderStyle;
};

export type MergedStudioVector<T extends StudioVectorLayer = StudioVectorLayer> = {
  x: number; y: number; width: number; height: number;
  iconSvg: string; iconViewBox: string; componentKey: "merged-vector";
  sourceIds: string[]; sourceLayers: T[];
};

const SUPPORTED_KINDS = new Set(["icon", "rect", "ellipse", "triangle", "diamond", "hexagon", "star", "line", "divider", "pill"]);
const VECTOR_TAGS = new Set(["svg", "g", "path", "circle", "ellipse", "rect", "line", "polyline", "polygon"]);
const VECTOR_ATTRIBUTES = new Set([
  "d", "fill", "stroke", "stroke-width", "stroke-linecap", "stroke-linejoin", "stroke-miterlimit",
  "fill-rule", "clip-rule", "cx", "cy", "r", "rx", "ry", "x", "y", "x1", "y1", "x2", "y2",
  "width", "height", "points", "transform", "opacity", "fill-opacity", "stroke-opacity", "vector-effect",
  "stroke-dasharray", "stroke-dashoffset", "viewBox", "preserveAspectRatio", "overflow",
]);
const number = (value: number) => String(Number(value.toFixed(6)));
const escape = (value: string) => value.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

function paint(value: string): string {
  if (!/^(?:none|transparent|currentColor|black|white|#(?:[a-f\d]{3}|[a-f\d]{4}|[a-f\d]{6}|[a-f\d]{8}))$/i.test(value)) {
    throw new Error("This vector uses an unsupported paint. Use solid colors before merging.");
  }
  return value;
}

/** Re-serialize supported vector markup instead of copying executable SVG content. */
function vectorMarkup(source: string, color: string): string {
  if (!source || source.length > 2_000_000) throw new Error("Select loaded vector icons before merging.");
  const stack: string[] = [];
  const output: string[] = [];
  let drawable = false;
  for (const token of source.match(/<!--[\s\S]*?-->|<[^>]*>|[^<]+/g) || []) {
    if (token.startsWith("<!--")) continue;
    if (!token.startsWith("<")) {
      if (token.trim()) throw new Error("This icon contains unsupported SVG content. Keep it as a separate layer.");
      continue;
    }
    const closing = /^<\/\s*([\w:-]+)\s*>$/.exec(token);
    if (closing) {
      if (stack.pop() !== closing[1]) throw new Error("This icon has invalid vector markup.");
      output.push("</" + closing[1] + ">");
      continue;
    }
    const match = /^<([\w:-]+)\b([\s\S]*?)\/?\s*>$/.exec(token);
    if (!match || !VECTOR_TAGS.has(match[1])) throw new Error("This icon uses SVG effects that cannot be merged faithfully. Keep it as a separate layer.");
    const attrs = new Map<string, string>();
    let remainder = match[2];
    const attribute = /([\w:.-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;
    for (const entry of remainder.matchAll(attribute)) {
      const key = entry[1], value = entry[2] ?? entry[3] ?? "";
      if (key === "xmlns" || key.startsWith("aria-") || key === "role") continue;
      if (key === "style") {
        for (const declaration of value.split(";")) {
          if (!declaration.trim()) continue;
          const separator = declaration.indexOf(":");
          const property = declaration.slice(0, separator).trim();
          if (separator <= 0 || !VECTOR_ATTRIBUTES.has(property)) throw new Error("Remove unsupported SVG styles before merging.");
          attrs.set(property, declaration.slice(separator + 1).trim());
        }
      } else {
        if (!VECTOR_ATTRIBUTES.has(key)) throw new Error("Remove unsupported SVG attributes before merging.");
        attrs.set(key, value);
      }
    }
    remainder = remainder.replace(attribute, "").trim();
    if (remainder) throw new Error("This icon has invalid vector attributes.");
    const serialized = Array.from(attrs, ([key, raw]) => {
      let value = raw;
      if (key === "fill" || key === "stroke") value = paint(raw).toLowerCase() === "currentcolor" ? color : paint(raw);
      // References, entities and CSS functions are not needed by supported geometry.
      if (/[<>&]/.test(value) || /(?:url\s*\(|javascript\s*:)/i.test(value)) throw new Error("This icon contains unsupported SVG references.");
      if (key === "overflow" && value !== "hidden" && value !== "visible") throw new Error("Unsupported SVG viewport clipping.");
      return " " + key + '="' + escape(value) + '"';
    }).join("");
    const selfClosing = /\/\s*>$/.test(token);
    output.push("<" + match[1] + serialized + (selfClosing ? "/>" : ">"));
    if (!selfClosing) stack.push(match[1]);
    if (match[1] !== "g" && match[1] !== "svg") drawable = true;
  }
  if (stack.length || !drawable) throw new Error("Select loaded vector icons before merging.");
  return output.join("");
}

function viewBox(source: string): string {
  const parts = (source || "0 0 24 24").trim().split(/[\s,]+/).map(Number);
  if (parts.length !== 4 || !parts.every(Number.isFinite) || parts[2] <= 0 || parts[3] <= 0) throw new Error("An icon has an invalid viewBox. Reimport it before merging.");
  return parts.map(number).join(" ");
}

function polygon(kind: string, width: number, height: number): string {
  if (kind === "triangle") return `${number(width / 2)},0 ${number(width)},${number(height)} 0,${number(height)}`;
  if (kind === "diamond") return `${number(width / 2)},0 ${number(width)},${number(height / 2)} ${number(width / 2)},${number(height)} 0,${number(height / 2)}`;
  if (kind === "hexagon") return `${number(width / 4)},0 ${number(width * .75)},0 ${number(width)},${number(height / 2)} ${number(width * .75)},${number(height)} ${number(width / 4)},${number(height)} 0,${number(height / 2)}`;
  return Array.from({length: 10}, (_, index) => {
    const radius = index % 2 ? .21 : .5, angle = -Math.PI / 2 + index * Math.PI / 5;
    return number(width / 2 + Math.cos(angle) * width * radius) + "," + number(height / 2 + Math.sin(angle) * height * radius);
  }).join(" ");
}

function shape(layer: StudioVectorLayer): string {
  const width = number(layer.width), height = number(layer.height);
  const fill = paint(layer.background === "transparent" ? (["ellipse", "triangle", "diamond", "hexagon", "star"].includes(layer.kind) ? "#DBEAFE" : "none") : layer.background);
  const stroke = layer.borderWidth > 0 ? paint(layer.borderColor) : "none";
  const dash = shapeStrokeDasharray(layer);
  const common = ` fill="${escape(fill)}" stroke="${escape(stroke)}" stroke-width="${number(layer.borderWidth)}"` + (dash ? ` stroke-dasharray="${dash}"` : "") + (layer.borderStyle === "dotted" ? ' stroke-linecap="round"' : "");
  if (layer.kind === "icon") {
    const inset = layer.componentKey === "merged-vector" ? 0 : 2;
    const color = paint(layer.color);
    return `<svg x="${inset}" y="${inset}" width="${number(Math.max(1, layer.width - inset * 2))}" height="${number(Math.max(1, layer.height - inset * 2))}" viewBox="${viewBox(layer.iconViewBox)}" preserveAspectRatio="xMidYMid meet" overflow="hidden" fill="${escape(color)}">${vectorMarkup(layer.iconSvg, color)}</svg>`;
  }
  if (layer.kind === "ellipse") return `<ellipse cx="${number(layer.width / 2)}" cy="${number(layer.height / 2)}" rx="${number(layer.width / 2)}" ry="${number(layer.height / 2)}"${common}/>`;
  if (["triangle", "diamond", "hexagon", "star"].includes(layer.kind)) return `<polygon points="${polygon(layer.kind, layer.width, layer.height)}"${common} stroke-linejoin="round"/>`;
  if (layer.kind === "line" || layer.kind === "divider") {
    const lineColor = layer.background === "transparent" ? (layer.kind === "line" ? "#64748B" : "#CBD5E1") : paint(layer.background);
    return `<line x1="0" y1="${layer.kind === "line" ? number(layer.height / 2) : "0"}" x2="${width}" y2="${layer.kind === "line" ? number(layer.height / 2) : height}" stroke="${escape(lineColor)}" stroke-width="${number(Math.max(1, layer.borderWidth || layer.height))}"${layer.kind === "line" ? ' stroke-linecap="round"' : ""}/>`;
  }
  return layer.cornerRadii ? `<path d="${roundedRectanglePath(layer)}"${common}/>` : `<rect x="0" y="0" width="${width}" height="${height}" rx="${number(layer.radius)}"${common}/>`;
}

/** Merge selected vector layers in paint order, retaining each source's local coordinates. */
export function mergeStudioVectorLayers<T extends StudioVectorLayer>(layers: readonly T[]): MergedStudioVector<T> {
  if (layers.length < 2) throw new Error("Select at least two icons or vector shapes to merge.");
  if (layers.length > 256) throw new Error("Merge up to 256 vector layers at a time.");
  if (new Set(layers.map(layer => layer.id)).size !== layers.length) throw new Error("Select different layers to merge.");
  for (const layer of layers) {
    if (!SUPPORTED_KINDS.has(layer.kind)) throw new Error("Merge supports icons and geometric shapes. Keep text, images and UI components as separate layers.");
    if (layer.hidden || layer.display === "none") throw new Error("Show all selected layers before merging.");
    if (layer.shadow) throw new Error("Remove shadows before merging, or keep these layers grouped to preserve their separate shadows.");
    if (![layer.x, layer.y, layer.width, layer.height, layer.rotation ?? 0, layer.borderWidth, layer.radius, layer.opacity].every(Number.isFinite) || layer.width <= 0 || layer.height <= 0 || layer.borderWidth < 0 || layer.radius < 0 || layer.opacity < 0 || layer.opacity > 1) throw new Error("A selected layer has invalid vector geometry or opacity.");
  }
  const ordered = layers.map((layer, index) => ({layer, index})).sort((a, b) => (a.layer.zIndex ?? 1) - (b.layer.zIndex ?? 1) || a.index - b.index).map(item => item.layer);
  const points = ordered.flatMap(layer => {
    const angle = (layer.rotation || 0) * Math.PI / 180, cos = Math.cos(angle), sin = Math.sin(angle);
    const cx = layer.x + layer.width / 2, cy = layer.y + layer.height / 2;
    const stroke = layer.kind === "icon" ? 0 : Math.max(layer.borderWidth, layer.kind === "line" || layer.kind === "divider" ? layer.height : 0) / 2;
    return [[-stroke, -stroke], [layer.width + stroke, -stroke], [layer.width + stroke, layer.height + stroke], [-stroke, layer.height + stroke]].map(([x, y]) => ({
      x: cx + (x - layer.width / 2) * cos - (y - layer.height / 2) * sin,
      y: cy + (x - layer.width / 2) * sin + (y - layer.height / 2) * cos,
    }));
  });
  const x = Math.min(...points.map(point => point.x)), y = Math.min(...points.map(point => point.y));
  const width = Math.max(1, Math.max(...points.map(point => point.x)) - x), height = Math.max(1, Math.max(...points.map(point => point.y)) - y);
  const body = ordered.map(layer => {
    const transform = `translate(${number(layer.x - x)} ${number(layer.y - y)})${layer.rotation ? ` rotate(${number(layer.rotation)} ${number(layer.width / 2)} ${number(layer.height / 2)})` : ""}`;
    return `<g transform="${transform}" opacity="${number(layer.opacity)}">${shape(layer)}</g>`;
  }).join("");
  return {
    x: Number(number(x)), y: Number(number(y)), width: Number(number(width)), height: Number(number(height)),
    iconSvg: body, iconViewBox: `0 0 ${number(width)} ${number(height)}`, componentKey: "merged-vector",
    sourceIds: ordered.map(layer => layer.id), sourceLayers: ordered.map(layer => ({...layer})),
  };
}
