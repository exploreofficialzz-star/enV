/** Shared text layout + drawing for watermarks, memes and annotations (wrapping, stroke, shadow, rotation). */
export const FONTS: { id: string; label: string; stack: string }[] = [
  { id: "sans", label: "Sans-serif", stack: "Inter, system-ui, -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif" },
  { id: "serif", label: "Serif", stack: "Georgia, 'Times New Roman', Times, serif" },
  { id: "mono", label: "Monospace", stack: "ui-monospace, 'SF Mono', Menlo, Consolas, 'Liberation Mono', monospace" },
  { id: "impact", label: "Impact (meme)", stack: "Impact, 'Haettenschweiler', 'Arial Narrow Bold', 'Arial Black', sans-serif" },
  { id: "script", label: "Handwritten", stack: "'Segoe Script', 'Bradley Hand', 'Comic Sans MS', cursive" },
];

export interface TextStyle { family: string; size: number; bold: boolean; italic: boolean; color: string; strokeWidth: number; strokeColor: string; shadow: number; shadowColor: string; align: "left" | "center" | "right"; lineHeight: number; upper: boolean }
export const DEFAULT_TEXT: TextStyle = { family: "sans", size: 48, bold: true, italic: false, color: "#ffffff", strokeWidth: 0, strokeColor: "#000000", shadow: 0, shadowColor: "#000000", align: "center", lineHeight: 1.15, upper: false };

export const fontString = (s: TextStyle, size = s.size) => `${s.italic ? "italic " : ""}${s.bold ? "700 " : "400 "}${Math.max(1, size)}px ${FONTS.find((f) => f.id === s.family)?.stack ?? FONTS[0].stack}`;

export interface TextLayout { lines: string[]; width: number; height: number; size: number }

/** Greedy word wrap to `maxWidth` (0 = no wrap). Long single words are broken so nothing overflows. */
export function layoutText(ctx: CanvasRenderingContext2D, raw: string, style: TextStyle, size: number, maxWidth = 0): TextLayout {
  ctx.font = fontString(style, size);
  const text = style.upper ? raw.toUpperCase() : raw;
  const lines: string[] = [];
  for (const para of text.split("\n")) {
    if (!maxWidth) { lines.push(para); continue; }
    let line = "";
    for (const word of para.split(/\s+/)) {
      let w = word;
      while (ctx.measureText(w).width > maxWidth && w.length > 1) { let cut = w.length - 1; while (cut > 1 && ctx.measureText(w.slice(0, cut)).width > maxWidth) cut--; if (line) { lines.push(line); line = ""; } lines.push(w.slice(0, cut)); w = w.slice(cut); }
      const test = line ? `${line} ${w}` : w;
      if (line && ctx.measureText(test).width > maxWidth) { lines.push(line); line = w; } else line = test;
    }
    lines.push(line);
  }
  const width = Math.max(1, ...lines.map((l) => ctx.measureText(l).width));
  return { lines, width, height: lines.length * size * style.lineHeight, size };
}

/** Draws a laid-out block centred at (cx, cy), optionally rotated (degrees) about its centre. */
export function drawTextBlock(ctx: CanvasRenderingContext2D, layout: TextLayout, style: TextStyle, cx: number, cy: number, rotation = 0, opacity = 1) {
  ctx.save();
  ctx.globalAlpha *= opacity; ctx.translate(cx, cy); ctx.rotate((rotation * Math.PI) / 180);
  ctx.font = fontString(style, layout.size); ctx.textBaseline = "middle"; ctx.textAlign = style.align; ctx.lineJoin = "round"; ctx.miterLimit = 2;
  const x = style.align === "left" ? -layout.width / 2 : style.align === "right" ? layout.width / 2 : 0;
  layout.lines.forEach((line, i) => {
    const y = -layout.height / 2 + (i + 0.5) * layout.size * style.lineHeight;
    if (style.shadow > 0) { ctx.save(); ctx.shadowColor = style.shadowColor; ctx.shadowBlur = style.shadow; ctx.shadowOffsetX = style.shadow * 0.25; ctx.shadowOffsetY = style.shadow * 0.25; ctx.fillStyle = style.color; ctx.fillText(line, x, y); ctx.restore(); }
    if (style.strokeWidth > 0) { ctx.strokeStyle = style.strokeColor; ctx.lineWidth = style.strokeWidth; ctx.strokeText(line, x, y); }
    ctx.fillStyle = style.color; ctx.fillText(line, x, y);
  });
  ctx.restore();
}
