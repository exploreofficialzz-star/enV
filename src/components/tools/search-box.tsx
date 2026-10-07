import { useNavigate } from "@tanstack/react-router";
import { Search } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { getAllTools, toolPath } from "@/lib/registry";
import { searchTools } from "@/lib/search";
import { cn } from "@/lib/utils";

export function SearchBox({
  large = false,
  autoFocus = false,
  variant = "default",
  hidePlaceholderOnFocus = false,
  value,
  onValueChange,
  onEnter,
  placeholder = `Search ${getAllTools().length.toLocaleString()} tools…`,
  leading,
  trailing,
  showSearchIcon = true,
  className,
  containerClassName,
  inputClassName,
}: {
  large?: boolean;
  autoFocus?: boolean;
  variant?: "default" | "inline";
  hidePlaceholderOnFocus?: boolean;
  value?: string;
  onValueChange?: (v: string) => void;
  onEnter?: (query: string) => void;
  placeholder?: string;
  leading?: ReactNode;
  trailing?: ReactNode;
  showSearchIcon?: boolean;
  className?: string;
  containerClassName?: string;
  inputClassName?: string;
}) {
  const [inner, setInner] = useState(value ?? "");
  const q = value ?? inner;
  const setQ = onValueChange ?? setInner;
  const [open, setOpen] = useState(false);
  const [focused, setFocused] = useState(false);
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

  const renderInput = (baseClassName: string) => (
    <input
      id="env-search"
      ref={inputRef}
      type={variant === "inline" ? "search" : "text"}
      value={q}
      autoFocus={autoFocus}
      autoComplete="off"
      placeholder={hidePlaceholderOnFocus && focused ? "" : placeholder}
      onChange={(e) => {
        setQ(e.target.value);
        setOpen(true);
      }}
      onFocus={() => {
        setFocused(true);
        setOpen(true);
      }}
      onBlur={() => setFocused(false)}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          if (onEnter) onEnter(q);
          else if (results[0]) nav({ to: toolPath(results[0]) });
          else nav({ to: "/search", search: { q } });
          setOpen(false);
        }
      }}
      className={cn(baseClassName, inputClassName)}
    />
  );

  return (
    <div
      ref={boxRef}
      role={variant === "inline" ? "search" : undefined}
      className={cn("relative w-full", large ? "max-w-2xl" : "max-w-xl", className)}
    >
      <label className="sr-only" htmlFor="env-search">
        Search tools
      </label>
      {variant === "inline" ? (
        <div className={containerClassName}>
          {leading}
          {renderInput("min-w-0 flex-1 bg-transparent text-left text-base text-fg outline-none placeholder:text-subtle sm:text-lg")}
          {trailing}
        </div>
      ) : (
        <>
          {leading ? <span className="pointer-events-none absolute top-1/2 left-4 z-10 -translate-y-1/2">{leading}</span> : null}
          {!leading && showSearchIcon ? <Search className="pointer-events-none absolute top-1/2 left-4 size-5 -translate-y-1/2 text-subtle" /> : null}
          {renderInput(cn(
            "w-full rounded-full bg-surface text-fg shadow-[var(--shadow-border)] placeholder:text-subtle focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none",
            large ? "h-14 pl-12 pr-4 text-base" : "h-11 pl-11 pr-3 text-sm",
            leading || showSearchIcon ? "pl-12" : "pl-4",
            trailing ? "pr-14" : "",
          ))}
          {trailing ? <span className="absolute top-1/2 right-2 z-10 -translate-y-1/2">{trailing}</span> : null}
        </>
      )}
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
              See more results
            </button>
          </li>
        </ul>
      )}
    </div>
  );
}
