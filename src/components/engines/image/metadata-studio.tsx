/** Metadata inspector / EXIF viewer / cleaner: read what is really inside the file, remove it losslessly, then verify the result. */
import { useMemo, useState } from "react";
import { FileDropzone } from "@/components/tools/file-dropzone";
import { ErrorBanner } from "@/components/tools/error-banner";
import { ImageToolError, errorMessage, fullCanvas, loadSource, outputName, saveBlob, baseName, releaseSource } from "@/lib/image/canvas";
import { encodeCanvas } from "@/lib/image/export";
import { readMetadata, stripMetadataBytes, verifyCleaned, type MetadataReport, type MetaEntry, type MetaGroup } from "@/lib/image/exif";
import { formatBytes } from "@/lib/image/geometry";
import { buildZip, safeZipName } from "@/lib/image/zip";
import { Btn, Chips, CopyButton, Notice, Section, Seg, Stat, Toggle } from "./ui";

interface Item { id: string; file: File; bytes: Uint8Array; report: MetadataReport; out?: { blob: Blob; removed: string[]; clean: boolean; remaining: string[]; note?: string }; error?: string }
let seq = 0;

const SENS: Record<MetaEntry["sensitivity"], { label: string; cls: string }> = {
  location: { label: "Location", cls: "bg-danger/15 text-danger" }, identity: { label: "Identity", cls: "bg-warn/20 text-fg" }, device: { label: "Device", cls: "bg-warn/20 text-fg" }, timestamp: { label: "Time", cls: "bg-warn/20 text-fg" }, technical: { label: "Technical", cls: "bg-surface-2 text-muted" },
};
const GROUP_ORDER: MetaGroup[] = ["Location", "Author & rights", "Camera & lens", "Date & time", "Software", "Capture settings", "Image", "Color profile", "Embedded data"];

function privacyScore(r: MetadataReport) {
  const flags: string[] = [];
  if (r.gps) flags.push("GPS location");
  if (r.entries.some((e) => e.sensitivity === "identity")) flags.push("author / owner / comments");
  if (r.entries.some((e) => e.sensitivity === "device")) flags.push("camera, lens or software");
  if (r.entries.some((e) => e.sensitivity === "timestamp")) flags.push("capture date and time");
  if (r.hasThumbnail) flags.push("embedded thumbnail");
  if (r.trailingBytes > 0) flags.push("data appended after the image");
  return flags;
}

async function addFiles(files: File[]): Promise<Item[]> {
  const items: Item[] = [];
  for (const file of files) {
    if (file.size <= 0) { items.push({ id: `m${seq++}`, file, bytes: new Uint8Array(), report: readMetadata(new Uint8Array()), error: "This file is empty." }); continue; }
    const bytes = new Uint8Array(await file.arrayBuffer());
    items.push({ id: `m${seq++}`, file, bytes, report: readMetadata(bytes) });
  }
  return items;
}

