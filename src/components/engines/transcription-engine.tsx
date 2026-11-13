import { useState } from "react";
import { Button } from "@/components/ui/button";
import { ErrorBanner } from "@/components/tools/error-banner";
import { FileDropzone } from "@/components/tools/file-dropzone";
import { downloadBlob } from "@/lib/utils";
import { apiUrl } from "@/lib/api/base";

type Props = { mode: "audio" | "video"; format: "txt" | "srt" | "vtt" };

function endpoint() {
  const value = typeof import.meta !== "undefined" && typeof import.meta.env?.VITE_TRANSCRIBE_URL === "string"
    ? String(import.meta.env.VITE_TRANSCRIBE_URL).trim()
    : "";
  return value.replace(/\/$/, "") || apiUrl("/api/backend");
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
      if (url === apiUrl("/api/backend") && file.size > 4 * 1024 * 1024) {
        throw new Error("The Render API gateway accepts transcription files up to 4 MB. Use a smaller file or configure a larger Render upload limit.");
      }
      const form = new FormData();
      form.append("file", file, file.name);
      form.append("format", format);
      form.append("language", language.trim() || "auto");
      form.append("translate", String(translate));
      form.append("outputName", `${file.name.replace(/\.[^.]+$/, "")}.${format}`);
      const response = await fetch(`${url}/transcribe`, { method: "POST", body: form, credentials: "include" });
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

  const accept = mode === "audio" ? "audio/*,.mp3,.wav,.m4a,.ogg,.flac,.webm" : "video/*,.mp4,.webm,.mov,.m4v,.ogv";
  const reset = () => { setFile(null); setLanguage("auto"); setTranslate(false); setBusy(false); setError(null); setOutput(""); setDownloadUrl(null); };

  return <div className="space-y-5">
    <FileDropzone accept={accept} disabled={busy} label={`Drop ${mode} or browse`} onFiles={(next) => { setFile(next[0] ?? null); setError(null); setOutput(""); setDownloadUrl(null); }} />
    {file ? <div className="flex items-center justify-between gap-3 rounded-xl border border-border bg-surface-2 px-3 py-2 text-sm"><span className="min-w-0 truncate font-medium">{file.name}</span><span className="shrink-0 text-xs text-muted">{(file.size / 1024 / 1024).toFixed(2)} MB</span></div> : null}
    <p className="text-xs text-muted-foreground">Transcription sends the selected file to the configured enV transcription service.</p>
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
