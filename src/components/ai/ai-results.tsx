import { useState } from "react";
import type { ReactNode } from "react";
import { CopyButton } from "@/components/tools/copy-button";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import type {
  AltTextResult,
  CaptionResult,
  JsonExplainResult,
  RegexExplainResult,
  SqlExplainResult,
  TitleResult,
  TranscriptResult,
} from "@/lib/ai/contracts";
import type { AiResultKind } from "@/lib/ai/features";
import { toSrt, toVtt } from "@/lib/ai/subtitles";
import { downloadText } from "@/lib/utils";

/** AI output is always rendered as plain text (React escapes it); it is never treated as HTML or markdown. */
export function AiResultView({ kind, result }: { kind: AiResultKind; result: unknown }) {
  switch (kind) {
    case "captions":
      return <CaptionsView result={result as CaptionResult} />;
    case "titles":
      return <TitlesView result={result as TitleResult} />;
    case "regex":
      return <RegexView result={result as RegexExplainResult} />;
    case "sql":
      return <SqlView result={result as SqlExplainResult} />;
    case "json":
      return <JsonView result={result as JsonExplainResult} />;
    case "alt-text":
      return <AltTextView result={result as AltTextResult} />;
    case "transcript":
      return <TranscriptView result={result as TranscriptResult} />;
    default:
      return null;
  }
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="space-y-2">
      <h4 className="text-sm font-semibold">{title}</h4>
      {children}
    </div>
  );
}

function Bullets({ items }: { items: string[] }) {
  if (items.length === 0) return null;
  return (
    <ul className="list-disc space-y-1 pl-5 text-sm">
      {items.map((item, index) => (
        <li key={`${index}-${item}`}>{item}</li>
      ))}
    </ul>
  );
}

function EditableCaption({ variant, index }: { variant: CaptionResult["variants"][number]; index: number }) {
  const [text, setText] = useState(variant.caption);
  const tags = variant.hashtags.map((tag) => `#${tag}`).join(" ");
  const full = tags ? `${text}\n\n${tags}` : text;
  return (
    <li className="space-y-2 rounded-lg bg-surface-2 p-3">
      <label className="sr-only" htmlFor={`ai-caption-${index}`}>
        Caption {index + 1}
      </label>
      <Textarea id={`ai-caption-${index}`} className="min-h-24" value={text} onChange={(event) => setText(event.target.value)} />
      {tags ? <p className="break-words text-xs text-muted">{tags}</p> : null}
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs text-muted">{text.length} characters</span>
        <CopyButton text={full} />
      </div>
    </li>
  );
}

function CaptionsView({ result }: { result: CaptionResult }) {
  return (
    <ul className="space-y-3">
      {result.variants.map((variant, index) => (
        // Keyed by content so a regenerated result never inherits the previous result's edits.
        <EditableCaption key={`${index}-${variant.caption}`} variant={variant} index={index} />
      ))}
    </ul>
  );
}

function TitlesView({ result }: { result: TitleResult }) {
  return (
    <ul className="space-y-2">
      {result.titles.map((title, index) => (
        <li key={`${index}-${title}`} className="flex items-center justify-between gap-3 rounded-lg bg-surface-2 px-3 py-2">
          <div className="min-w-0">
            <p className="break-words text-sm">{title}</p>
            <p className="text-xs text-muted">{title.length} characters</p>
          </div>
          <CopyButton text={title} />
        </li>
      ))}
    </ul>
  );
}

function RegexView({ result }: { result: RegexExplainResult }) {
  return (
    <div className="space-y-4">
      <p className="text-sm">{result.summary}</p>
      {result.parts.length > 0 ? (
        <Section title="Breakdown">
          <dl className="space-y-1 text-sm">
            {result.parts.map((part, index) => (
              <div key={`${index}-${part.token}`} className="flex flex-col gap-0.5 sm:flex-row sm:gap-3">
                <dt className="shrink-0 font-mono text-accent">{part.token}</dt>
                <dd className="text-muted">{part.meaning}</dd>
              </div>
            ))}
          </dl>
        </Section>
      ) : null}
      {result.pitfalls.length > 0 ? (
        <Section title="Watch out for">
          <Bullets items={result.pitfalls} />
        </Section>
      ) : null}
      {result.suggestedTests.length > 0 ? (
        <Section title="Suggested examples (AI guesses, not verified)">
          <ul className="space-y-1 text-sm">
            {result.suggestedTests.map((test, index) => (
              <li key={`${index}-${test.input}`} className="flex gap-2">
                <code className="break-all font-mono">{test.input || "(empty)"}</code>
                <span className="text-muted">{test.shouldMatch ? "should match" : "should not match"}</span>
              </li>
            ))}
          </ul>
          <p className="text-xs text-muted">Try these in the regex tester above before relying on them.</p>
        </Section>
      ) : null}
    </div>
  );
}

