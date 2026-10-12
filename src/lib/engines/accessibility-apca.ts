import { parseCssColor, resolveRenderedPair, type RgbaColor } from "./accessibility-color.ts";

/**
 * APCA-W3 0.1.9 (0.0.98G-4g), ported from the official reference equations for
 * web-content design review only. Keep constants/formula in sync with upstream.
 * APCA is developmental guidance, not a WCAG 2.2 criterion or certification.
 * The complete upstream terms are in public/licenses/APCA-W3-LICENSE.md.
 */
const SA98G = {
  mainTRC: 2.4,
  sRco: 0.2126729,
  sGco: 0.7151522,
  sBco: 0.072175,
  normBG: 0.56,
  normTXT: 0.57,
  revTXT: 0.62,
  revBG: 0.65,
  blkThrs: 0.022,
  blkClmp: 1.414,
  scaleBoW: 1.14,
  scaleWoB: 1.14,
  loBoWoffset: 0.027,
  loWoBoffset: 0.027,
  deltaYmin: 0.0005,
  loClip: 0.1,
} as const;

function sRGBtoY(color: RgbaColor): number {
  const simpleExp = (channel: number) => Math.pow(channel / 255, SA98G.mainTRC);
  return SA98G.sRco * simpleExp(color.r) + SA98G.sGco * simpleExp(color.g) + SA98G.sBco * simpleExp(color.b);
}

function APCAcontrast(txtY: number, bgY: number): number {
  if (!Number.isFinite(txtY) || !Number.isFinite(bgY) || Math.min(txtY, bgY) < 0 || Math.max(txtY, bgY) > 1.1) return 0;
  const txt = txtY > SA98G.blkThrs ? txtY : txtY + Math.pow(SA98G.blkThrs - txtY, SA98G.blkClmp);
  const bg = bgY > SA98G.blkThrs ? bgY : bgY + Math.pow(SA98G.blkThrs - bgY, SA98G.blkClmp);
  if (Math.abs(bg - txt) < SA98G.deltaYmin) return 0;

  if (bg > txt) {
    const sapc = (Math.pow(bg, SA98G.normBG) - Math.pow(txt, SA98G.normTXT)) * SA98G.scaleBoW;
    return (sapc < SA98G.loClip ? 0 : sapc - SA98G.loBoWoffset) * 100;
  }
  const sapc = (Math.pow(bg, SA98G.revBG) - Math.pow(txt, SA98G.revTXT)) * SA98G.scaleWoB;
  return (sapc > -SA98G.loClip ? 0 : sapc + SA98G.loWoBoffset) * 100;
}

export function apcaContrast(foreground: string | RgbaColor, background: string | RgbaColor, canvas: string | RgbaColor = "#ffffff"): number | null {
  const fg = typeof foreground === "string" ? parseCssColor(foreground) : foreground;
  const bg = typeof background === "string" ? parseCssColor(background) : background;
  const base = typeof canvas === "string" ? parseCssColor(canvas) : canvas;
  if (!fg || !bg || !base) return null;
  const rendered = resolveRenderedPair(fg, bg, base);
  const score = APCAcontrast(sRGBtoY(rendered.foreground), sRGBtoY(rendered.background));
  return Number.isFinite(score) ? score : null;
}
