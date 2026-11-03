import { lazy, Suspense, useState } from "react";
import { Activity, ArrowRight, Eye, Orbit, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import "./world-lab-entry.css";

const WorldLabWorkspace = lazy(() => import("./world-lab"));

function WorldGlobeArtwork() {
  return (
    <svg className="world-lab-entry__globe" viewBox="0 0 520 520" aria-hidden="true" focusable="false">
      <defs>
        <radialGradient id="world-lab-globe-fill" cx="34%" cy="27%" r="76%">
          <stop offset="0%" stopColor="#92f0d4" />
          <stop offset="38%" stopColor="#27ae9c" />
          <stop offset="76%" stopColor="#11627a" />
          <stop offset="100%" stopColor="#092a43" />
        </radialGradient>
        <linearGradient id="world-lab-land-fill" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#d2f6a9" />
          <stop offset="55%" stopColor="#69d6a9" />
          <stop offset="100%" stopColor="#2c9e91" />
        </linearGradient>
        <radialGradient id="world-lab-globe-shine" cx="26%" cy="20%" r="72%">
          <stop offset="0%" stopColor="#ffffff" stopOpacity=".34" />
          <stop offset="56%" stopColor="#ffffff" stopOpacity=".04" />
          <stop offset="100%" stopColor="#071e32" stopOpacity=".34" />
        </radialGradient>
        <clipPath id="world-lab-globe-clip">
          <circle cx="260" cy="260" r="172" />
        </clipPath>
        <filter id="world-lab-globe-shadow" x="-35%" y="-35%" width="170%" height="170%">
          <feGaussianBlur stdDeviation="18" />
        </filter>
      </defs>

      <ellipse className="world-lab-entry__orbit world-lab-entry__orbit--wide"
        cx="260" cy="260" rx="230" ry="76" transform="rotate(-25 260 260)" />
      <ellipse className="world-lab-entry__orbit world-lab-entry__orbit--tall"
        cx="260" cy="260" rx="210" ry="86" transform="rotate(54 260 260)" />
      <ellipse cx="260" cy="440" rx="145" ry="22" fill="#071f31" opacity=".16" filter="url(#world-lab-globe-shadow)" />

      <circle cx="260" cy="260" r="178" fill="#38c4aa" opacity=".16" />
      <circle cx="260" cy="260" r="172" fill="url(#world-lab-globe-fill)" />
      <g clipPath="url(#world-lab-globe-clip)">
        <g fill="none" stroke="#d5fff2" strokeOpacity=".22" strokeWidth="1.3">
          <ellipse cx="260" cy="260" rx="64" ry="172" />
          <ellipse cx="260" cy="260" rx="122" ry="172" />
          <path d="M88 260h344M105 194c85 35 205 35 310 0M105 326c85-35 205-35 310 0" />
        </g>
        <g fill="url(#world-lab-land-fill)" stroke="#c9f4d0" strokeOpacity=".35" strokeWidth="1.2">
          <path d="M106 143 124 126l23 5 10 17 24 2 13 17-13 16-13-2-14 17-15-4-10-17-20-7-10-16Z" />
          <path d="m174 215 19 8 9 18-6 18 8 18-8 22-10 25-8 27-11-8-4-24-9-22 1-19-12-18 5-18 13-13Z" />
          <path d="m233 151 18-9 17 9 5 12 20-2 10 13-8 13-17 7-8 16-12-3-7-17-16-8-5-15Z" />
          <path d="m263 204 20 1 14 18 3 19-7 20-7 27-13 23-12 21-13-14-4-23-10-18 3-23-5-20 11-17Z" />
          <path d="m293 135 27-5 25 9 15 16 24 8 13 18-14 16-22-2-11 14-21-5-10 12-19-12-5-17 15-10-17-11Z" />
          <path d="m365 287 21 2 11 12-5 18-18 4-12-13Z" />
          <path d="m111 219 9 3 4 10-8 7-9-7Z" />
        </g>
        <circle cx="260" cy="260" r="172" fill="url(#world-lab-globe-shine)" />
      </g>
      <circle cx="260" cy="260" r="172" fill="none" stroke="#d9fff5" strokeOpacity=".52" strokeWidth="1.4" />
      <path d="M146 133c30-27 73-43 116-45" fill="none" stroke="#ffffff" strokeOpacity=".42" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

export function WorldLabEntry() {
  const [hasEntered, setHasEntered] = useState(false);

  if (hasEntered) {
    return (
      <Suspense
        fallback={
          <div className="world-lab-entry__loading" role="status" aria-live="polite">
            <span className="world-lab-entry__loading-mark" aria-hidden="true" />
            <p>Opening The World Lab…</p>
          </div>
        }
      >
        <WorldLabWorkspace />
      </Suspense>
    );
  }

  return (
    <section className="world-lab-entry" aria-labelledby="world-lab-entry-title">
      <div className="world-lab-entry__backdrop" aria-hidden="true" />
      <div className="world-lab-entry__inner">
        <div className="world-lab-entry__copy">
          <div className="world-lab-entry__eyebrow">
            <span className="world-lab-entry__eyebrow-mark"><Sparkles size={14} /></span>
            <span>SPACE FOR CURIOSITY</span>
          </div>
          <p className="world-lab-entry__overline">IMAGINE · CREATE · EXPLORE</p>
          <h1 id="world-lab-entry-title" aria-label="The World Lab" className="world-lab-entry__title">
            The World
            <span>Lab</span>
          </h1>
          <p className="world-lab-entry__description">
            Bring an idea to life. Shape a world with objects, look beneath the surface,
            and explore what happens when you experiment.
          </p>
        </div>

        <div className="world-lab-entry__visual">
          <div className="world-lab-entry__visual-badge">
            <span className="world-lab-entry__status-dot" />
            YOUR SPACE TO EXPLORE
          </div>
          <WorldGlobeArtwork />
          <div className="world-lab-entry__visual-caption">
            <span>01</span>
            <span>ONE WORLD. MANY POSSIBILITIES.</span>
          </div>
        </div>

        <div className="world-lab-entry__actions">
          <div className="world-lab-entry__features" aria-label="Explore World Lab features">
            <span><Orbit size={16} aria-hidden="true" /> Build</span>
            <span><Eye size={16} aria-hidden="true" /> Inspect</span>
            <span><Activity size={16} aria-hidden="true" /> Experiment</span>
          </div>
          <Button
            type="button"
            size="lg"
            className="world-lab-entry__cta"
            onClick={() => setHasEntered(true)}
          >
            Enter the Lab
            <ArrowRight size={19} aria-hidden="true" />
          </Button>
          <p className="world-lab-entry__hint">Your next idea starts here.</p>
        </div>
      </div>
    </section>
  );
}
