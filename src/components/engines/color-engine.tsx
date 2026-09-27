import { useMemo, useState } from "react";
import { CopyButton } from "@/components/tools/copy-button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

function clamp(n: number, a: number, b: number) {
  return Math.min(b, Math.max(a, n));
}
function hexToRgb(hex: string) {
  const h = hex.replace("#", "").trim();
  const s = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
  if (!/^[0-9a-fA-F]{6}$/.test(s)) throw new Error("Enter a 3- or 6-digit hex color.");
  return {
    r: parseInt(s.slice(0, 2), 16),
    g: parseInt(s.slice(2, 4), 16),
    b: parseInt(s.slice(4, 6), 16),
  };
}
function rgbToHex(r: number, g: number, b: number) {
  const h = [r, g, b].map((n) => clamp(Math.round(n), 0, 255).toString(16).padStart(2, "0")).join("");
  return `#${h}`;
}
function rgbToHsl(r: number, g: number, b: number) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h = 0, s = 0;
  const l = (max + min) / 2;
  const d = max - min;
  if (d) {
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = (g - b) / d + (g < b ? 6 : 0); break;
      case g: h = (b - r) / d + 2; break;
      default: h = (r - g) / d + 4;
    }
    h /= 6;
  }
  return { h: h * 360, s: s * 100, l: l * 100 };
}
function hslToRgb(h: number, s: number, l: number) {
  h /= 360; s /= 100; l /= 100;
  if (s === 0) {
    const v = l * 255;
    return { r: v, g: v, b: v };
  }
  const hue2rgb = (p: number, q: number, t: number) => {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  return {
    r: hue2rgb(p, q, h + 1 / 3) * 255,
    g: hue2rgb(p, q, h) * 255,
    b: hue2rgb(p, q, h - 1 / 3) * 255,
  };
}
function luminance(r: number, g: number, b: number) {
  const f = (c: number) => {
    const x = c / 255;
    return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}
function contrast(a: string, b: string) {
  const A = hexToRgb(a), B = hexToRgb(b);
  const L1 = luminance(A.r, A.g, A.b);
  const L2 = luminance(B.r, B.g, B.b);
  const [hi, lo] = L1 > L2 ? [L1, L2] : [L2, L1];
  return (hi + 0.05) / (lo + 0.05);
}

export function ColorEngine({ op }: { op: string }) {
  const [hex, setHex] = useState("#0d9f8a");
  const [fg, setFg] = useState("#16181d");
  const [bg, setBg] = useState("#ffffff");
  let rgb = { r: 13, g: 159, b: 138 };
  let err: string | null = null;
  try {
    rgb = hexToRgb(hex);
  } catch (e) {
    err = e instanceof Error ? e.message : "Invalid color";
  }
  const hsl = rgbToHsl(rgb.r, rgb.g, rgb.b);
  const cmyk = (() => {
    const r = rgb.r / 255, g = rgb.g / 255, b = rgb.b / 255;
    const k = 1 - Math.max(r, g, b);
    if (k === 1) return { c: 0, m: 0, y: 0, k: 100 };
    return {
      c: ((1 - r - k) / (1 - k)) * 100,
      m: ((1 - g - k) / (1 - k)) * 100,
      y: ((1 - b - k) / (1 - k)) * 100,
      k: k * 100,
    };
  })();
  const ratio = useMemo(() => {
    try {
      return contrast(fg, bg);
    } catch {
      return 0;
    }
  }, [fg, bg]);

  const hues = [0, 30, 60, 120, 180, 210, 240, 300];
  const palette = hues.map((h) => rgbToHex(...Object.values(hslToRgb((hsl.h + h) % 360, hsl.s, hsl.l)) as [number, number, number]));

  const rows = [
    ["HEX", rgbToHex(rgb.r, rgb.g, rgb.b)],
    ["RGB", `${Math.round(rgb.r)}, ${Math.round(rgb.g)}, ${Math.round(rgb.b)}`],
    ["HSL", `${Math.round(hsl.h)}°, ${Math.round(hsl.s)}%, ${Math.round(hsl.l)}%`],
    ["HSV/HSB", `${Math.round(hsl.h)}°, ${Math.round(hsl.s)}%, ${Math.round(Math.max(rgb.r, rgb.g, rgb.b) / 255 * 100)}%`],
    ["CMYK", `${cmyk.c.toFixed(0)} / ${cmyk.m.toFixed(0)} / ${cmyk.y.toFixed(0)} / ${cmyk.k.toFixed(0)}`],
  ];

  if (op === "contrast" || op === "colorblind") {
    const passAA = ratio >= 4.5;
    const passAAA = ratio >= 7;
    return (
      <div className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="space-y-1.5">
            <Label>Foreground</Label>
            <div className="flex gap-2">
              <Input type="color" value={fg} onChange={(e) => setFg(e.target.value)} className="h-11 w-14 p-1" />
              <Input value={fg} onChange={(e) => setFg(e.target.value)} />
            </div>
          </label>
          <label className="space-y-1.5">
            <Label>Background</Label>
            <div className="flex gap-2">
              <Input type="color" value={bg} onChange={(e) => setBg(e.target.value)} className="h-11 w-14 p-1" />
              <Input value={bg} onChange={(e) => setBg(e.target.value)} />
            </div>
          </label>
        </div>
        <div className="rounded-xl px-4 py-8 text-center" style={{ background: bg, color: fg }}>
          <p className="text-2xl font-semibold">The quick brown fox</p>
          <p className="mt-1 text-sm">Body text sample · 16px</p>
        </div>
        <p className="text-sm">
          Contrast ratio <strong className="tabular-nums">{ratio.toFixed(2)}:1</strong>
          {" · "}
          AA {passAA ? "pass" : "fail"} · AAA {passAAA ? "pass" : "fail"}
        </p>
        {op === "colorblind" ? (
          <div className="grid grid-cols-3 gap-2">
            {[
              ["Protanopia", "grayscale"],
              ["Deuteranopia", "grayscale"],
              ["Tritanopia", "grayscale"],
            ].map(([label]) => (
              <div key={label} className="overflow-hidden rounded-lg">
                <div className="h-16" style={{ background: `linear-gradient(90deg, ${fg}, ${bg})`, filter: "grayscale(0.7)" }} />
                <p className="mt-1 text-xs text-muted">{label} (approx.)</p>
              </div>
            ))}
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <label className="flex flex-col gap-1.5">
        <Label>Color</Label>
        <div className="flex gap-2">
          <Input type="color" value={rgbToHex(rgb.r, rgb.g, rgb.b)} onChange={(e) => setHex(e.target.value)} className="h-11 w-14 p-1" />
          <Input value={hex} onChange={(e) => setHex(e.target.value)} />
        </div>
      </label>
      {err ? <p className="text-sm text-danger">{err}</p> : null}
      <div className="h-24 rounded-xl shadow-[var(--shadow-border)]" style={{ background: rgbToHex(rgb.r, rgb.g, rgb.b) }} />
      <dl className="divide-y divide-border rounded-lg bg-surface-2">
        {rows.map(([k, v]) => (
          <div key={k} className="flex items-center justify-between px-4 py-2.5">
            <dt className="text-sm text-muted">{k}</dt>
            <dd className="flex items-center gap-2 font-mono text-sm">
              {v} <CopyButton text={v} label="Copy" />
            </dd>
          </div>
        ))}
      </dl>
      {(op === "palette" || op === "picker") && (
        <div className="grid grid-cols-4 gap-2 sm:grid-cols-8">
          {palette.map((c) => (
            <button
              key={c}
              type="button"
              className="h-12 rounded-md"
              style={{ background: c }}
              aria-label={c}
              onClick={() => setHex(c)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
