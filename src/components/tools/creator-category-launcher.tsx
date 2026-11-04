import { useMemo, useState } from "react";
import { ArrowLeft, Search, X } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { ToolAppIcon } from "@/components/tools/tool-app-icon";
import { toolPath } from "@/lib/registry";
import type { ToolMeta } from "@/types/tool";
import "./creator-engine.css";

const FILTERS = [
  ["All", "all"], ["YouTube", "youtube"], ["TikTok", "tiktok"],
  ["Instagram", "instagram"], ["Facebook", "facebook"], ["X", "x"],
  ["LinkedIn", "linkedin"], ["Twitch", "twitch"], ["Spotify", "spotify"],
  ["Apple Music", "apple-music"], ["Podcasts", "podcast"], ["Music", "music"], ["Other", "other"],
] as const;

function familyFor(tool: ToolMeta) {
  const haystack = (tool.id + " " + tool.name).toLowerCase();
  if (haystack.includes("youtube")) return "youtube";
  if (haystack.includes("tiktok")) return "tiktok";
  if (haystack.includes("instagram")) return "instagram";
  if (haystack.includes("facebook")) return "facebook";
  if (/\bx\b/.test(tool.name.toLowerCase()) || haystack.includes("twitter")) return "x";
  if (haystack.includes("linkedin")) return "linkedin";
  if (haystack.includes("twitch")) return "twitch";
  if (haystack.includes("spotify")) return "spotify";
  if (haystack.includes("apple-music") || haystack.includes("apple music")) return "apple-music";
  if (haystack.includes("podcast")) return "podcast";
  if (/(music|royalt|bpm|song|audio)/.test(haystack)) return "music";
  return "other";
}

export function CreatorCategoryLauncher({ tools }: { tools: ToolMeta[] }) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<(typeof FILTERS)[number][1]>("all");
  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    return tools
      .filter((tool) => filter === "all" || familyFor(tool) === filter)
      .filter((tool) => !q || (tool.name + " " + tool.id).toLowerCase().includes(q))
      .sort((a, b) => b.popularity - a.popularity || a.name.localeCompare(b.name));
  }, [tools, query, filter]);

  return (
    <main className="env-creator-launcher">
      <header className="env-creator-launcher__header">
        <Link to="/tools" search={{ q: "" }} className="env-creator-launcher__back" aria-label="Back to tools" title="Back">
          <ArrowLeft aria-hidden="true" />
        </Link>
        <h1>Creators &amp; music</h1>
        <span className="env-creator-launcher__count">{results.length}</span>
      </header>

      <label className="env-creator-launcher__search">
        <Search aria-hidden="true" />
        <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search tools" aria-label="Search tools" />
        {query ? <button type="button" onClick={() => setQuery("")} aria-label="Clear search"><X aria-hidden="true" /></button> : null}
      </label>

      <nav className="env-creator-launcher__filters" aria-label="Platform filters">
        {FILTERS.map(([label, value]) => (
          <button key={value} type="button" className={filter === value ? "is-active" : ""} onClick={() => setFilter(value)} aria-pressed={filter === value}>
            {label}
          </button>
        ))}
      </nav>

      <section className="env-creator-launcher__grid" aria-label="Creator tools">
        {results.map((tool) => (
          <Link key={tool.id} to={toolPath(tool)} className="env-creator-launcher__tile" title={tool.name}>
            <ToolAppIcon tool={tool} className="env-creator-launcher__icon" />
            <span>{tool.name}</span>
          </Link>
        ))}
        {results.length === 0 ? <div className="env-creator-launcher__empty">No tools found</div> : null}
      </section>
    </main>
  );
}
