import { Suspense, lazy, useEffect, useState } from "react";
import { resolveScreenshotTool } from "@/lib/screenshots/tool-config";

// Keep the canvas-heavy editor split from the main platform bundle. Its chunk loads
// in the background; the tool page and surrounding platform never show an entry loader.
const ScreenshotStudio = lazy(() => import("@/components/screenshots/screenshot-studio").then((m) => ({ default: m.ScreenshotStudio })));

/** Entry for every Screenshot-category tool. Client-only because the studio uses canvas, clipboard and file APIs. */
export function ScreenshotEngine({ toolId }: { toolId: string }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const cfg = resolveScreenshotTool(toolId);
  if (!cfg) return <p role="alert" className="rounded-md bg-danger/10 px-3 py-2 text-sm text-danger">This screenshot tool isn’t configured. Please report it.</p>;
  if (!mounted) return null;
  return (
    <Suspense fallback={null}>
      <ScreenshotStudio key={cfg.toolId} cfg={cfg} />
    </Suspense>
  );
}
