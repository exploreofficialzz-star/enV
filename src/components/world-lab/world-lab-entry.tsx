import { lazy, Suspense, useState } from "react";
import { Button } from "@/components/ui/button";
import "./world-lab-entry.css";

const WorldLabWorkspace = lazy(() => import("./world-lab"));

export function WorldLabEntry() {
  const [hasEntered, setHasEntered] = useState(false);

  if (hasEntered) {
    return (
      <Suspense
        fallback={
          <div className="world-lab-entry__loading" role="status" aria-label="Opening The World Lab">
            <span className="world-lab-entry__loading-mark" aria-hidden="true" />
          </div>
        }
      >
        <WorldLabWorkspace />
      </Suspense>
    );
  }

  return (
    <section className="world-lab-entry" aria-labelledby="world-lab-entry-title">
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
