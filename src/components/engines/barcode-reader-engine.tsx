import { useEffect, useRef, useState } from "react";
import { BrowserCodeReader, BrowserMultiFormatReader } from "@zxing/browser";
import { BarcodeFormat } from "@zxing/library";
import { Button } from "@/components/ui/button";
import { downloadText } from "@/lib/utils";

type ScanRecord = {
  id: string;
  value: string;
  format: string;
  scannedAt: string;
};

function scanHistoryCsv(records: ScanRecord[]): string {
  const cell = (value: string) => `"${value.replaceAll('"', '""')}"`;
  const rows = records.map((record) => [
    cell(record.scannedAt),
    cell(record.format),
    cell(record.value),
  ].join(","));
  return ["scanned_at,format,payload", ...rows].join("\r\n") + "\r\n";
}

const FORMAT_LABELS: Partial<Record<BarcodeFormat, string>> = {
  [BarcodeFormat.AZTEC]: "Aztec",
  [BarcodeFormat.CODABAR]: "Codabar",
  [BarcodeFormat.CODE_39]: "Code 39",
  [BarcodeFormat.CODE_93]: "Code 93",
  [BarcodeFormat.CODE_128]: "Code 128",
  [BarcodeFormat.DATA_MATRIX]: "Data Matrix",
  [BarcodeFormat.EAN_8]: "EAN-8",
  [BarcodeFormat.EAN_13]: "EAN-13",
  [BarcodeFormat.ITF]: "ITF",
  [BarcodeFormat.MAXICODE]: "MaxiCode",
  [BarcodeFormat.PDF_417]: "PDF417",
  [BarcodeFormat.QR_CODE]: "QR Code",
  [BarcodeFormat.RSS_14]: "RSS-14",
  [BarcodeFormat.RSS_EXPANDED]: "RSS Expanded",
  [BarcodeFormat.UPC_A]: "UPC-A",
  [BarcodeFormat.UPC_E]: "UPC-E",
  [BarcodeFormat.UPC_EAN_EXTENSION]: "UPC/EAN extension",
};

function safeHttpUrl(value: string): string | null {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}

function payloadLabel(value: string): string {
  if (/^WIFI:/i.test(value)) return "Wi-Fi network";
  if (/^BEGIN:VCARD/i.test(value) || /^MECARD:/i.test(value)) return "Contact card";
  if (/^BEGIN:VEVENT/i.test(value)) return "Calendar event";
  if (/^mailto:/i.test(value)) return "Email";
  if (/^(tel:|sms:)/i.test(value)) return "Phone or message";
  if (/^geo:/i.test(value)) return "Location";
  if (safeHttpUrl(value)) return "Web link";
  return "Text or structured data";
}

