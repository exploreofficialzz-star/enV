import { useEffect, useRef, useState } from "react";
import { Download, LoaderCircle, Play } from "lucide-react";
import { renderSongSection } from "@/lib/media/song-audio-export";
import { downloadBlob } from "@/lib/utils";
import { SongCopyButton } from "./song-copy-button";

type Section = { start_seconds: number; end_seconds: number; label: string };
const time = (value: number) =>
  `${Math.floor(value / 60)}:${String(Math.floor(value % 60)).padStart(2, "0")}`;

export function SongPlayback({ file, sections }: { file: File; sections: Section[] }) {
  const player = useRef<HTMLAudioElement>(null);
  const sectionEnd = useRef<number | null>(null);
  const controller = useRef<AbortController | null>(null);
  const [url, setUrl] = useState("");
  const [exporting, setExporting] = useState<number | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    const next = URL.createObjectURL(file);
    setUrl(next);
    return () => {
      URL.revokeObjectURL(next);
      controller.current?.abort();
    };
  }, [file]);

  async function exportSection(section: Section, index: number) {
    if (exporting !== null) return;
    const abort = new AbortController();
    controller.current = abort;
    setExporting(index);
    setError("");
    try {
      const bytes = await renderSongSection(
        file,
        section.start_seconds,
        section.end_seconds,
        abort.signal,
      );
      if (!abort.signal.aborted)
        downloadBlob(
          new Blob([bytes.slice().buffer], { type: "audio/wav" }),
          `${file.name.replace(/\.[^.]+$/, "")}-section-${index + 1}.wav`,
        );
    } catch (cause) {
      if (!abort.signal.aborted)
        setError(cause instanceof Error ? cause.message : "Section export failed.");
    } finally {
      if (!abort.signal.aborted) setExporting(null);
    }
  }
  return (
    <section
      className="space-y-3 rounded-xl border border-border p-3 sm:p-4"
      aria-label="Track playback and sections"
    >
      <audio
        ref={player}
        src={url || undefined}
        controls
        preload="metadata"
        className="h-10 min-w-0 w-full max-w-full"
        aria-label={`Play ${file.name}`}
        onTimeUpdate={() => {
          if (
            player.current &&
            sectionEnd.current !== null &&
            player.current.currentTime >= sectionEnd.current
          ) {
            player.current.pause();
            sectionEnd.current = null;
          }
        }}
        onSeeked={() => {
          if (
            player.current &&
            sectionEnd.current !== null &&
            player.current.currentTime > sectionEnd.current
          )
            sectionEnd.current = null;
        }}
      />
      {sections.length > 0 && (
        <details>
          <summary className="cursor-pointer text-sm font-medium">
            Sections <span className="text-muted">· {sections.length}</span>
          </summary>
          <p className="mt-2 text-xs text-muted">Signal changes · estimated boundaries</p>
          <div className="mt-2 max-h-64 space-y-1 overflow-y-auto">
            {sections.map((section, index) => (
              <div
                key={section.start_seconds}
                className="flex items-center gap-2 rounded-lg bg-surface-2 px-3 py-2"
              >
                  <SongCopyButton label={`${section.label} time range`} value={`${time(section.start_seconds)}–${time(section.end_seconds)}`} />
                  <button
                  type="button"
                  className="flex min-w-0 flex-1 items-center gap-2 text-left text-xs"
                  onClick={() => {
                    if (player.current) {
                      sectionEnd.current = section.end_seconds;
                      player.current.currentTime = section.start_seconds;
                      void player.current
                        .play()
                        .catch(() => setError("Playback is unavailable for this format."));
                    }
                  }}
                  aria-label={`Play ${section.label}`}
                >
                  <Play size={13} />
                  <span className="truncate">{section.label}</span>
                  <span className="ml-auto shrink-0 text-muted">
                    {time(section.start_seconds)}–{time(section.end_seconds)}
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => void exportSection(section, index)}
                  disabled={exporting !== null}
                  aria-label={`Export ${section.label} as WAV`}
                  className="grid size-8 place-items-center rounded border border-border disabled:opacity-40"
                >
                  {exporting === index ? (
                    <LoaderCircle size={14} className="animate-spin" />
                  ) : (
                    <Download size={14} />
                  )}
                </button>
              </div>
            ))}
          </div>
        </details>
      )}
      {error && (
        <p role="alert" className="text-xs text-danger">
          {error}
        </p>
      )}
    </section>
  );
}