function SqlView({ result }: { result: SqlExplainResult }) {
  return (
    <div className="space-y-4">
      <p className="text-sm">{result.summary}</p>
      <Section title="Step by step">
        <ol className="list-decimal space-y-2 pl-5 text-sm">
          {result.steps.map((step, index) => (
            <li key={`${index}-${step.clause}`}>
              <code className="font-mono text-accent">{step.clause}</code>
              <span className="text-muted"> — {step.explanation}</span>
            </li>
          ))}
        </ol>
      </Section>
      {result.warnings.length > 0 ? (
        <Section title="Warnings">
          <Bullets items={result.warnings} />
        </Section>
      ) : null}
      {result.performanceNotes.length > 0 ? (
        <Section title="Performance notes">
          <Bullets items={result.performanceNotes} />
        </Section>
      ) : null}
    </div>
  );
}

function JsonView({ result }: { result: JsonExplainResult }) {
  return (
    <div className="space-y-4">
      <p className="text-sm">{result.summary}</p>
      <Section title="Structure">
        <ul className="space-y-1 text-sm">
          {result.structure.map((item, index) => (
            <li key={`${index}-${item.path}`}>
              <code className="break-all font-mono text-accent">{item.path}</code>
              <span className="text-muted"> · {item.type}</span>
              {item.note ? <span className="text-muted"> — {item.note}</span> : null}
            </li>
          ))}
        </ul>
      </Section>
      {result.issues.length > 0 ? (
        <Section title="Possible issues">
          <Bullets items={result.issues} />
        </Section>
      ) : null}
    </div>
  );
}

function AltTextView({ result }: { result: AltTextResult }) {
  return (
    <div className="space-y-4">
      <Section title="Alt text">
        <p className="rounded-lg bg-surface-2 p-3 text-sm">{result.altText}</p>
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs text-muted">{result.altText.length} characters</span>
          <CopyButton text={result.altText} />
        </div>
      </Section>
      <Section title="Longer description">
        <p className="rounded-lg bg-surface-2 p-3 text-sm">{result.longDescription}</p>
        <CopyButton text={result.longDescription} />
      </Section>
      {result.containsText ? (
        <Section title="Text found in the image">
          <p className="whitespace-pre-wrap rounded-lg bg-surface-2 p-3 text-sm">{result.textInImage}</p>
          <CopyButton text={result.textInImage} />
        </Section>
      ) : null}
    </div>
  );
}

function TranscriptView({ result }: { result: TranscriptResult }) {
  const hasSegments = result.segments.length > 0;
  return (
    <div className="space-y-3">
      <label className="sr-only" htmlFor="ai-transcript">
        Transcript
      </label>
      <Textarea id="ai-transcript" readOnly className="min-h-40" value={result.text || "No speech was detected."} />
      <div className="flex flex-wrap gap-2">
        <CopyButton text={result.text} />
        <Button type="button" variant="outline" size="sm" disabled={!result.text} onClick={() => downloadText(result.text, "transcript.txt")}>
          Download .txt
        </Button>
        {hasSegments ? (
          <>
            <Button type="button" variant="outline" size="sm" onClick={() => downloadText(toSrt(result.segments), "transcript.srt", "application/x-subrip")}>
              Download .srt
            </Button>
            <Button type="button" variant="outline" size="sm" onClick={() => downloadText(toVtt(result.segments), "transcript.vtt", "text/vtt")}>
              Download .vtt
            </Button>
          </>
        ) : null}
      </div>
      {result.language ? <p className="text-xs text-muted">Detected language: {result.language}</p> : null}
    </div>
  );
}
