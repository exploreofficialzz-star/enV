import { useNavigate } from "@tanstack/react-router";
import { ArrowRight, Search } from "lucide-react";
import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from "react";
import { getAllTools, getSearchableTools, toolPath } from "@/lib/registry";
import { normalizeText } from "@/lib/search";
import { prepareToolSuggestions, suggestTools } from "@/lib/search-autocomplete";
import { cn } from "@/lib/utils";
import type { ToolMeta } from "@/types/tool";
import { isToolUnderProduction } from "@/lib/production-notice";
import { UnderProductionDialog } from "@/components/tools/under-production";

type IdleDeadlineLike = { didTimeout: boolean; timeRemaining: () => number };

type IdleWindow = Window & {
  requestIdleCallback?: (callback: (deadline: IdleDeadlineLike) => void, options?: { timeout?: number }) => number;
  cancelIdleCallback?: (handle: number) => void;
};

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
  const [suggestions, setSuggestions] = useState<ToolMeta[]>([]);
  const [suggestionsReady, setSuggestionsReady] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [productionTool, setProductionTool] = useState<ToolMeta | null>(null);
  const nav = useNavigate();
  const boxRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const inputId = useId();
  const listboxId = useId();
  const searchable = useMemo(() => getSearchableTools(), []);
  const normalizedQuery = normalizeText(q);

  useEffect(() => {
    const idleWindow = window as IdleWindow;
    const prepare = () => {
      prepareToolSuggestions(searchable);
      setSuggestionsReady(true);
    };

    if (idleWindow.requestIdleCallback) {
      const handle = idleWindow.requestIdleCallback(prepare, { timeout: 1600 });
      return () => idleWindow.cancelIdleCallback?.(handle);
    }

    const handle = window.setTimeout(prepare, 500);
    return () => window.clearTimeout(handle);
  }, [searchable]);

  useEffect(() => {
    if (!open || normalizedQuery.length < 2 || !suggestionsReady) {
      setSuggestions([]);
      setActiveIndex(-1);
      return;
    }

    // Debounce only the lightweight prefix lookup, never the full ranked catalogue search.
    const handle = window.setTimeout(() => {
      setSuggestions(suggestTools(searchable, q, 8));
      setActiveIndex(-1);
    }, 120);
    return () => window.clearTimeout(handle);
  }, [open, normalizedQuery, q, searchable, suggestionsReady]);

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
    const onDoc = (e: PointerEvent) => {
      if (!boxRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", onDoc);
    return () => document.removeEventListener("pointerdown", onDoc);
  }, []);

  const selectTool = (tool: ToolMeta) => {
    setQ(tool.name);
    setOpen(false);
    setActiveIndex(-1);
    if (isToolUnderProduction(tool)) setProductionTool(tool);
    else nav({ to: toolPath(tool) });
  };

  const submitSearch = (query = q) => {
    const trimmed = query.trim();
    if (!trimmed) return;
    setOpen(false);
    setActiveIndex(-1);
    if (onEnter) onEnter(trimmed);
    else nav({ to: "/search", search: { q: trimmed } });
  };

  const renderInput = (baseClassName: string) => (
    <input
      id={inputId}
      ref={inputRef}
      type={variant === "inline" ? "search" : "text"}
      role="combobox"
      aria-label="Search tools"
      aria-autocomplete="list"
      aria-expanded={open && Boolean(q.trim())}
      aria-controls={open && Boolean(q.trim()) ? listboxId : undefined}
      aria-activedescendant={activeIndex >= 0 && suggestions[activeIndex] ? `${listboxId}-option-${activeIndex}` : undefined}
      value={q}
      autoFocus={autoFocus}
      autoComplete="off"
      spellCheck={false}
      placeholder={hidePlaceholderOnFocus && focused ? "" : placeholder}
      onChange={(e) => {
        setQ(e.target.value);
        setSuggestions([]);
        setActiveIndex(-1);
        setOpen(true);
      }}
      onFocus={() => {
        setFocused(true);
        setOpen(true);
      }}
      onBlur={() => setFocused(false)}
      onKeyDown={(e) => {
        if (e.key === "ArrowDown") {
          e.preventDefault();
          setOpen(true);
          setActiveIndex((current) => Math.min(suggestions.length - 1, current + 1));
        } else if (e.key === "ArrowUp") {
          e.preventDefault();
          setActiveIndex((current) => current <= 0 ? suggestions.length - 1 : current - 1);
        } else if (e.key === "Escape") {
          setOpen(false);
          setActiveIndex(-1);
        } else if (e.key === "Enter") {
          e.preventDefault();
          const active = activeIndex >= 0 ? suggestions[activeIndex] : undefined;
          if (active) selectTool(active);
          else submitSearch();
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
      {open && q.trim() ? (
        <div className="absolute z-20 mt-2 w-full overflow-hidden rounded-xl bg-surface shadow-[var(--shadow-border)]">
          <ul id={listboxId} className="py-1" role="listbox" aria-label="Tool suggestions">
            {suggestions.length > 0 ? suggestions.map((tool, index) => (
              <li key={tool.id}>
                <button
                  id={`${listboxId}-option-${index}`}
                  type="button"
                  role="option"
                  aria-selected={activeIndex === index}
                  className={cn(
                    "flex w-full items-center gap-3 px-4 py-2.5 text-left",
                    activeIndex === index ? "bg-surface-2" : "hover:bg-surface-2",
                  )}
                  onMouseEnter={() => setActiveIndex(index)}
                  onClick={() => selectTool(tool)}
                >
                  <Search className="size-4 shrink-0 text-subtle" aria-hidden="true" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-fg">{tool.name}{tool.status === "planned" ? <span className="ml-2 text-[10px] font-semibold uppercase tracking-wide text-subtle">Coming soon</span> : null}</span>
                    <span className="block truncate text-xs capitalize text-muted">{tool.subcategory ? `${tool.category} · ${tool.subcategory}` : tool.category}</span>
                  </span>
                  <ArrowRight className="size-4 shrink-0 text-subtle" aria-hidden="true" />
                </button>
              </li>
            )) : (
              <li role="presentation">
                <p className="px-4 py-3 text-sm text-muted" aria-live="polite">
                  {normalizedQuery.length < 2 ? "Type at least 2 characters for suggestions." : !suggestionsReady ? "Preparing quick suggestions…" : "No quick matches yet. Search the full tool catalogue."}
                </p>
              </li>
            )}
          </ul>
          <div className="border-t border-border px-2 py-1">
            <button
              type="button"
              className="w-full rounded-lg px-3 py-2 text-left text-xs font-medium text-accent hover:bg-surface-2"
              onClick={() => submitSearch()}
            >
              Search all tools for “{q.trim()}”
            </button>
          </div>
        </div>
      ) : null}
      <UnderProductionDialog
        open={productionTool !== null}
        toolName={productionTool?.name ?? "This tool"}
        onClose={() => setProductionTool(null)}
      />
    </div>
  );
}
