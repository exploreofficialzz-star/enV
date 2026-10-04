import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { HANDOFF_TARGETS, offerImage } from "@/lib/image/handoff";
import { getToolById, toolPath } from "@/lib/registry";
import type { SourceImage } from "@/lib/image/canvas";
import { Btn, Select } from "./ui";

/** Sends the current source image to another Image tool without downloading it first. */
export function SendTo({ source, toolId, label = "Open this image in another tool", ids }: { source: SourceImage; toolId: string; label?: string; ids?: string[] }) {
  const navigate = useNavigate(); const [target, setTarget] = useState("");
  const options = HANDOFF_TARGETS.filter((t) => t.id !== toolId && (!ids || ids.includes(t.id)) && getToolById(t.id));
  if (!options.length) return null;
  return (
    <div className="flex flex-wrap items-end gap-2">
      <div className="min-w-44 flex-1"><Select label={label} value={target} onChange={setTarget} options={[{ value: "", label: "Choose a tool…" }, ...options.map((t) => ({ value: t.id, label: t.label }))]} /></div>
      <Btn disabled={!target} onClick={() => { const tool = getToolById(target); if (!tool) return; offerImage({ blob: source.blob, name: source.name, from: toolId }); void navigate({ to: toolPath(tool) }); }}>Open →</Btn>
    </div>
  );
}
