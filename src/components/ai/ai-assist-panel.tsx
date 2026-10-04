import { Sparkles } from "lucide-react";
import { Component, useState } from "react";
import type { ReactNode } from "react";
import { AiResultView } from "@/components/ai/ai-results";
import { ErrorBanner } from "@/components/tools/error-banner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { prepareAudioForAi, prepareImageForAi } from "@/lib/ai/client/ai-client";
import { useAiAvailable, useAiTask } from "@/lib/ai/client/use-ai-task";
import { buildFeatureInput, defaultValuesFor, getAiFeature, isFileValue, validateFeatureValues } from "@/lib/ai/features";
import type { AiFeature, AiFieldSpec } from "@/lib/ai/features";
import { cn, formatFileSize } from "@/lib/utils";

/** A failure inside the AI panel must never take the tool page down with it. */
class AiErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state: { failed: boolean } = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? null : this.props.children;
  }
}

/**
 * Optional AI step for a tool. Renders nothing unless this tool has an AI feature AND the server
 * reports that feature as usable, so there are never dead buttons. The tool's own deterministic
 * behaviour is untouched and works without this panel.
 */
export function AiAssistPanel({ toolId }: { toolId: string }) {
  const feature = getAiFeature(toolId);
  if (!feature) return null;
  return (
    <AiErrorBoundary key={toolId}>
      <AvailabilityGate feature={feature} />
    </AiErrorBoundary>
  );
}

function AvailabilityGate({ feature }: { feature: AiFeature }) {
  const available = useAiAvailable(feature.taskId);
  return available ? <AiAssistForm feature={feature} /> : null;
}

function fieldId(feature: AiFeature, field: AiFieldSpec): string {
  return `ai-${feature.taskId.replace(/\./g, "-")}-${field.name}`;
}

