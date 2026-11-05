import { lazy, Suspense, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import "./world-lab-entry.css";

type WorldLabWorkspaceModule = typeof import("./world-lab");
let worldLabWorkspacePromise: Promise<WorldLabWorkspaceModule> | null = null;

function loadWorldLabWorkspace(): Promise<WorldLabWorkspaceModule> {
  worldLabWorkspacePromise ??= import("./world-lab");
  return worldLabWorkspacePromise;
}

/** Warm the workspace while the entry surface is visible, never after Enter is tapped. */
export async function preloadWorldLabWorkspace(): Promise<void> {
  if (typeof window === "undefined") return;
  await loadWorldLabWorkspace();
}

const WorldLabWorkspace = lazy(loadWorldLabWorkspace);

export function WorldLabEntry() {
  const [hasEntered, setHasEntered] = useState(false);
  const [isHydrated, setIsHydrated] = useState(false);

  useEffect(() => {
    setIsHydrated(true);
    void preloadWorldLabWorkspace().catch(() => undefined);
  }, []);

  if (hasEntered) {
    return (
      <Suspense fallback={null}>
        <WorldLabWorkspace />
      </Suspense>
    );
  }

  return (
    <section className="world-lab-entry" aria-labelledby="world-lab-entry-title" data-world-lab-entry-ready={isHydrated ? "true" : "false"}>
      <div className="world-lab-entry__inner">
        <div className="world-lab-entry__content">
          <h1 id="world-lab-entry-title" className="world-lab-entry__title">
            <img src="/world-lab-title.svg" alt="The World Lab" width="412" height="87" />
          </h1>
          <div className="world-lab-entry__artwork" aria-label="World Lab artwork">
            <span className="world-lab-entry__planet" aria-hidden="true">🪐</span>
            <img
              className="world-lab-entry__brand"
              src="/logo-home-transparent.png"
              alt="enV"
              width="811"
              height="304"
            />
          </div>
          <Button type="button" size="lg" className="world-lab-entry__cta" onClick={() => setHasEntered(true)}>
            Enter
          </Button>
        </div>
      </div>
    </section>
  );
}
