import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { FieldGrid, type UiField } from "@/components/engines/fields";
import { ErrorBanner } from "@/components/tools/error-banner";
import { CopyButton } from "@/components/tools/copy-button";
import { downloadText } from "@/lib/utils";
import {
  eventFieldsForTool,
  eventTemplateFileName,
  eventTemplateForTool,
  generateEventTemplate,
  initialEventValues,
} from "@/lib/events/event-templates";

export function EventTemplateEngine({ toolId }: { toolId: string }) {
  const template = eventTemplateForTool(toolId);
  const fields = useMemo<UiField[]>(() => eventFieldsForTool(toolId).map((field) => ({ ...field })), [toolId]);
  const [values, setValues] = useState(() => initialEventValues(toolId));
  const [output, setOutput] = useState("");
  const [error, setError] = useState<string | null>(null);
  if (!template) return null;

  const isStaticPage = template.operation === "rsvp" || template.operation === "check-in";
  const generate = () => {
    try {
      setOutput(generateEventTemplate(toolId, values));
      setError(null);
    } catch (caught) {
      setOutput("");
      setError(caught instanceof Error ? caught.message : "Could not generate the event template.");
    }
  };
  const reset = () => {
    setValues(initialEventValues(toolId));
    setOutput("");
    setError(null);
  };

  return <div className="space-y-4">
    <p className="rounded-lg border border-border/60 bg-muted/30 p-3 text-sm text-subtle">
      {isStaticPage
        ? "Static HTML template only. It does not publish a page, collect RSVP responses, or record live check-ins."
        : "Runs locally. Date and time are kept exactly as entered; no time-zone conversion or calendar service is used."}
    </p>
    <FieldGrid fields={fields} values={values} onChange={(name, value) => setValues((current) => ({ ...current, [name]: value }))} />
    <ErrorBanner message={error} />
    <div className="flex flex-wrap gap-2">
      <Button type="button" onClick={generate}>Generate</Button>
      {output ? <CopyButton text={output} /> : null}
      <Button type="button" variant="outline" disabled={!output} onClick={() => downloadText(output, eventTemplateFileName(toolId))}>Download {isStaticPage ? "HTML" : "text"}</Button>
      <Button type="button" variant="ghost" onClick={reset}>Reset</Button>
    </div>
    {output ? <pre className="max-h-[36rem] overflow-auto whitespace-pre-wrap rounded-xl border bg-muted/20 p-4 text-sm">{output}</pre> : null}
  </div>;
}
