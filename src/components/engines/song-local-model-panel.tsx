import { useEffect, useRef, useState } from "react";
import { Download, LoaderCircle } from "lucide-react";
import {
  localCompanionUrl,
  localHealthSchema,
  localJobSchema,
  localRequest,
  type LocalConnection,
  type LocalSongResult,
} from "@/lib/media/local-song-client";
import type { MusicDatasetAnnotations } from "@/lib/engines/music-dataset-analysis";
import { downloadBlob } from "@/lib/utils";

export function SongLocalModelPanel({
  file,
  annotations,
  result,
  onResult,
  onApply,
  disabled,
}: {
  file: File;
  annotations?: MusicDatasetAnnotations;
  result?: LocalSongResult;
  onResult: (result: LocalSongResult) => void;
  onApply: (tags: Record<string, string[]>) => void;
  disabled: boolean;
}) {
  const [url, setUrl] = useState("http://127.0.0.1:8765");
  const [token, setToken] = useState("");
  const [connection, setConnection] = useState<LocalConnection | null>(null);
  const [health, setHealth] = useState<ReturnType<typeof localHealthSchema.parse> | null>(null);
  const [options, setOptions] = useState({
    tagging: true,
    llm: true,
    transcription: false,
    pieces: false,
    stems: false,
  });
  const [busy, setBusy] = useState(false);
  const [stage, setStage] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [jobId, setJobId] = useState<string | null>(null);
  const [trainingConsent, setTrainingConsent] = useState(false);
  const controller = useRef<AbortController | null>(null);
  const activeJob = useRef<{ connection: LocalConnection; id: string } | null>(null);
  const pollTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      controller.current?.abort();
      if (pollTimer.current) clearTimeout(pollTimer.current);
      const job = activeJob.current;
      if (job)
        void localRequest(job.connection, `/v1/jobs/${job.id}/cancel`, { method: "POST" }).catch(
          () => undefined,
        );
    },
    [],
  );

  async function connect() {
    setBusy(true);
    setError("");
    setNotice("");
    setConnection(null);
    setHealth(null);
    try {
      const next = { url: localCompanionUrl(url), token };
      if (token.length < 24) throw new Error("Enter the token from your local service setup.");
      const status = localHealthSchema.parse(await (await localRequest(next, "/v1/health")).json());
      if (!status.ffmpeg) throw new Error("Install FFmpeg and FFprobe on the local service.");
      setConnection(next);
      setHealth(status);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Local service is unavailable.");
    } finally {
      setBusy(false);
    }
  }

  async function run() {
    if (!connection || busy) return;
    const abort = new AbortController();
    controller.current = abort;
    setBusy(true);
    setError("");
    setNotice("");
    setStage("Sending to local service…");
    try {
      const form = new FormData();
      form.append("audio", file);
      form.append("options", JSON.stringify(options));
      const created = await (
        await localRequest(connection, "/v1/jobs", {
          method: "POST",
          body: form,
          signal: abort.signal,
        })
      ).json();
      if (!/^[a-f0-9]{32}$/.test(created.id))
        throw new Error("Local service returned an invalid job.");
      setJobId(created.id);
      activeJob.current = { connection, id: created.id };
      while (!abort.signal.aborted) {
        const job = localJobSchema.parse(
          await (
            await localRequest(connection, `/v1/jobs/${created.id}`, { signal: abort.signal })
          ).json(),
        );
        setStage(`${job.stage} · ${job.progress}%`);
        if (["completed", "partial"].includes(job.state) && job.result) {
          onResult(job.result);
          setNotice("Suggestions ready for review.");
          break;
        }
        if (["failed", "cancelled"].includes(job.state))
          throw new Error(job.error || "Local analysis cancelled.");
        await new Promise<void>((resolve) => {
          const done = () => {
            abort.signal.removeEventListener("abort", onAbort);
            pollTimer.current = null;
            resolve();
          };
          const onAbort = () => {
            if (pollTimer.current) clearTimeout(pollTimer.current);
            done();
          };
          abort.signal.addEventListener("abort", onAbort, { once: true });
          pollTimer.current = setTimeout(done, 1000);
        });
      }
    } catch (cause) {
      if (!abort.signal.aborted)
        setError(cause instanceof Error ? cause.message : "Local analysis failed.");
    } finally {
      const job = activeJob.current;
      if (job)
        void localRequest(job.connection, `/v1/jobs/${job.id}/cancel`, { method: "POST" }).catch(
          () => undefined,
        );
      activeJob.current = null;
      setBusy(false);
      setStage("");
    }
  }

  async function download(name: string) {
    if (!connection || !jobId) return;
    setError("");
    try {
      const response = await localRequest(
        connection,
        `/v1/jobs/${jobId}/artifacts/${name.split("/").map(encodeURIComponent).join("/")}`,
        { signal: AbortSignal.timeout(120_000) },
      );
      downloadBlob(await response.blob(), name.split("/").pop() || "analysis.zip");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Download failed.");
    }
  }

  async function learn(train: boolean) {
    if (!connection) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const payload = train
        ? undefined
        : JSON.stringify({
            job_id: jobId,
            annotations: Object.fromEntries(
              Object.entries(annotations ?? {}).filter(
                ([key]) => !["reviewed", "reviewer", "notes"].includes(key),
              ),
            ),
            reviewer: annotations?.reviewer,
            reviewed: true,
            training_consent: true,
          });
      const response = await localRequest(connection, train ? "/v1/train" : "/v1/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: payload,
        signal: AbortSignal.timeout(60_000),
      });
      const status = await response.json();
      setHealth((current) => (current ? { ...current, learning: status } : current));
      setNotice(
        train
          ? "Local tag head trained. Holdout evaluation is available below."
          : "Reviewed corrections saved locally.",
      );
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Learning failed.");
    } finally {
      setBusy(false);
    }
  }

  async function exportTaggedCopy() {
    if (!connection || !jobId || !annotations?.reviewed) return;
    setBusy(true);
    setError("");
    try {
      const labels = Object.fromEntries(
        Object.entries(annotations).filter(
          ([key]) => !["reviewed", "reviewer", "notes"].includes(key),
        ),
      );
      const response = await localRequest(connection, `/v1/jobs/${jobId}/tagged-copy`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ annotations: labels, reviewed: true }),
        signal: AbortSignal.timeout(120_000),
      });
      const disposition = response.headers.get("Content-Disposition") || "";
      const extension = disposition.match(/\.(mp3|m4a|flac|ogg|opus|wav|mka)/i)?.[1] || "audio";
      downloadBlob(
        await response.blob(),
        `${file.name.replace(/\.[^.]+$/, "")}-reviewed.${extension}`,
      );
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Tagged audio export failed.");
    } finally {
      setBusy(false);
    }
  }

  const suggestions: Record<string, string[]> =
    result?.llm?.selected_tags ??
    Object.fromEntries(
      Object.entries({ ...result?.candidates, ...result?.learned_tags }).map(([field, values]) => [
        field,
        values.slice(0, 1).map((item) => item.label),
      ]),
    );
  return (
    <details className="rounded-xl border border-border p-3 sm:p-4">
      <summary className="cursor-pointer text-sm font-semibold">
        Local AI & stems <span className="font-normal text-muted">· optional</span>
      </summary>
      <div className="mt-3 space-y-3">
        <p className="text-xs text-muted">
          Runs on your computer. Audio is sent only after you select Analyze locally. Files expire
          after one hour; submitted training labels persist.
        </p>
        <details className="text-xs">
          <summary className="cursor-pointer font-medium">Setup</summary>
          <p className="mt-2 text-muted">
            Install the companion in <code>local-song-analyzer/</code>, prepare its models, then run{" "}
            <code>env-song-analyzer serve</code>. Add this site’s origin to{" "}
            <code>SONG_ALLOWED_ORIGINS</code>. Your browser may ask for local network access. See
            the companion README in the repository for commands.
          </p>
        </details>
        <div className="grid gap-2 @min-[620px]/song:grid-cols-[1fr_1fr_auto]">
          <label className="text-xs">
            <span className="mb-1 block text-muted">Local address</span>
            <input
              type="url"
              value={url}
              disabled={busy}
              onChange={(event) => {
                setUrl(event.target.value);
                setConnection(null);
              }}
              className="w-full rounded-lg border border-border bg-bg px-3 py-2"
            />
          </label>
          <label className="text-xs">
            <span className="mb-1 block text-muted">API token</span>
            <input
              type="password"
              autoComplete="off"
              value={token}
              disabled={busy}
              onChange={(event) => {
                setToken(event.target.value);
                setConnection(null);
              }}
              className="w-full rounded-lg border border-border bg-bg px-3 py-2"
            />
          </label>
          <button
            type="button"
            onClick={() => void connect()}
            disabled={busy || disabled}
            className="self-end rounded-lg border border-border px-3 py-2 text-xs disabled:opacity-50"
          >
            {connection ? "Connected" : "Connect"}
          </button>
        </div>
        {connection && (
          <>
            <div className="flex flex-wrap gap-x-4 gap-y-2 text-xs">
              {(
                [
                  ["tagging", "Audio tags"],
                  ["llm", "Local LLM"],
                  ["transcription", "Lyrics"],
                  ["pieces", "Section WAVs"],
                  ["stems", "4 stems"],
                ] as const
              ).map(([key, label]) => (
                <label key={key} className="flex items-center gap-1.5">
                  <input
                    type="checkbox"
                    checked={options[key]}
                    disabled={busy || disabled}
                    onChange={(event) =>
                      setOptions((current) => ({ ...current, [key]: event.target.checked }))
                    }
                  />
                  {label}
                </label>
              ))}
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={() => void run()}
                disabled={busy || disabled}
                className="inline-flex items-center gap-2 rounded-lg bg-accent px-3 py-2 text-xs font-medium text-accent-fg disabled:opacity-50"
              >
                {busy && <LoaderCircle size={14} className="animate-spin" />}Analyze locally
              </button>
              {stage && (
                <>
                  <span role="status" className="text-xs text-muted">
                    {stage}
                  </span>
                  <button
                    type="button"
                    onClick={() => controller.current?.abort()}
                    className="text-xs underline"
                  >
                    Cancel
                  </button>
                </>
              )}
            </div>
            {!health?.tagger_installed && (
              <p className="text-xs text-muted">
                Audio tagging needs the companion’s tagger dependencies and prepared weights.
              </p>
            )}
          </>
        )}
        {result && (
          <div className="space-y-3 border-t border-border pt-3">
            <p className="text-xs text-muted">
              Full track · {Math.round(result.signal.duration_seconds)}s ·{" "}
              {result.signal.tempo_bpm ? `${result.signal.tempo_bpm} BPM (est.)` : "tempo unknown"}{" "}
              · {result.signal.key ?? "key unknown"} · {result.signal.sections.length} sections
            </p>
            <p className="text-xs font-medium">Audio candidates · unreviewed similarity scores</p>
            <div className="grid gap-2 @min-[520px]/song:grid-cols-2">
              {Object.entries(result.candidates).map(([field, values]) => (
                <div key={field} className="rounded-lg bg-surface-2 p-2.5 text-xs">
                  <span className="font-medium capitalize">{field}</span>
                  <p className="mt-1 text-muted">
                    {values.map((item) => `${item.label} (${item.score.toFixed(3)})`).join(" · ")}
                  </p>
                </div>
              ))}
            </div>
            {result.windows.length > 0 && (
              <details className="text-xs">
                <summary className="cursor-pointer font-medium">
                  Tags over time · {result.windows.length} windows
                </summary>
                <div className="mt-2 max-h-60 space-y-2 overflow-auto">
                  {result.windows.map((window) => (
                    <div key={window.start_seconds} className="rounded-lg bg-surface-2 p-2">
                      <span className="font-medium">
                        {window.start_seconds}–{window.end_seconds}s
                      </span>
                      <p className="mt-1 text-muted">
                        {Object.values(window.tags)
                          .map((values) => values[0]?.label)
                          .filter(Boolean)
                          .join(" · ") || "No audible content"}
                      </p>
                    </div>
                  ))}
                </div>
              </details>
            )}
            {Object.values(suggestions).some((values) => values.length) && (
              <>
                <p className="text-xs text-muted">
                  Selected: {Object.values(suggestions).flat().join(" · ")}
                </p>
                <button
                  type="button"
                  disabled={busy || disabled || !annotations}
                  onClick={() => onApply(suggestions)}
                  className="rounded-lg border border-border px-3 py-2 text-xs disabled:opacity-50"
                >
                  Use suggestions as draft tags
                </button>
              </>
            )}
            {result.lyrics.segments.length > 0 && (
              <details className="text-xs">
                <summary className="cursor-pointer font-medium">
                  Candidate lyrics · {result.lyrics.language ?? "unknown language"}
                </summary>
                <p className="mt-2 text-muted">Review sung words and language before tagging.</p>
                <div className="mt-2 max-h-60 space-y-2 overflow-auto">
                  {result.lyrics.segments.map((segment, index) => (
                    <p key={index}>
                      <span className="text-muted">{Math.floor(segment.start_seconds)}s </span>
                      {segment.text}
                    </p>
                  ))}
                </div>
              </details>
            )}
            {jobId && connection && (
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => void download("analysis.zip")}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-xs"
                >
                  <Download size={13} />
                  Results & audio ZIP
                </button>
                <button
                  type="button"
                  onClick={() => void exportTaggedCopy()}
                  disabled={busy || disabled || !annotations?.reviewed}
                  className="rounded-lg border border-border px-3 py-2 text-xs disabled:opacity-50"
                >
                  Export tagged audio
                </button>
                {result.artifacts
                  .filter((item) => item.kind === "stem")
                  .map((item) => (
                    <button
                      type="button"
                      key={item.name}
                      onClick={() => void download(item.name)}
                      className="rounded-lg border border-border px-3 py-2 text-xs"
                    >
                      {item.name.split("/").pop()}
                    </button>
                  ))}
              </div>
            )}
            {result.warnings.length > 0 && (
              <details className="text-xs text-muted">
                <summary className="cursor-pointer">
                  Processing notes · {result.warnings.length}
                </summary>
                <ul className="mt-2 list-disc space-y-1 pl-4">
                  {result.warnings.map((warning) => (
                    <li key={warning}>{warning}</li>
                  ))}
                </ul>
              </details>
            )}
            {connection && (
              <details className="space-y-3 rounded-lg bg-surface-2 p-3 text-xs">
                <summary className="cursor-pointer font-medium">
                  Learn from reviewed corrections
                </summary>
                <p className="text-muted">
                  Review the tags below and enter a reviewer name first. Only submitted labels and
                  audio embeddings are saved for learning; audio and lyrics are excluded. Training
                  updates a small audio tag head, while the LLM weights stay fixed.
                </p>
                <label className="flex items-start gap-2">
                  <input
                    type="checkbox"
                    checked={trainingConsent}
                    onChange={(event) => setTrainingConsent(event.target.checked)}
                  />
                  I have permission to use this track’s reviewed labels for local training.
                </label>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    disabled={
                      busy ||
                      disabled ||
                      !jobId ||
                      !trainingConsent ||
                      !annotations?.reviewed ||
                      !annotations.reviewer?.trim()
                    }
                    onClick={() => void learn(false)}
                    className="rounded-lg border border-border px-3 py-2 disabled:opacity-50"
                  >
                    Save corrections
                  </button>
                  <button
                    type="button"
                    disabled={busy || disabled || (health?.learning.reviewed_tracks ?? 0) < 10}
                    onClick={() => void learn(true)}
                    className="rounded-lg border border-border px-3 py-2 disabled:opacity-50"
                  >
                    Train & evaluate
                  </button>
                </div>
                <p className="text-muted">
                  {health?.learning.reviewed_tracks ?? 0} reviewed tracks · minimum 10, plus
                  sufficient label and holdout coverage
                </p>
                {health?.learning.evaluation && (
                  <details>
                    <summary className="cursor-pointer">Holdout evaluation</summary>
                    <pre className="mt-2 max-h-72 overflow-auto whitespace-pre-wrap break-words text-[11px]">
                      {JSON.stringify(health.learning.evaluation, null, 2)}
                    </pre>
                  </details>
                )}
              </details>
            )}
          </div>
        )}
        {notice && (
          <p role="status" className="text-xs text-muted">
            {notice}
          </p>
        )}
        {error && (
          <p role="alert" className="text-xs text-danger">
            {error}
          </p>
        )}
      </div>
    </details>
  );
}
