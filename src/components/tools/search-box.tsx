import { useNavigate } from "@tanstack/react-router";
import { Search } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { getAllTools, toolPath } from "@/lib/registry";
import { searchTools } from "@/lib/search";
import { cn } from "@/lib/utils";

export function SearchBox({
  large = false,
  autoFocus = false,
  value,
  onValueChange,
}: {
  large?: boolean;
  autoFocus?: boolean;
  value?: string;
  onValueChange?: (v: string) => void;
}) {
  const [inner, setInner] = useState(value ?? "");
  const q = value ?? inner;
  const setQ = onValueChange ?? setInner;
  const [open, setOpen] = useState(false);
  const nav = useNavigate();
  const boxRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const results = useMemo(() => (q.trim() ? searchTools(getAllTools(), q, 8) : []), [q]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "/" && !(e.target instanceof HTMLInputElement) && !(e.target instanceof HTMLTextAreaElement)) {
        e.preventDefault();
        inputRef.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (!boxRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  return (
    <div ref={boxRef} className={cn("relative w-full", large ? "max-w-2xl" : "max-w-xl")}>
      <label className="sr-only" htmlFor="env-search">
        Search tools
      </label>
      <Search className="pointer-events-none absolute top-1/2 left-4 size-5 -translate-y-1/2 text-subtle" />
      <input
        id="env-search"
        ref={inputRef}
        value={q}
        autoFocus={autoFocus}
        autoComplete="off"
        placeholder={`Search ${getAllTools().length.toLocaleString()} tools…`}
        onChange={(e) => {
          setQ(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            if (results[0]) nav({ to: toolPath(results[0]) });
            else nav({ to: "/search", search: { q } });
            setOpen(false);
          }
        }}
        className={cn(
          "w-full rounded-full bg-surface text-fg shadow-[var(--shadow-border)] placeholder:text-subtle focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none",
          large ? "h-14 pl-12 pr-4 text-base" : "h-11 pl-11 pr-3 text-sm",
        )}
      />
      {open && q.trim() && (
        <ul
          className="absolute z-20 mt-2 w-full overflow-hidden rounded-xl bg-surface py-1 shadow-[var(--shadow-border)]"
          role="listbox"
        >
          {results.length === 0 ? (
            <li className="px-4 py-3 text-sm text-muted">No matching tools. Try “json”, “bmi”, or “qr”.</li>
          ) : (
            results.map((t) => (
              <li key={t.id}>
                <button
                  type="button"
                  className="flex w-full flex-col items-start px-4 py-2.5 text-left hover:bg-surface-2"
                  onClick={() => {
                    nav({ to: toolPath(t) });
                    setOpen(false);
                  }}
                >
                  <span className="flex items-center gap-2 text-sm font-medium">{t.name}{t.status === "planned" ? <span className="text-[9px] font-semibold uppercase tracking-wide text-subtle">Coming soon</span> : null}</span>
                  <span className="line-clamp-1 text-xs text-muted">{t.description}</span>
                </button>
              </li>
            ))
          )}
          <li>
            <button
              type="button"
              className="w-full px-4 py-2 text-left text-xs font-medium text-accent hover:bg-surface-2"
              onClick={() => {
                nav({ to: "/search", search: { q } });
                setOpen(false);
              }}
            >
              View all results
            </button>
          </li>
        </ul>
      )}
    </div>
  );
}
