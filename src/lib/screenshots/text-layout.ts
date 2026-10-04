/** Safe text helpers. All user-controlled strings (addresses, titles, filenames) pass through here. */

// Control characters and bidi overrides/isolates that can visually spoof text.
// eslint-disable-next-line no-control-regex
const UNSAFE = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F\u200E\u200F\u202A-\u202E\u2066-\u2069\uFEFF]/g;

export function sanitizeDisplayText(text: string, maxLength = 200): string {
  const cleaned = String(text ?? "").replace(UNSAFE, "").replace(/[ \t]+/g, " ");
  return cleaned.length > maxLength ? cleaned.slice(0, maxLength) : cleaned;
}
/** Single line, display-only. The value is NEVER fetched or navigated to. */
export const displayUrl = (text: string, maxLength = 160) => sanitizeDisplayText(text, maxLength).replace(/[\r\n]+/g, " ").trim();

export function escapeXml(text: string): string {
  return String(text).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" })[c] as string);
}

/** Greedy word wrap with hard breaks for over-long words. `measure` is injected (canvas measureText or a test stub). */
export function wrapText(text: string, maxWidth: number, measure: (s: string) => number, maxLines = Infinity): string[] {
  const lines: string[] = [];
  for (const para of sanitizeDisplayText(text, 2000).split(/\r?\n/)) {
    if (!para.trim()) { lines.push(""); continue; }
    let current = "";
    for (const word of para.split(" ")) {
      let w = word;
      while (measure(w) > maxWidth && w.length > 1) {
        let cut = w.length - 1; while (cut > 1 && measure(w.slice(0, cut)) > maxWidth) cut--;
        if (current) { lines.push(current); current = ""; }
        lines.push(w.slice(0, cut)); w = w.slice(cut);
      }
      const next = current ? `${current} ${w}` : w;
      if (current && measure(next) > maxWidth) { lines.push(current); current = w; } else current = next;
    }
    lines.push(current);
  }
  if (lines.length > maxLines) { const kept = lines.slice(0, maxLines); kept[maxLines - 1] = `${kept[maxLines - 1].replace(/…$/, "")}…`; return kept; }
  return lines;
}

export function ellipsize(text: string, maxWidth: number, measure: (s: string) => number): string {
  if (measure(text) <= maxWidth) return text;
  let lo = 0, hi = text.length;
  while (lo < hi) { const mid = Math.ceil((lo + hi) / 2); if (measure(`${text.slice(0, mid)}…`) <= maxWidth) lo = mid; else hi = mid - 1; }
  return `${text.slice(0, lo)}…`;
}

const RESERVED = /^(con|prn|aux|nul|com\d|lpt\d)$/i;
export function safeFilenameBase(name: string, fallback = "screenshot"): string {
  const base = String(name ?? "").replace(/^.*[\\/]/, "").replace(/\.[^.]*$/, "").replace(UNSAFE, "").replace(/[^a-zA-Z0-9._-]+/g, "_").replace(/^[._-]+|[._-]+$/g, "").slice(0, 80);
  return !base || RESERVED.test(base) ? fallback : base;
}
