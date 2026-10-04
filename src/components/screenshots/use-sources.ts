import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { closeImageAsset, decodeImage } from "@/lib/image/decode-engine";
import type { ImageAsset } from "@/lib/image/types";
import type { SourceBitmap, SourceMap } from "@/lib/screenshots/export-runtime";

export type SourceOrigin = "upload" | "drop" | "paste" | "capture";
export interface SourceEntry extends SourceBitmap { bytes: number; mime: string; colorSpace: string | null; origin: SourceOrigin; thumb: string; asset: ImageAsset }
const MAX_KEPT = 8;

function thumbnail(asset: ImageAsset): string {
  try {
    const { width, height } = asset.metadata, k = Math.min(1, 96 / Math.max(width, height, 1)), c = document.createElement("canvas");
    c.width = Math.max(1, Math.round(width * k)); c.height = Math.max(1, Math.round(height * k)); c.getContext("2d")?.drawImage(asset.bitmap, 0, 0, c.width, c.height);
    return c.toDataURL("image/png");
  } catch { return ""; }
}

/** Session-only source store. Bitmaps live in memory for this tab and are closed on removal/unmount; nothing is persisted. */
export function useSources() {
  const [list, setList] = useState<SourceEntry[]>([]);
  const listRef = useRef<SourceEntry[]>([]); listRef.current = list;
  const counter = useRef(0);

  const add = useCallback(async (files: File[], origin: SourceOrigin, inUse: Set<string> = new Set()) => {
    const added: SourceEntry[] = []; const failures: string[] = [];
    for (const file of files) {
      try {
        const asset = await decodeImage(file), m = asset.metadata; counter.current += 1;
        added.push({ id: `src${counter.current}`, bitmap: asset.bitmap, width: m.width, height: m.height, name: m.name, hasAlpha: m.hasAlpha, bytes: m.bytes, mime: m.mime, colorSpace: m.colorSpace, origin, thumb: thumbnail(asset), asset });
      } catch (e) { failures.push(e instanceof Error ? e.message : "Could not read this file."); }
    }
    if (added.length) setList((prev) => {
      let next = [...prev, ...added];
      while (next.length > MAX_KEPT) { const idx = next.findIndex((s) => !inUse.has(s.id) && !added.includes(s)); if (idx < 0) break; closeImageAsset(next[idx].asset); next = next.filter((_, i) => i !== idx); }
      return next;
    });
    return { added, failures };
  }, []);

  const remove = useCallback((id: string) => setList((prev) => { const e = prev.find((s) => s.id === id); if (e) closeImageAsset(e.asset); return prev.filter((s) => s.id !== id); }), []);
  const clear = useCallback(() => setList((prev) => { prev.forEach((s) => closeImageAsset(s.asset)); return []; }), []);
  useEffect(() => () => { listRef.current.forEach((s) => closeImageAsset(s.asset)); }, []);

  const map: SourceMap = useMemo(() => Object.fromEntries(list.map((s) => [s.id, s])), [list]);
  return { list, map, add, remove, clear };
}
