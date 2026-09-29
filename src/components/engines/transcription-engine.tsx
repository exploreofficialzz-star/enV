import { useState } from "react";
import { Button } from "@/components/ui/button";
import { ErrorBanner } from "@/components/tools/error-banner";
import { downloadBlob } from "@/lib/utils";

type Props = { mode: "audio" | "video"; format: "txt" | "srt" | "vtt" };

function endpoint() {
  const value = typeof import.meta !== "undefined" && typeof import.meta.env?.VITE_TRANSCRIBE_URL === "string"
    ? String(import.meta.env.VITE_TRANSCRIBE_URL).trim()
    : "";
  return value.replace(/\/$/, "");
}

export function TranscriptionEngine({ mode, format }: Props) {
  const [file, setFile] = useState<File | null>(null);
  const [language, setLanguage] = useState("auto");
  const [translate, setTranslate] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [output, setOutput] = useState<string>("");
  const [downloadUrl, setDownloadUrl] = useState<Blob | null>(null);

  const run = async () => {
    setError(null); setOutput(""); setDownloadUrl(null);
    if (!file) { setError(`Choose an ${mode} file first.`); return; }
    const url = endpoint();
    if (!url) { setError("The enV transcription service is not configured. Set VITE_TRANSCRIBE_URL to a running transcription endpoint."); return; }
    setBusy(true);
    try {
      const form = new FormData();
      form.append("file", file, file.name);
      form.append("format", format);
      form.append("language", language.trim() || "auto");
      form.append("translate", String(translate));
      form.append("outputName", `${file.name.replace(/\.[^.]+$/, "")}.${format}`);
      const response = await fetch(`${url}/transcribe`, { method: "POST", body: form });
      if (!response.ok) {
        let message = `Transcription service returned HTTP ${response.status}.`;
        try { const body = await response.json() as { error?: string }; if (body.error) message = body.error; } catch { /* non-JSON error */ }
        throw new Error(message);
      }
      const blob = await response.blob();
      const text = await blob.text();
      if (!text.trim()) throw new Error("The transcription service returned an empty result.");
      setOutput(text);
      setDownloadUrl(blob);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Transcription failed.");
    } finally { setBusy(false); }
  };

  const reset = () => { setFile(null); setLanguage("auto"); setTranslate(false); setBusy(false); setError(null); setOutput(""); setDownloadUrl(null); };

  return <div className="space-y-5">
    <p className="text-sm text-muted-foreground">Real speech transcription through the configured enV transcription service. The browser sends the selected file only to that configured endpoint.</p>
    <input className="block w-full rounded-lg border border-border bg-surface p-2 text-sm" type="file" accept={mode === "audio" ? "audio/*,.mp3,.wav,.m4a,.ogg,.flac,.webm" : "video/*,.mp4,.webm,.mov,.m4v,.ogv"} onChange={e => setFile(e.target.files?.[0] ?? null)} />
    <div className="grid gap-3 sm:grid-cols-2">
      <label className="block text-sm">Language
        <input className="mt-1 h-10 w-full rounded-md border border-border bg-surface px-3" value={language} onChange={e => setLanguage(e.target.value)} placeholder="auto or en" />
      </label>
      <label className="flex items-center gap-2 text-sm sm:pt-7"><input type="checkbox" checked={translate} onChange={e => setTranslate(e.target.checked)} /> Translate to English</label>
    </div>
    <ErrorBanner message={error} />
    <div className="flex flex-wrap gap-2">
      <Button onClick={run} disabled={busy}>{busy ? "Transcribing…" : `Transcribe ${mode}`}</Button>
      {downloadUrl && <Button variant="outline" onClick={() => downloadBlob(downloadUrl, `${file?.name.replace(/\.[^.]+$/, "") || "transcript"}.${format}`)}>Download .{format}</Button>}
      <Button variant="ghost" onClick={reset}>Reset</Button>
    </div>
    {output && <pre className="max-h-[32rem] overflow-auto whitespace-pre-wrap rounded-xl border bg-muted/20 p-4 text-sm">{output}</pre>}
  </div>;
}
