export type CornerRadii = {
  topLeft: number;
  topRight: number;
  bottomRight: number;
  bottomLeft: number;
};

export type ShapeBorderStyle = "solid" | "dashed" | "dotted";

export type StudioShapeEdges = {
  width: number;
  height: number;
  radius: number;
  borderWidth: number;
  cornerRadii?: CornerRadii;
  borderStyle?: ShapeBorderStyle;
};

const nonnegative = (value: number) => Number.isFinite(value) ? Math.max(0, value) : 0;
const coordinate = (value: number) => Number.isFinite(value) ? value : 0;
const precise = (value: number) => Number(value.toFixed(6));

/** CSS corner radii share one scale factor when adjacent corners overlap. */
export function normalizedCornerRadii(layer: Pick<StudioShapeEdges, "width" | "height" | "radius" | "cornerRadii">): CornerRadii {
  const width = nonnegative(layer.width), height = nonnegative(layer.height);
  const fallback = nonnegative(layer.radius);
  const radii: CornerRadii = {
    topLeft: nonnegative(layer.cornerRadii?.topLeft ?? fallback),
    topRight: nonnegative(layer.cornerRadii?.topRight ?? fallback),
    bottomRight: nonnegative(layer.cornerRadii?.bottomRight ?? fallback),
    bottomLeft: nonnegative(layer.cornerRadii?.bottomLeft ?? fallback),
  };
  const sums = [
    [width, radii.topLeft + radii.topRight],
    [width, radii.bottomLeft + radii.bottomRight],
    [height, radii.topLeft + radii.bottomLeft],
    [height, radii.topRight + radii.bottomRight],
  ];
  const factor = Math.min(1, ...sums.filter(([, sum]) => sum > 0).map(([edge, sum]) => edge / sum));
  return {
    topLeft: precise(radii.topLeft * factor),
    topRight: precise(radii.topRight * factor),
    bottomRight: precise(radii.bottomRight * factor),
    bottomLeft: precise(radii.bottomLeft * factor),
  };
}

/** An SVG equivalent of a CSS rounded rectangle, including individual corners. */
export function roundedRectanglePath(layer: Pick<StudioShapeEdges, "width" | "height" | "radius" | "cornerRadii">, x = 0, y = 0): string {
  x = coordinate(x); y = coordinate(y);
  const width = nonnegative(layer.width), height = nonnegative(layer.height);
  const { topLeft: tl, topRight: tr, bottomRight: br, bottomLeft: bl } = normalizedCornerRadii(layer);
  const n = (value: number) => String(precise(value));
  const arc = (radius: number, endX: number, endY: number) => radius > 0
    ? `A${n(radius)} ${n(radius)} 0 0 1 ${n(endX)} ${n(endY)}`
    : `L${n(endX)} ${n(endY)}`;
  return [
    `M${n(x + tl)} ${n(y)}`,
    `H${n(x + width - tr)}`, arc(tr, x + width, y + tr),
    `V${n(y + height - br)}`, arc(br, x + width - br, y + height),
    `H${n(x + bl)}`, arc(bl, x, y + height - bl),
    `V${n(y + tl)}`, arc(tl, x + tl, y), "Z",
  ].join(" ");
}

export function shapeCornerCss(layer: Pick<StudioShapeEdges, "width" | "height" | "radius" | "cornerRadii">): string {
  const radii = normalizedCornerRadii(layer);
  return [radii.topLeft, radii.topRight, radii.bottomRight, radii.bottomLeft].map(value => `${value}px`).join(" ");
}

/** Dotted SVG strokes should use strokeLinecap="round" with this dash pattern. */
export function shapeStrokeDasharray(layer: Pick<StudioShapeEdges, "borderStyle" | "borderWidth">): string | undefined {
  const width = nonnegative(layer.borderWidth);
  if (width === 0 || !layer.borderStyle || layer.borderStyle === "solid") return undefined;
  return layer.borderStyle === "dotted" ? `0 ${precise(width * 2)}` : `${precise(width * 3)} ${precise(width * 2)}`;
}