export function BarcodeReaderEngine() {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const controlsRef = useRef<{ stop: () => void } | null>(null);
  const scanGeneration = useRef(0);
  const recentScansRef = useRef<Map<string, number>>(new Map());
  const [cameraActive, setCameraActive] = useState(false);
  const [cameraStarting, setCameraStarting] = useState(false);
  const [cameras, setCameras] = useState<MediaDeviceInfo[]>([]);
  const [selectedCamera, setSelectedCamera] = useState("");
  const [results, setResults] = useState<ScanRecord[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [copyState, setCopyState] = useState<string | null>(null);
  const [imageBusy, setImageBusy] = useState(false);
  const [manualPayload, setManualPayload] = useState("");
  const [historyLoaded, setHistoryLoaded] = useState(false);

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem("env.qrBarcodeReader.history.v1");
      if (stored) {
        const parsed: unknown = JSON.parse(stored);
        if (Array.isArray(parsed)) {
          const valid = parsed.filter((entry): entry is ScanRecord => {
            if (entry === null || typeof entry !== "object") return false;
            const record = entry as Record<string, unknown>;
            return typeof record.id === "string" &&
              typeof record.value === "string" &&
              typeof record.format === "string" &&
              typeof record.scannedAt === "string" &&
              Number.isFinite(Date.parse(record.scannedAt));
          });
          setResults(valid.slice(0, 50));
          recentScansRef.current = new Map(valid.map((record) => [
            `${record.format}\u0000${record.value}`,
            Date.parse(record.scannedAt),
          ]));
        }
      }
    } catch {
      // A blocked or corrupt local history must never prevent scanning.
    } finally {
      setHistoryLoaded(true);
    }
  }, []);

  useEffect(() => {
    if (!historyLoaded) return;
    try {
      window.localStorage.setItem("env.qrBarcodeReader.history.v1", JSON.stringify(results.slice(0, 50)));
    } catch {
      // Storage quotas / private browsing restrictions do not block scan results.
    }
  }, [historyLoaded, results]);

  function addResult(value: string, format: BarcodeFormat | string) {
    if (!value) return;
    const formatLabel = FORMAT_LABELS[format as BarcodeFormat] ?? String(format).replaceAll("_", " ");
    const signature = `${formatLabel}\u0000${value}`;
    const now = Date.now();
    const previousScanAt = recentScansRef.current.get(signature) ?? 0;
    if (now - previousScanAt < 1800) return;
    recentScansRef.current.set(signature, now);
    if (recentScansRef.current.size > 200) {
      for (const [key, scannedAt] of recentScansRef.current) {
        if (now - scannedAt > 10_000) recentScansRef.current.delete(key);
      }
    }
    setResults((current) => [
      { id: `${now}-${Math.random().toString(36).slice(2, 8)}`, value, format: formatLabel, scannedAt: new Date(now).toISOString() },
      ...current,
    ].slice(0, 50));
    setNotice(`${formatLabel} detected.`);
    setError(null);
  }

  function stopCamera() {
    scanGeneration.current += 1;
    controlsRef.current?.stop();
    controlsRef.current = null;
    setCameraActive(false);
    setCameraStarting(false);
  }

  async function startCamera(deviceId = selectedCamera) {
    if (!navigator.mediaDevices?.getUserMedia || !videoRef.current) {
      setError("Camera scanning is unavailable in this browser or page context. Use image upload instead.");
      return;
    }

    stopCamera();
    const generation = ++scanGeneration.current;
    setCameraStarting(true);
    setError(null);
    setNotice("Requesting camera access…");

    try {
      const reader = new BrowserMultiFormatReader();
      const controls = await reader.decodeFromVideoDevice(
        deviceId || undefined,
        videoRef.current,
        (result) => {
          if (generation !== scanGeneration.current || !result) return;
          addResult(result.getText(), result.getBarcodeFormat());
        },
      );

      if (generation !== scanGeneration.current) {
        controls.stop();
        return;
      }

      controlsRef.current = controls;
      setCameraActive(true);
      setNotice("Camera is ready. Hold a QR code or barcode inside the camera view.");
      try {
        const available = await BrowserCodeReader.listVideoInputDevices();
        setCameras(available);
        if (!deviceId && available.length) {
          const preferred = available.find((camera) => /back|rear|environment/i.test(camera.label));
          if (preferred) setSelectedCamera(preferred.deviceId);
        }
      } catch {
        // Camera enumeration is optional; scanning can continue with the default device.
      }
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "Camera access failed.";
      setError(/permission|denied|notallowed/i.test(message)
        ? "Camera permission was denied. Allow camera access in your browser settings, or upload a QR/barcode image."
        : `Could not start the camera. ${message}`);
      setNotice(null);
    } finally {
      if (generation === scanGeneration.current) setCameraStarting(false);
    }
  }

  async function scanImage(file: File) {
    stopCamera();
    setError(null);
    setNotice(null);
    setImageBusy(true);
    if (!file.type.startsWith("image/")) {
      setError("Choose an image file containing a QR code or barcode.");
      setImageBusy(false);
      return;
    }
    if (file.size > 15 * 1024 * 1024) {
      setError("This image is larger than 15 MB. Resize it and try again.");
      setImageBusy(false);
      return;
    }

    const objectUrl = URL.createObjectURL(file);
    try {
      const image = new Image();
      image.src = objectUrl;
      await image.decode();
      const reader = new BrowserMultiFormatReader();
      const result = await reader.decodeFromImageElement(image);
      addResult(result.getText(), result.getBarcodeFormat());
      setNotice(`Decoded ${file.name} locally.`);
    } catch {
      setError("No supported QR code or barcode was detected. Try a sharper, well-lit image with the full code visible.");
    } finally {
      URL.revokeObjectURL(objectUrl);
      setImageBusy(false);
    }
  }

  async function copyValue(value: string, id: string) {
    try {
      await navigator.clipboard.writeText(value);
      setCopyState(id);
      window.setTimeout(() => setCopyState((current) => current === id ? null : current), 1600);
    } catch {
      setError("Clipboard access is unavailable. Select the decoded text and copy it manually.");
    }
  }

  useEffect(() => () => {
    scanGeneration.current += 1;
    controlsRef.current?.stop();
    controlsRef.current = null;
  }, []);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-base font-semibold">QR & barcode reader</h2>
          <p className="mt-1 text-sm text-muted">Scan from your camera or upload an image. Decoding happens on this device.</p>
        </div>
        <span className="rounded-full bg-surface-2 px-3 py-1 text-xs font-medium text-muted">QR · 1D · 2D</span>
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.25fr)_minmax(260px,0.75fr)]">
        <section className="min-w-0 space-y-3" aria-labelledby="reader-camera-heading">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 id="reader-camera-heading" className="text-sm font-semibold">Camera scanner</h3>
            <div className="flex flex-wrap gap-2">
              {cameras.length > 1 ? (
                <select
                  aria-label="Select camera"
                  value={selectedCamera}
                  onChange={(event) => {
                    const nextDevice = event.target.value;
                    setSelectedCamera(nextDevice);
                    if (cameraActive) void startCamera(nextDevice);
                  }}
                  className="h-9 max-w-48 rounded-md border border-border bg-surface px-2 text-xs text-fg"
                >
                  {cameras.map((camera, index) => (
                    <option key={camera.deviceId} value={camera.deviceId}>{camera.label || `Camera ${index + 1}`}</option>
                  ))}
                </select>
              ) : null}
              {cameraActive ? (
                <Button type="button" variant="outline" size="sm" onClick={stopCamera}>Stop camera</Button>
              ) : (
                <Button type="button" size="sm" disabled={cameraStarting} onClick={() => void startCamera()}>
                  {cameraStarting ? "Starting…" : "Start camera"}
                </Button>
              )}
            </div>
          </div>

          <div className="relative overflow-hidden rounded-xl border border-border bg-black">
            <video
              ref={videoRef}
              className={`aspect-video w-full object-cover ${cameraActive ? "block" : "hidden"}`}
              muted
              playsInline
              autoPlay
              aria-label="Live QR and barcode camera preview"
            />
            {!cameraActive ? (
              <div className="flex aspect-video flex-col items-center justify-center gap-3 px-5 text-center text-white">
                <span className="flex size-14 items-center justify-center rounded-2xl bg-white/10 text-3xl" aria-hidden="true">▦</span>
                <p className="text-sm font-medium">{cameraStarting ? "Connecting to camera…" : "Camera is off"}</p>
                <p className="max-w-sm text-xs leading-5 text-white/70">Start the camera to scan codes live. Camera access requires HTTPS (or localhost) and your permission.</p>
              </div>
            ) : (
              <div className="pointer-events-none absolute inset-x-0 top-1/2 mx-auto h-32 max-w-[78%] -translate-y-1/2 rounded-xl border-2 border-white/80 shadow-[0_0_0_999px_rgba(0,0,0,0.18)]" aria-hidden="true" />
            )}
          </div>
          {cameras.length > 1 ? <p className="text-xs text-muted">Choose another available camera to switch between front and rear lenses.</p> : null}
        </section>

        <section className="space-y-3" aria-labelledby="reader-upload-heading">
          <h3 id="reader-upload-heading" className="text-sm font-semibold">Read an image</h3>
          <label className="flex min-h-40 cursor-pointer flex-col items-center justify-center rounded-xl border border-dashed border-border bg-surface-2 p-5 text-center transition-colors hover:border-accent">
            <span className="mb-3 flex size-11 items-center justify-center rounded-xl bg-surface text-lg" aria-hidden="true">↥</span>
            <span className="text-sm font-semibold">{imageBusy ? "Reading image…" : "Choose QR or barcode image"}</span>
            <span className="mt-1 text-xs text-muted">PNG, JPG, WebP or another browser-supported image · 15 MB max</span>
            <input
              className="sr-only"
              type="file"
              accept="image/*"
              aria-label="Upload QR or barcode image"
              disabled={imageBusy}
              onChange={(event) => {
                const file = event.currentTarget.files?.[0];
                event.currentTarget.value = "";
                if (file) void scanImage(file);
              }}
            />
          </label>
          <div className="rounded-lg bg-surface-2 p-3 text-xs leading-5 text-muted">
            <strong className="text-fg">Supported examples</strong>
            <p className="mt-1">QR Code, Data Matrix, PDF417, Aztec, EAN-8/13, UPC-A/E, Code 39/93/128, Codabar and ITF.</p>
          </div>
        </section>
      </div>

      {error ? <p className="rounded-lg border border-danger/30 bg-danger/5 p-3 text-sm text-danger" role="alert">{error}</p> : null}
      {notice ? <p className="text-sm text-muted" role="status" aria-live="polite">{notice}</p> : null}

      <section className="space-y-2" aria-labelledby="reader-manual-heading">
        <div>
          <h3 id="reader-manual-heading" className="text-sm font-semibold">Inspect a payload</h3>
          <p className="mt-0.5 text-xs text-muted">Paste text from a QR code to identify its payload type and length without scanning an image.</p>
        </div>
        <textarea
          aria-label="Paste a QR payload to inspect"
          value={manualPayload}
          onChange={(event) => setManualPayload(event.target.value)}
          rows={3}
          placeholder="WIFI:T:WPA;S:Network;P:password;; or https://example.com"
          className="w-full resize-y rounded-lg border border-border bg-surface px-3 py-2 text-sm text-fg placeholder:text-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
        />
        {manualPayload.trim() ? (
          <p className="text-xs text-muted" role="status">{payloadLabel(manualPayload.trim())} · {manualPayload.trim().length} characters</p>
        ) : null}
      </section>

      <section className="space-y-3" aria-labelledby="reader-results-heading">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 id="reader-results-heading" className="text-sm font-semibold">Scan results</h3>
            <p className="mt-0.5 text-xs text-muted">{results.length} saved result{results.length === 1 ? "" : "s"} on this device</p>
          </div>
          {results.length ? (
            <div className="flex flex-wrap gap-2">
              <Button type="button" size="sm" variant="outline" onClick={() => downloadText(scanHistoryCsv(results), "env-scan-history.csv", "text/csv")}>
                Export CSV
              </Button>
              <Button type="button" size="sm" variant="ghost" onClick={() => { setResults([]); recentScansRef.current.clear(); setNotice("Scan history cleared."); }}>
                Clear results
              </Button>
            </div>
          ) : null}
        </div>

        {results.length ? (
          <div className="space-y-2">
            {results.map((item) => {
              const url = safeHttpUrl(item.value);
              return (
                <article key={item.id} className="rounded-xl border border-border bg-surface p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded-md bg-surface-2 px-2 py-1 text-xs font-semibold">{item.format}</span>
                      <span className="text-xs text-muted">{payloadLabel(item.value)}</span>
                    </div>
                    <time className="text-[11px] text-muted" dateTime={item.scannedAt}>{new Date(item.scannedAt).toLocaleTimeString()}</time>
                  </div>
                  <pre className="mt-3 max-h-40 overflow-auto whitespace-pre-wrap break-all rounded-lg bg-surface-2 p-3 text-xs leading-5 text-fg">{item.value}</pre>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Button type="button" size="sm" variant="outline" onClick={() => void copyValue(item.value, item.id)}>
                      {copyState === item.id ? "Copied" : "Copy result"}
                    </Button>
                    {url ? (
                      <a href={url} target="_blank" rel="noopener noreferrer" className="inline-flex h-9 items-center gap-2 rounded-md border border-border px-3 text-xs font-medium hover:bg-surface-2">
                        Open link <span aria-hidden="true">↗</span>
                      </a>
                    ) : null}
                  </div>
                </article>
              );
            })}
          </div>
        ) : (
          <div className="rounded-xl border border-dashed border-border p-6 text-center">
            <p className="text-sm font-medium">No codes scanned yet</p>
            <p className="mt-1 text-xs text-muted">A decoded value, barcode type and scan time will appear here.</p>
          </div>
        )}
      </section>
    </div>
  );
}