function Inspector({ item, initialGroup }: { item: Item; initialGroup: string }) {
  const r = item.report;
  const [group, setGroup] = useState(initialGroup);
  const flags = privacyScore(r);
  const groups = GROUP_ORDER.filter((g) => r.entries.some((e) => e.group === g));
  const shown = group === "all" ? groups : groups.filter((g) => g === group);
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Stat label="Format" value={r.format === "unknown" ? "Not recognised" : r.format.toUpperCase()} /><Stat label="Dimensions" value={r.dimensions ? `${r.dimensions.width} × ${r.dimensions.height}` : "—"} />
        <Stat label="Density" value={r.density ? `${r.density.x} DPI (${r.density.source})` : "Not stored"} /><Stat label="File size" value={formatBytes(item.file.size)} />
      </div>
      {r.format === "unknown" ? <Notice tone="warn">This file type isn't one the metadata reader understands (JPEG, PNG and WebP are supported). Nothing could be read.</Notice>
        : flags.length ? <Notice tone="warn"><strong>Privacy:</strong> this file contains {flags.join(", ")}. Anyone you share the original with can read it.</Notice> : <Notice tone="ok">No location, owner or device information was found in this file.</Notice>}
      {r.gps ? <div className="flex flex-wrap items-center gap-2 rounded-lg bg-danger/10 px-3 py-2 text-sm"><span className="font-medium text-danger">GPS position</span><code className="tabular-nums">{r.gps.lat.toFixed(6)}, {r.gps.lon.toFixed(6)}</code>{r.gps.altitude !== null ? <span className="text-muted">{Math.round(r.gps.altitude)} m</span> : null}<CopyButton text={`${r.gps.lat.toFixed(6)}, ${r.gps.lon.toFixed(6)}`} label="Copy coordinates" /></div> : null}
      {groups.length > 1 ? <Chips active={group} onPick={setGroup} items={[{ id: "all", label: "Everything" }, ...groups.map((g) => ({ id: g, label: g }))]} /> : null}
      {shown.map((g) => (
        <Section key={g} title={g} badge={<span className="text-xs font-normal text-muted">{r.entries.filter((e) => e.group === g).length}</span>}>
          <dl className="divide-y divide-border text-sm">
            {r.entries.filter((e) => e.group === g).map((e, i) => (
              <div key={`${e.label}-${i}`} className="flex flex-wrap items-center justify-between gap-2 py-2"><dt className="text-muted">{e.label}</dt><dd className="flex items-center gap-2"><span className="break-all font-medium tabular-nums text-fg">{e.value}</span><span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${SENS[e.sensitivity].cls}`}>{SENS[e.sensitivity].label}</span></dd></div>
            ))}
          </dl>
        </Section>
      ))}
      {!r.entries.length && r.format !== "unknown" ? <p className="text-sm text-muted">No readable metadata fields.</p> : null}
      {r.segments.length ? (
        <Section title="What is embedded in the file" defaultOpen={false}>
          <ul className="space-y-1.5 text-sm">{r.segments.map((s, i) => <li key={i} className="flex flex-wrap justify-between gap-2"><span className={s.sensitive ? "font-medium text-fg" : "text-muted"}>{s.name}{s.note ? <span className="font-normal text-muted"> — {s.note}</span> : null}</span><span className="tabular-nums text-muted">{formatBytes(s.bytes)}</span></li>)}</ul>
        </Section>
      ) : null}
    </div>
  );
}

function Cleaner({ items, setItems }: { items: Item[]; setItems: (f: (prev: Item[]) => Item[]) => void }) {
  const [scope, setScope] = useState<"all" | "location">("all");
  const [keepIcc, setKeepIcc] = useState(true);
  const [keepOrientation, setKeepOrientation] = useState(true);
  const [keepDensity, setKeepDensity] = useState(true);
  const [busy, setBusy] = useState(false);
  const preview = useMemo(() => items.map((it) => (it.error ? null : stripMetadataBytes(it.bytes, { scope, keepIcc, keepOrientation, keepDensity }))), [items, scope, keepIcc, keepOrientation, keepDensity]);

  const clean = async (only?: string) => {
    setBusy(true);
    const next: Item[] = [];
    for (const it of items) {
      if (only && it.id !== only) { next.push(it); continue; }
      if (it.error) { next.push(it); continue; }
      const res = stripMetadataBytes(it.bytes, { scope, keepIcc, keepOrientation, keepDensity });
      if (res.supported) {
        const v = verifyCleaned(res.bytes, scope);
        next.push({ ...it, out: { blob: new Blob([res.bytes as BlobPart], { type: it.file.type || `image/${it.report.format}` }), removed: res.removed, clean: v.clean, remaining: v.remaining } });
      } else next.push({ ...it, out: undefined, error: res.reason });
    }
    setItems(() => next); setBusy(false);
  };
  const reencode = async (it: Item) => {
    setBusy(true);
    try {
      const src = await loadSource(it.file); const r = await encodeCanvas(fullCanvas(src), { format: "png" }, src); releaseSource(src);
      setItems((prev) => prev.map((x) => (x.id === it.id ? { ...x, error: undefined, out: { blob: r.blob, removed: ["All metadata (image re-encoded as PNG — pixels are preserved exactly)"], clean: true, remaining: [], note: "Re-encoded as PNG. Not byte-identical to the original file, but pixel-identical." } } : x)));
    } catch (e) { setItems((prev) => prev.map((x) => (x.id === it.id ? { ...x, error: errorMessage(e, "Re-encoding failed.") } : x))); }
    setBusy(false);
  };
  const downloadAll = async () => {
    const used = new Set<string>(); const entries: { name: string; data: Uint8Array }[] = [];
    for (const it of items) if (it.out) { const ext = it.out.blob.type === "image/png" ? "png" : it.file.name.split(".").pop() || "img"; entries.push({ name: safeZipName(outputName(it.file.name, "clean", ext), used), data: new Uint8Array(await it.out.blob.arrayBuffer()) }); }
    if (entries.length) saveBlob(buildZip(entries), "cleaned-images.zip");
  };
  const total = items.length, done = items.filter((i) => i.out).length;

  return (
    <div className="space-y-4">
      <Section title="What to remove">
        <Seg label="Scope" value={scope} onChange={setScope} options={[{ value: "all", label: "Remove all metadata" }, { value: "location", label: "Remove GPS location only" }]} hint={scope === "all" ? "EXIF (camera, time, GPS, thumbnail), XMP, IPTC, comments, and anything appended after the image." : "Everything else stays — useful when you want to keep camera settings but not where you were."} />
        {scope === "all" ? (<><Toggle label="Keep orientation flag" checked={keepOrientation} onChange={setKeepOrientation} hint="Keeps the photo upright in viewers. It is the only EXIF field kept." /><Toggle label="Keep colour profile (ICC)" checked={keepIcc} onChange={setKeepIcc} hint="Keeps colours accurate. It contains no personal data." /><Toggle label="Keep DPI / density" checked={keepDensity} onChange={setKeepDensity} /></>) : null}
        <Notice>The file is rewritten without re-compressing, so image quality is unchanged. After cleaning, the result is read back to verify what was removed.</Notice>
      </Section>
      <div className="flex flex-wrap gap-2"><Btn variant="default" onClick={() => void clean()} disabled={busy || !total}>{busy ? "Cleaning…" : total > 1 ? `Clean ${total} files` : "Clean file"}</Btn>{done > 1 ? <Btn onClick={() => void downloadAll()}>Download all (ZIP)</Btn> : null}</div>
      <ul className="space-y-2">
        {items.map((it, idx) => {
          const pv = preview[idx];
          return (
            <li key={it.id} className="space-y-2 rounded-lg bg-surface p-3 shadow-[var(--shadow-border)]">
              <div className="flex flex-wrap items-center justify-between gap-2"><span className="min-w-0 truncate text-sm font-medium text-fg">{it.file.name}</span><span className="text-xs tabular-nums text-muted">{formatBytes(it.file.size)}{it.out ? ` → ${formatBytes(it.out.blob.size)}` : ""}</span></div>
              {it.error ? <Notice tone="warn">{it.error}</Notice> : null}
              {!it.out && !it.error && pv ? <p className="text-xs text-muted">Will remove: {pv.removed.length ? pv.removed.join(" · ") : "nothing — no removable metadata found"}</p> : null}
              {it.out ? <Notice tone={it.out.clean ? "ok" : "danger"}>{it.out.clean ? `Cleaned and verified. Removed: ${it.out.removed.join(" · ") || "nothing (the file had no removable metadata)"}.` : `Not fully clean — still present: ${it.out.remaining.join(", ")}.`}{it.out.note ? ` ${it.out.note}` : ""}</Notice> : null}
              <div className="flex flex-wrap gap-2">
                {it.out ? <Btn variant="default" onClick={() => saveBlob(it.out!.blob, outputName(it.file.name, "clean", it.out!.blob.type === "image/png" && it.report.format !== "png" ? "png" : it.file.name.split(".").pop() || "img"))}>Download</Btn> : null}
                {it.error && !it.out && it.report.format !== "jpeg" && it.report.format !== "png" && it.report.format !== "webp" ? <Btn onClick={() => void reencode(it)} disabled={busy}>Re-encode as PNG to remove metadata</Btn> : null}
                {items.length > 1 ? <Btn variant="ghost" onClick={() => setItems((p) => p.filter((x) => x.id !== it.id))}>Remove</Btn> : null}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export function MetadataStudio({ op }: { op: string; toolId: string }) {
  const key = op.toLowerCase();
  const cleaner = key === "exif-strip" || key === "image-image-metadata-cleaner";
  const [items, setItemsState] = useState<Item[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState(0);
  const setItems = (f: (prev: Item[]) => Item[]) => setItemsState((prev) => f(prev));
  const onFiles = async (files: File[]) => {
    setError(null);
    try { const next = await addFiles(cleaner ? files : files.slice(0, 1)); setItemsState((p) => (cleaner ? [...p, ...next] : next)); setSelected(0); }
    catch (e) { setError(e instanceof ImageToolError ? e.message : errorMessage(e, "Those files couldn't be read.")); }
  };
  if (!items.length) return <div className="space-y-3"><FileDropzone accept="image/*,.heic,.heif,.avif" multiple={cleaner} label={cleaner ? "Drop images to clean (several allowed)" : "Drop an image to inspect"} hint="Metadata is read locally; nothing is uploaded." onFiles={(f) => void onFiles(f)} /><ErrorBanner message={error} /></div>;
  const cur = items[Math.min(selected, items.length - 1)];
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2"><p className="min-w-0 truncate text-sm text-fg"><span className="font-medium">{cur.file.name}</span></p><Btn onClick={() => { setItemsState([]); setError(null); }}>Choose other files</Btn></div>
      {cleaner ? <Cleaner items={items} setItems={setItems} /> : <Inspector item={cur} initialGroup={key === "exif-view" ? "all" : "all"} />}
      {!cleaner ? <Notice>To remove this metadata without re-compressing the image, use the Metadata Cleaner or EXIF Remover tool.</Notice> : null}
      <ErrorBanner message={error} />
      {void baseName}
    </div>
  );
}
