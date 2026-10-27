import { useEffect, useRef, useState } from "react";
import { CircleHelp, LoaderCircle } from "lucide-react";
import { studioFontWeightRange } from "@/lib/engines/studio-font-metadata";

export type StudioIcon = { body: string; viewBox: string };
const iconRequests = new Map<string, Promise<StudioIcon>>();
function trimCache<T>(cache: Map<string, T>, limit: number): void {
  while (cache.size > limit) {
    const oldest = cache.keys().next().value;
    if (oldest === undefined) break;
    cache.delete(oldest);
  }
}
let bundledIcons: Promise<Record<string, string>> | undefined;

function readBundledIcons(): Promise<Record<string, string>> {
  if (!bundledIcons) {
    bundledIcons = fetch("/uxui/icons.json")
      .then(async (response) => {
        if (!response.ok) throw new Error("Bundled icon library is unavailable.");
        const value: unknown = await response.json();
        if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid bundled icon library.");
        return value as Record<string, string>;
      })
      .catch((error: unknown) => {
        bundledIcons = undefined;
        throw error;
      });
  }
  return bundledIcons;
}

/** The shipped catalogue contains verified vectors, rather than guessed icon identifiers. */
export async function getBundledStudioIconNames(): Promise<string[]> {
  return Object.keys(await readBundledIcons());
}

/** Keep both imported and remote SVGs inert before they enter the artboard or preview. */
export function sanitizeStudioIcon(source: string): StudioIcon {
  if (typeof DOMParser === "undefined") throw new Error("Icon previews require a browser.");
  if (source.length > 512 * 1024) throw new Error("This SVG is too large for an icon preview.");
  const document = new DOMParser().parseFromString(source, "image/svg+xml");
  const root = document.documentElement;
  if (root.localName !== "svg" || document.querySelector("parsererror")) throw new Error("The icon contains invalid SVG.");
  const tags = new Set(["path", "circle", "rect", "ellipse", "line", "polyline", "polygon", "g"]);
  const attributes = new Set(["d", "fill", "stroke", "stroke-width", "stroke-linecap", "stroke-linejoin", "fill-rule", "clip-rule", "cx", "cy", "r", "rx", "ry", "x", "y", "x1", "y1", "x2", "y2", "width", "height", "points", "transform", "opacity", "fill-opacity", "stroke-opacity", "vector-effect"]);
  const presentation = ["fill", "stroke", "stroke-width", "stroke-linecap", "stroke-linejoin", "fill-rule", "clip-rule", "opacity", "fill-opacity", "stroke-opacity", "vector-effect"];
  if (!root.hasAttribute("fill") && !root.hasAttribute("stroke")) root.setAttribute("fill", "currentColor");
  function clean(node: Element): void {
    for (const child of Array.from(node.children)) {
      if (!tags.has(child.localName)) { child.remove(); continue; }
      for (const attribute of Array.from(child.attributes)) {
        if (!attributes.has(attribute.name)) child.removeAttribute(attribute.name);
        else if ((attribute.name === "fill" || attribute.name === "stroke") && !/^(currentColor|none|#[0-9a-fA-F]{3,8}|white|black|transparent)$/i.test(attribute.value)) child.setAttribute(attribute.name, "currentColor");
      }
      clean(child);
    }
  }
  // Keep root paint on one group. Copying opacity onto every descendant would
  // repeatedly multiply it and distort two-tone icons.
  const wrapper = document.createElementNS("http://www.w3.org/2000/svg", "g");
  for (const attribute of presentation) {
    const value = root.getAttribute(attribute);
    if (value !== null) wrapper.setAttribute(attribute, value);
  }
  while (root.firstChild) wrapper.appendChild(root.firstChild);
  root.appendChild(wrapper);
  clean(root);
  const dimensions = (root.getAttribute("viewBox") || `0 0 ${root.getAttribute("width") || "24"} ${root.getAttribute("height") || "24"}`).trim().split(/[\s,]+/).map(Number);
  const viewBox = dimensions.length === 4 && dimensions.every(Number.isFinite) && dimensions[2] > 0 && dimensions[3] > 0 ? dimensions.join(" ") : "0 0 24 24";
  if (!wrapper.querySelector("path,circle,rect,ellipse,line,polyline,polygon")) throw new Error("No supported vector shapes were found in this icon.");
  const body = Array.from(root.children).map((node) => new XMLSerializer().serializeToString(node)).join("");
  return { body, viewBox };
}

/** Shared by thumbnails and insertion, so an offline preview inserts the same SVG. */
export function getStudioIcon(name: string): Promise<StudioIcon> {
  if (!/^[a-z0-9-]+:[a-z0-9-]+$/.test(name)) return Promise.reject(new Error("Choose a valid icon identifier."));
  let request = iconRequests.get(name);
  if (!request) {
    request = (async () => {
      const bundled = await readBundledIcons().catch(() => ({} as Record<string, string>));
      if (typeof bundled[name] === "string") return sanitizeStudioIcon(bundled[name]);
      const controller = new AbortController();
      const timeout = window.setTimeout(() => controller.abort(), 10000);
      try {
        const response = await fetch("https://api.iconify.design/" + name.replace(":", "/") + ".svg", { signal: controller.signal });
        if (!response.ok) throw new Error("This icon is unavailable. Choose a bundled icon or import an SVG.");
        return sanitizeStudioIcon(await response.text());
      } finally { window.clearTimeout(timeout); }
    })();
    iconRequests.set(name, request);
    trimCache(iconRequests, 1024);
    void request.catch(() => { iconRequests.delete(name); });
  }
  return request;
}

function useVisibleAsset() {
  const ref = useRef<HTMLSpanElement | null>(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    if (typeof IntersectionObserver === "undefined") { setVisible(true); return; }
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) { setVisible(true); observer.disconnect(); }
    }, { rootMargin: "160px" });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  return { ref, visible };
}