function AiAssistForm({ feature }: { feature: AiFeature }) {
  const [values, setValues] = useState<Record<string, unknown>>(() => defaultValuesFor(feature));
  const [consent, setConsent] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [preparing, setPreparing] = useState(false);
  const { state, run, cancel } = useAiTask(feature.taskId);

  const running = state.phase === "running";
  const problem = validateFeatureValues(feature, values);
  const blocked = Boolean(problem) || (feature.requiresConsent && !consent) || running || preparing;

  const setValue = (name: string, value: unknown) => setValues((previous) => ({ ...previous, [name]: value }));

  async function onFile(field: AiFieldSpec, file: File | undefined) {
    setNotice(null);
    if (!file) {
      setValue(field.name, undefined);
      return;
    }
    setPreparing(true);
    try {
      const prepared = field.kind === "image" ? await prepareImageForAi(file) : await prepareAudioForAi(file);
      setValue(field.name, prepared);
    } catch (error) {
      setValue(field.name, undefined);
      setNotice(error instanceof Error ? error.message : "That file could not be prepared.");
    } finally {
      setPreparing(false);
    }
  }

  function submit() {
    setNotice(null);
    const issue = validateFeatureValues(feature, values);
    if (issue) {
      setNotice(issue);
      return;
    }
    void run(buildFeatureInput(feature, values));
  }

  function renderField(field: AiFieldSpec) {
    const id = fieldId(feature, field);
    const value = values[field.name];
    switch (field.kind) {
      case "textarea":
        return (
          <Textarea
            id={id}
            value={typeof value === "string" ? value : ""}
            maxLength={field.maxLength}
            placeholder={field.placeholder}
            className={cn("min-h-28", field.monospace && "font-mono")}
            onChange={(event) => setValue(field.name, event.target.value)}
          />
        );
      case "text":
        return (
          <Input
            id={id}
            value={typeof value === "string" ? value : ""}
            maxLength={field.maxLength}
            placeholder={field.placeholder}
            className={cn(field.monospace && "font-mono")}
            onChange={(event) => setValue(field.name, event.target.value)}
          />
        );
      case "number":
        return (
          <Input
            id={id}
            type="number"
            inputMode="numeric"
            min={field.min}
            max={field.max}
            value={typeof value === "number" || typeof value === "string" ? value : ""}
            onChange={(event) => setValue(field.name, event.target.value === "" ? "" : Number(event.target.value))}
          />
        );
      case "select":
        return (
          <Select id={id} value={typeof value === "string" ? value : (field.options?.[0]?.value ?? "")} onChange={(event) => setValue(field.name, event.target.value)}>
            {(field.options ?? []).map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </Select>
        );
      case "checkbox":
        return (
          <label htmlFor={id} className="flex items-center gap-2 text-sm">
            <input id={id} type="checkbox" className="size-4 accent-accent" checked={Boolean(value)} onChange={(event) => setValue(field.name, event.target.checked)} />
            {field.label}
          </label>
        );
      case "image":
      case "audio":
        return (
          <div className="space-y-1">
            <Input id={id} type="file" accept={field.accept} onChange={(event) => void onFile(field, event.target.files?.[0])} />
            {isFileValue(value) ? (
              <p className="text-xs text-muted">
                {value.filename ? `${value.filename} · ` : ""}
                {formatFileSize(value.bytes)} ready to send
              </p>
            ) : null}
          </div>
        );
      default:
        return null;
    }
  }

  const headingId = `ai-heading-${feature.taskId.replace(/\./g, "-")}`;

  return (
    <section aria-labelledby={headingId} className="mt-4 rounded-2xl bg-surface p-4 shadow-[var(--shadow-border)] sm:p-6">
      <div className="flex flex-wrap items-center gap-2">
        <Sparkles className="size-4 text-accent" aria-hidden="true" />
        <h2 id={headingId} className="text-lg font-semibold">
          {feature.title}
        </h2>
        <span className="rounded-full bg-surface-2 px-2 py-0.5 text-[11px] font-medium uppercase tracking-wide text-muted">AI</span>
      </div>
      <p className="mt-1 text-sm text-muted">{feature.description}</p>

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        {feature.fields.map((field) => (
          <div key={field.name} className={cn("space-y-1.5", (field.kind === "textarea" || field.kind === "image" || field.kind === "audio") && "sm:col-span-2")}>
            {field.kind === "checkbox" ? null : (
              <Label htmlFor={fieldId(feature, field)}>
                {field.label}
                {field.required ? <span aria-hidden="true"> *</span> : null}
              </Label>
            )}
            {renderField(field)}
            {field.help ? <p className="text-xs text-muted">{field.help}</p> : null}
          </div>
        ))}
      </div>

      {feature.requiresConsent ? (
        <label className="mt-4 flex items-start gap-2 text-sm">
          <input type="checkbox" className="mt-0.5 size-4 accent-accent" checked={consent} onChange={(event) => setConsent(event.target.checked)} />
          <span>{feature.consentLabel ?? "I understand my input is sent to an external AI service."}</span>
        </label>
      ) : null}

      <div className="mt-4 flex flex-wrap items-center gap-2">
        {running ? (
          <Button type="button" variant="outline" onClick={cancel}>
            Cancel
          </Button>
        ) : (
          <Button type="button" onClick={submit} disabled={blocked}>
            <Sparkles className="size-4" aria-hidden="true" />
            {state.phase === "done" ? "Try again" : feature.actionLabel}
          </Button>
        )}
        {running || preparing ? (
          <span role="status" className="inline-flex items-center gap-2 text-sm text-muted">
            <span className="size-4 animate-spin rounded-full border-2 border-border border-t-accent" aria-hidden="true" />
            {preparing ? "Preparing your file…" : "Working on it. This can take up to a minute."}
          </span>
        ) : null}
      </div>

      <p className="mt-3 text-xs text-muted">
        AI-assisted. Nothing is sent until you press the button; then your input goes to an external AI service to produce the result. AI can be wrong, so review it before you use it. Use is limited per person and per day to keep it available for everyone.
      </p>

      <div className="mt-3 space-y-3" aria-live="polite">
        <ErrorBanner message={notice} />
        {state.phase === "error" ? (
          <ErrorBanner
            message={`${state.error.message}${state.error.retryAfterSeconds ? ` Try again in about ${state.error.retryAfterSeconds} seconds.` : ""}`}
          />
        ) : null}
        {state.phase === "done" ? (
          <div className="space-y-3">
            <AiResultView kind={feature.resultKind} result={state.result} />
            {state.meta.warnings.length > 0 ? <p className="text-xs text-muted">{state.meta.warnings.join(" ")}</p> : null}
          </div>
        ) : null}
      </div>
    </section>
  );
}
