import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CopyButton } from "@/components/tools/copy-button";
import { ErrorBanner } from "@/components/tools/error-banner";
import { downloadText } from "@/lib/utils";
import { buildWebDesignOutput, parseWebDesignToolId } from "./webdesign-engine-utils";

export function WebDesignEngine({ toolId }: { toolId: string }) {
  const parsed = useMemo(() => { try { return { value: parseWebDesignToolId(toolId), error: null }; } catch (e) { return { value: null, error: e instanceof Error ? e.message : "Unsupported web-design tool." }; } }, [toolId]);
  const [project, setProject] = useState("enV project");
  const [primary, setPrimary] = useState("#0d9f8a");
  const [text, setText] = useState("#202124");
  const [font, setFont] = useState("system-ui, sans-serif");
  const [maxWidth, setMaxWidth] = useState("1200");
  const [spacing, setSpacing] = useState("8");
  const [columns, setColumns] = useState("3");
  const [radius, setRadius] = useState("12");
  const output = useMemo(() => {
    if (!parsed.value) return "";
    try { return buildWebDesignOutput(parsed.value.family, parsed.value.workflow, { project, primary, text, font, maxWidth: Number(maxWidth), spacing: Number(spacing), columns: Number(columns), radius: Number(radius) }); } catch { return ""; }
  }, [parsed.value, project, primary, text, font, maxWidth, spacing, columns, radius]);
  const error = useMemo(() => {
    if (!parsed.value) return parsed.error;
    try { buildWebDesignOutput(parsed.value.family, parsed.value.workflow, { project, primary, text, font, maxWidth: Number(maxWidth), spacing: Number(spacing), columns: Number(columns), radius: Number(radius) }); return null; } catch (e) { return e instanceof Error ? e.message : "Invalid web-design inputs."; }
  }, [parsed.value, parsed.error, project, primary, text, font, maxWidth, spacing, columns, radius]);
  const reset = () => { setProject("enV project"); setPrimary("#0d9f8a"); setText("#202124"); setFont("system-ui, sans-serif"); setMaxWidth("1200"); setSpacing("8"); setColumns("3"); setRadius("12"); };
  return <div className="space-y-5">
    <p className="text-sm text-muted">Generate practical web-design code and checklists locally. Nothing is uploaded or published.</p>
    <div className="grid gap-4 sm:grid-cols-2">
      <div className="flex flex-col gap-1.5"><Label htmlFor="wd-project">Project</Label><Input id="wd-project" value={project} onChange={(e) => setProject(e.target.value)} /></div>
      <div className="flex flex-col gap-1.5"><Label htmlFor="wd-font">Font family</Label><Input id="wd-font" value={font} onChange={(e) => setFont(e.target.value)} /></div>
      <div className="flex flex-col gap-1.5"><Label htmlFor="wd-primary">Primary color</Label><Input id="wd-primary" value={primary} onChange={(e) => setPrimary(e.target.value)} placeholder="#0d9f8a" /></div>
      <div className="flex flex-col gap-1.5"><Label htmlFor="wd-text">Text color</Label><Input id="wd-text" value={text} onChange={(e) => setText(e.target.value)} placeholder="#202124" /></div>
      <div className="flex flex-col gap-1.5"><Label htmlFor="wd-width">Max width (px)</Label><Input id="wd-width" type="number" min="320" max="2400" value={maxWidth} onChange={(e) => setMaxWidth(e.target.value)} /></div>
      <div className="flex flex-col gap-1.5"><Label htmlFor="wd-spacing">Spacing (px)</Label><Input id="wd-spacing" type="number" min="2" max="64" value={spacing} onChange={(e) => setSpacing(e.target.value)} /></div>
      <div className="flex flex-col gap-1.5"><Label htmlFor="wd-columns">Columns</Label><Input id="wd-columns" type="number" min="1" max="12" value={columns} onChange={(e) => setColumns(e.target.value)} /></div>
      <div className="flex flex-col gap-1.5"><Label htmlFor="wd-radius">Radius (px)</Label><Input id="wd-radius" type="number" min="0" max="64" value={radius} onChange={(e) => setRadius(e.target.value)} /></div>
    </div>
    <ErrorBanner message={error} />
    <div className="flex flex-wrap gap-2"><CopyButton text={output} /><Button type="button" variant="outline" size="sm" disabled={!output} onClick={() => downloadText(output, `env-${toolId}.txt`)}>Download</Button><Button type="button" variant="ghost" size="sm" onClick={reset}>Reset</Button></div>
    {output ? <pre className="max-h-[34rem] overflow-auto whitespace-pre-wrap rounded-xl bg-ink p-4 font-mono text-xs leading-5 text-bg">{output}</pre> : null}
  </div>;
}