export function StudioIconPreview({ name, className, size = 28 }: { name: string; className?: string; size?: number }) {
  const { ref, visible } = useVisibleAsset();
  const [icon, setIcon] = useState<StudioIcon | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    if (!visible) return;
    let cancelled = false;
    setIcon(null); setFailed(false);
    void getStudioIcon(name).then((value) => { if (!cancelled) setIcon(value); }).catch(() => { if (!cancelled) setFailed(true); });
    return () => { cancelled = true; };
  }, [name, visible]);
  return <span ref={ref} className={className} style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: size, minWidth: size }} title={failed ? "Icon preview unavailable. Choose a bundled icon or retry online." : undefined}>
    {icon ? <svg width={size} height={size} viewBox={icon.viewBox} aria-hidden="true" focusable="false" dangerouslySetInnerHTML={{ __html: icon.body }} /> : failed ? <CircleHelp size={size} aria-label="Icon preview unavailable" /> : <LoaderCircle size={Math.min(size, 18)} className="animate-spin motion-reduce:animate-none opacity-40" aria-label="Loading icon preview" />}
  </span>;
}

export const BUNDLED_STUDIO_FONTS: Record<string, string> = {
  Inter: "/uxui/fonts/inter.ttf",
  Lora: "/uxui/fonts/lora.ttf",
  "JetBrains Mono": "/uxui/fonts/jetbrains-mono.ttf",
  "Bebas Neue": "/uxui/fonts/bebas-neue.ttf",
  Caveat: "/uxui/fonts/caveat.ttf",
};
const fontRequests = new Map<string, Promise<void>>();
const genericFontFamilies = new Set(["system-ui", "serif", "sans-serif", "monospace", "cursive", "fantasy", "ui-serif", "ui-sans-serif", "ui-monospace"]);

/** Local font names are verified by the browser instead of silently substituting a fallback. */
export function loadSystemStudioFont(family: string): Promise<void> {
  if (genericFontFamilies.has(family)) return Promise.resolve();
  const key = "local:" + family;
  let request = fontRequests.get(key);
  if (!request) {
    request = new FontFace(family, `local(${JSON.stringify(family)})`).load().then((face) => { document.fonts.add(face); });
    fontRequests.set(key, request);
    trimCache(fontRequests, 256);
    void request.catch(() => { fontRequests.delete(key); });
  }
  return request;
}

/** Resolve the real typeface before labelling a rendered sample as its preview. */
export function loadStudioFont(family: string): Promise<void> {
  let request = fontRequests.get(family);
  if (!request) {
    request = (async () => {
      const bundledUrl = BUNDLED_STUDIO_FONTS[family];
      if (bundledUrl) {
        const response = await fetch(bundledUrl);
        if (!response.ok) throw new Error("This bundled font is unavailable.");
        const bytes = await response.arrayBuffer();
        const face = await new FontFace(family, bytes, { weight: studioFontWeightRange(bytes) }).load();
        document.fonts.add(face);
        return;
      }
      const link = document.createElement("link");
      link.rel = "stylesheet";
      link.href = "https://fonts.googleapis.com/css2?family=" + encodeURIComponent(family).replace(/%20/g, "+") + ":wght@400&display=swap";
      await new Promise<void>((resolve, reject) => {
        const timeout = window.setTimeout(() => { link.remove(); reject(new Error("Font preview timed out.")); }, 12000);
        link.onload = () => { window.clearTimeout(timeout); resolve(); };
        link.onerror = () => { window.clearTimeout(timeout); link.remove(); reject(new Error("Font preview could not be loaded.")); };
        document.head.appendChild(link);
      });
      const faces = await document.fonts.load(`400 20px ${JSON.stringify(family)}`);
      if (!faces.length) throw new Error("This font family is not available for preview.");
    })();
    fontRequests.set(family, request);
    trimCache(fontRequests, 256);
    void request.catch(() => { fontRequests.delete(family); });
  }
  return request;
}

export function FontPreview({ family, provider, sample = "Design systems that scale 012345", className, animated = true, weight }: { family: string; provider: "google" | "system"; sample?: string; className?: string; animated?: boolean; weight?: number }) {
  const { ref, visible } = useVisibleAsset();
  const [state, setState] = useState<"waiting" | "ready" | "failed">(genericFontFamilies.has(family) ? "ready" : "waiting");
  useEffect(() => {
    if (genericFontFamilies.has(family)) { setState("ready"); return; }
    if (!visible) return;
    let cancelled = false;
    setState("waiting");
    void (provider === "system" ? loadSystemStudioFont(family) : loadStudioFont(family)).then(() => { if (!cancelled) setState("ready"); }).catch(() => { if (!cancelled) setState("failed"); });
    return () => { cancelled = true; };
  }, [family, provider, visible]);
  return <span ref={ref} className={className} style={{ display: "block", minHeight: "2.5em", overflowWrap: "anywhere", fontWeight: weight, fontSynthesis: "weight style", fontFamily: state === "ready" ? (genericFontFamilies.has(family) ? family : JSON.stringify(family)) : undefined }}>
    {state === "ready" ? <span className={animated ? "uxui-font-animation" : "uxui-font-still"} data-font-ready={family}>
      <span>{sample}</span>
      {animated && <span aria-hidden="true">Aa Bb Cc · 0123456789</span>}
    </span> : <span style={{ fontSize: "11px", fontFamily: "system-ui", opacity: 0.7 }}>{state === "failed" ? (provider === "system" ? "Font not installed on this device" : "Connect to preview this font") : "Loading font preview…"}</span>}
  </span>;
}
