import { lazy, Suspense } from "react";
import "./world-lab-studio.css";

type WorldLabWorkspaceModule = typeof import("./world-lab");
let worldLabWorkspacePromise: Promise<WorldLabWorkspaceModule> | null = null;

function loadWorldLabWorkspace(): Promise<WorldLabWorkspaceModule> {
  worldLabWorkspacePromise ??= import("./world-lab");
  return worldLabWorkspacePromise;
}

/** The route loads the workspace before it commits, so the world opens with no intermediate screen. */
export async function preloadWorldLabWorkspace(): Promise<void> {
  await loadWorldLabWorkspace();
}

const WorldLabWorkspace = lazy(loadWorldLabWorkspace);

/** Opens straight into the world. The boot layer only holds sky and ground colour while chunks resolve. */
export function WorldLabEntry() {
  return (
    <Suspense fallback={<div className="wl-boot" aria-hidden="true" />}>
      <WorldLabWorkspace />
    </Suspense>
  );
}
