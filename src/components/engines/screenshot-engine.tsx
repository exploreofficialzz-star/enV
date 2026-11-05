import { useEffect, useState } from "react";
import { resolveScreenshotTool } from "@/lib/screenshots/tool-config";

// The selected tool route preloads this module before committing the page,
// so the canvas editor is ready when the platform and tool interface appear.
import { ScreenshotStudio } from "@/components/screenshots/screenshot-studio";

/** Entry for every Screenshot-category tool. Client-only because the studio uses canvas, clipboard and file APIs. */
export function ScreenshotEngine({ toolId }: { toolId: string }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const cfg = resolveScreenshotTool(toolId);
  if (!cfg) return <p role="alert" className="rounded-md bg-danger/10 px-3 py-2 text-sm text-danger">This screenshot tool isn’t configured. Please report it.</p>;
  if (!mounted) return null;
  return <ScreenshotStudio key={cfg.toolId} cfg={cfg} />;
}
