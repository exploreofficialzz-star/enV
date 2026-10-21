import { useEffect, useMemo, useState } from "react";
import { AppWindow, Check, FolderOpen, Plus, Search, Smartphone, Wrench, X } from "lucide-react";
import { CATEGORY_MAP, CATEGORIES } from "@/data/categories";
import { toolIcon } from "@/lib/icons";
import { getPopularTools, getSearchableTools, getToolById, getToolByPath, toolPath } from "@/lib/registry";
import type { CategoryId } from "@/types/tool";
import { ToolAppIcon } from "@/components/tools/tool-app-icon";

type ShortcutKind = "page" | "tool" | "category";
type ShortcutDraft = {
  kind: ShortcutKind;
  title: string;
  href: string;
  toolId?: string;
  categoryId?: string;
};
type Mode = "current" | "tool" | "category";

const CONTROL_CLASS = "min-h-11 w-full rounded-xl border border-border bg-bg px-3 text-sm text-fg outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/15";
const PRIMARY_BUTTON_CLASS = "inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-accent px-4 py-2.5 text-sm font-semibold text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50";

function getCurrentPageShortcut(pathname: string): ShortcutDraft {
  const cleanPath = pathname.replace(/\/+$/, "") || "/";
  const href = typeof window === "undefined"
    ? cleanPath
    : window.location.pathname + window.location.search + window.location.hash;
  const toolMatch = cleanPath.match(/^\/tools\/([^/]+)\/([^/]+)$/);
  if (toolMatch) {
    const tool = getToolByPath(toolMatch[1], toolMatch[2]);
    if (tool) return { kind: "tool", title: tool.name, href: toolPath(tool), toolId: tool.id };
  }

  const categoryMatch = cleanPath.match(/^\/tools\/([^/]+)$/);
  if (categoryMatch) {
    const category = CATEGORY_MAP[categoryMatch[1] as CategoryId];
    if (category) return { kind: "category", title: category.name, href: "/tools/" + category.id + "/", categoryId: category.id };
  }

  if (cleanPath === "/tools") return { kind: "page", title: "All tools", href };
  if (cleanPath === "/") return { kind: "page", title: "enV Home", href: "/" };

  const lastPart = cleanPath.split("/").filter(Boolean).pop() ?? "Page";
  const documentTitle = typeof document !== "undefined" ? document.title.split(" — ")[0].trim() : "";
  const usableDocumentTitle = documentTitle && !/^(env|browser toolkit)$/i.test(documentTitle);
  const title = usableDocumentTitle
    ? documentTitle
    : lastPart.replace(/[-_]/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
  return { kind: "page", title: title || "Current page", href };
}

/** Always pin a canonical enV URL rather than a local development or preview host. */
function canonicalTargetUrl(path: string): string {
  const currentOrigin = typeof window === "undefined" ? "https://envtools.store" : window.location.origin;
  const candidate = new URL(path, currentOrigin);
  if (candidate.hostname === "envtools.store" || candidate.hostname === "www.envtools.store") {
    return candidate.toString();
  }
  return new URL(candidate.pathname + candidate.search + candidate.hash, "https://envtools.store").toString();
}

function buildPhoneShortcutIntent(title: string, targetUrl: string, fallbackUrl: string): string {
  return "intent://pin-shortcut?title=" + encodeURIComponent(title)
    + "&target=" + encodeURIComponent(targetUrl)
    + "#Intent;scheme=env;package=com.chastech.env;action=android.intent.action.VIEW"
    + ";S.browser_fallback_url=" + encodeURIComponent(fallbackUrl)
    + ";end";
}

function fallbackTargetUrl(targetUrl: string, title: string): string {
  const fallback = new URL(targetUrl);
  fallback.searchParams.set("envShortcutFallback", "1");
  fallback.searchParams.set("envShortcutTitle", title);
  return fallback.toString();
}

function launchPhoneShortcut(shortcut: ShortcutDraft): void {
  const targetUrl = canonicalTargetUrl(shortcut.href);
  const fallbackUrl = fallbackTargetUrl(targetUrl, shortcut.title);
  const isAndroid = typeof navigator !== "undefined" && /Android/i.test(navigator.userAgent);
  const trustedHost = typeof window !== "undefined"
    && (window.location.hostname === "envtools.store" || window.location.hostname === "www.envtools.store");

  if (isAndroid && trustedHost) {
    // The enV Android helper uses Android's pinned-shortcut API, which asks the launcher to confirm.
    // If it is not installed, Chrome falls back to the exact target page for its own shortcut action.
    window.location.assign(buildPhoneShortcutIntent(shortcut.title, targetUrl, fallbackUrl));
    return;
  }

  // iOS and browsers without the helper must use their own OS/browser confirmation UI.
  window.location.assign(fallbackUrl);
}

export function ShortcutManagerDialog({
  open,
  onClose,
  pathname,
}: {
  open: boolean;
  onClose: () => void;
  pathname: string;
}) {
  const [mode, setMode] = useState<Mode>("current");
  const [toolSearch, setToolSearch] = useState("");
  const [categorySearch, setCategorySearch] = useState("");
  const [selectedToolId, setSelectedToolId] = useState(() => getPopularTools(1)[0]?.id ?? "");
  const [selectedCategoryId, setSelectedCategoryId] = useState<CategoryId>("calculators");
  const [notice, setNotice] = useState<string | null>(null);
  const allTools = useMemo(
    () => getSearchableTools().slice().sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" })),
    [],
  );
  const filteredTools = useMemo(() => {
    const query = toolSearch.trim().toLocaleLowerCase();
    if (!query) return getPopularTools(30);
    return allTools.filter((tool) =>
      tool.name.toLocaleLowerCase().includes(query)
      || tool.description.toLocaleLowerCase().includes(query)
      || (CATEGORY_MAP[tool.category]?.name ?? tool.category).toLocaleLowerCase().includes(query),
    ).slice(0, 30);
  }, [allTools, toolSearch]);
  const filteredCategories = useMemo(() => {
    const query = categorySearch.trim().toLocaleLowerCase();
    return CATEGORIES.filter((category) => !query
      || category.name.toLocaleLowerCase().includes(query)
      || category.description.toLocaleLowerCase().includes(query));
  }, [categorySearch]);
  const selectedTool = getToolById(selectedToolId);
  const selectedCategory = CATEGORY_MAP[selectedCategoryId];

  useEffect(() => {
    if (!open) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", closeOnEscape);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", closeOnEscape);
      document.body.style.overflow = previousOverflow;
    };
  }, [open, onClose]);

  useEffect(() => {
    if (open) setNotice(null);
  }, [open, mode]);

  if (!open) return null;

  const currentShortcut = getCurrentPageShortcut(pathname);

  function chosenShortcut(): ShortcutDraft | null {
    if (mode === "current") return getCurrentPageShortcut(pathname);
    if (mode === "tool" && selectedTool) {
      return { kind: "tool", title: selectedTool.name, href: toolPath(selectedTool), toolId: selectedTool.id };
    }
    if (mode === "category" && selectedCategory) {
      return { kind: "category", title: selectedCategory.name, href: "/tools/" + selectedCategory.id + "/", categoryId: selectedCategory.id };
    }
    return null;
  }

  function pinShortcut() {
    const shortcut = chosenShortcut();
    if (!shortcut) {
      setNotice("Choose a tool or category first.");
      return;
    }
    launchPhoneShortcut(shortcut);
  }

  return (
    <div
      className="fixed inset-0 z-[100] flex items-end justify-center bg-black/55 p-0 backdrop-blur-sm sm:items-center sm:p-4"
      onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="shortcut-manager-title"
        className="flex max-h-[92dvh] w-full max-w-xl flex-col overflow-hidden rounded-t-3xl border border-border bg-surface text-fg shadow-2xl sm:rounded-3xl"
      >
        <header className="flex items-start gap-3 border-b border-border px-5 py-4 sm:px-6">
          <span className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-accent-soft text-accent">
            <Smartphone size={22} aria-hidden="true" />
          </span>
          <div className="min-w-0 flex-1">
            <h2 id="shortcut-manager-title" className="text-lg font-semibold tracking-tight sm:text-xl">Add to phone home screen</h2>
            <p className="mt-1 text-sm leading-5 text-muted">Create a launcher shortcut that opens the selected enV page directly.</p>
          </div>
          <button type="button" aria-label="Close shortcut picker" onClick={onClose} className="flex size-9 shrink-0 items-center justify-center rounded-full text-muted transition hover:bg-surface-2 hover:text-fg">
            <X size={19} aria-hidden="true" />
          </button>
        </header>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4 sm:px-6">
          <div role="tablist" aria-label="Shortcut destination" className="grid grid-cols-3 gap-1 rounded-xl bg-surface-2 p-1">
            {([
              { id: "current", label: "This page", icon: AppWindow },
              { id: "tool", label: "Choose tool", icon: Wrench },
              { id: "category", label: "Category", icon: FolderOpen },
            ] as const).map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={mode === id}
                onClick={() => { setMode(id); setNotice(null); }}
                className={"flex min-h-10 items-center justify-center gap-1.5 rounded-lg px-1.5 text-xs font-semibold transition sm:gap-2 sm:text-sm " + (mode === id ? "bg-surface text-fg shadow-sm" : "text-muted hover:text-fg")}
              >
                <Icon size={15} aria-hidden="true" />
                <span>{label}</span>
              </button>
            ))}
          </div>

          {mode === "current" ? (
            <div className="rounded-2xl border border-border bg-bg p-4">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted">Current page shortcut</p>
              <div className="mt-3 flex items-center gap-3">
                <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-accent-soft text-accent">
                  {currentShortcut.kind === "tool" ? <Wrench size={20} aria-hidden="true" /> : currentShortcut.kind === "category" ? <FolderOpen size={20} aria-hidden="true" /> : <AppWindow size={20} aria-hidden="true" />}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold">{currentShortcut.title}</p>
                  <p className="truncate text-xs text-muted">{currentShortcut.href}</p>
                  <p className="mt-1 text-xs text-muted">{currentShortcut.kind === "tool" ? "Opens this individual tool." : currentShortcut.kind === "category" ? "Opens this tool category." : "Opens the page you are viewing."}</p>
                </div>
              </div>
            </div>
          ) : null}

          {mode === "tool" ? (
            <div className="space-y-3">
              <label className="relative block">
                <span className="sr-only">Search for a tool</span>
                <Search size={17} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" aria-hidden="true" />
                <input value={toolSearch} onChange={(event) => setToolSearch(event.target.value)} placeholder="Search tools by name or category" className={CONTROL_CLASS + " pl-9"} autoComplete="off" />
              </label>
              <p className="text-xs text-muted">{toolSearch.trim() ? "Matching tools (showing up to 30)" : "Popular tools — search to find any other tool."}</p>
              <div className="max-h-64 space-y-1 overflow-y-auto rounded-xl border border-border p-1" role="listbox" aria-label="Choose a tool">
                {filteredTools.length ? filteredTools.map((tool) => (
                  <button key={tool.id} type="button" role="option" aria-selected={selectedToolId === tool.id} onClick={() => { setSelectedToolId(tool.id); setNotice(null); }} className={"flex min-h-14 w-full items-center gap-3 rounded-lg px-2.5 py-2 text-left transition " + (selectedToolId === tool.id ? "bg-accent-soft ring-1 ring-inset ring-accent/30" : "hover:bg-surface-2")}>
                    <ToolAppIcon tool={tool} className="size-9" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold">{tool.name}</span>
                      <span className="block truncate text-xs text-muted">{CATEGORY_MAP[tool.category]?.name ?? tool.category}</span>
                    </span>
                    {selectedToolId === tool.id ? <Check size={17} className="shrink-0 text-accent" aria-hidden="true" /> : null}
                  </button>
                )) : <p className="p-4 text-sm text-muted">No tools match that search.</p>}
              </div>
              {selectedTool ? <p className="text-xs text-muted">Selected: <span className="font-semibold text-fg">{selectedTool.name}</span></p> : null}
            </div>
          ) : null}

          {mode === "category" ? (
            <div className="space-y-3">
              <label className="block">
                <span className="sr-only">Search for a category</span>
                <input value={categorySearch} onChange={(event) => setCategorySearch(event.target.value)} placeholder="Find a category" className={CONTROL_CLASS} autoComplete="off" />
              </label>
              <div className="grid max-h-64 grid-cols-1 gap-1 overflow-y-auto rounded-xl border border-border p-1 sm:grid-cols-2" role="listbox" aria-label="Choose a category">
                {filteredCategories.map((category) => {
                  const Icon = toolIcon(category.icon);
                  const isSelected = selectedCategoryId === category.id;
                  return (
                    <button key={category.id} type="button" role="option" aria-selected={isSelected} onClick={() => { setSelectedCategoryId(category.id); setNotice(null); }} className={"flex min-h-12 items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm transition " + (isSelected ? "bg-accent-soft ring-1 ring-inset ring-accent/30" : "hover:bg-surface-2")}>
                      <Icon size={18} className="shrink-0 text-accent" aria-hidden="true" />
                      <span className="min-w-0 flex-1 truncate">{category.name}</span>
                      {isSelected ? <Check size={16} className="shrink-0 text-accent" aria-hidden="true" /> : null}
                    </button>
                  );
                })}
              </div>
              {selectedCategory ? <p className="text-xs text-muted">Selected: <span className="font-semibold text-fg">{selectedCategory.name}</span></p> : null}
            </div>
          ) : null}

          <p className="rounded-xl bg-surface-2 px-3 py-2.5 text-xs leading-5 text-muted">
            Android asks the launcher to confirm the icon when the enV Android helper is installed. If the helper is unavailable, the selected page opens so you can use the browser’s own shortcut action. enV never claims an icon was added before the phone confirms it.
          </p>

          {notice ? <p role="status" aria-live="polite" className="rounded-xl border border-border bg-bg px-3 py-2.5 text-sm leading-5 text-muted">{notice}</p> : null}
        </div>

        <footer className="flex items-center justify-between gap-3 border-t border-border bg-surface px-5 py-4 sm:px-6">
          <button type="button" onClick={onClose} className="min-h-11 rounded-xl px-4 py-2 text-sm font-semibold text-muted transition hover:bg-surface-2 hover:text-fg">Cancel</button>
          <button type="button" onClick={pinShortcut} className={PRIMARY_BUTTON_CLASS}>
            <Plus size={17} aria-hidden="true" /> Add to phone
          </button>
        </footer>
      </section>
    </div>
  );
}

export function ShortcutFallbackDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [platform, setPlatform] = useState<"android" | "ios" | "other">("other");
  const [title, setTitle] = useState("this page");

  useEffect(() => {
    if (typeof navigator !== "undefined") {
      const ua = navigator.userAgent || "";
      setPlatform(/Android/i.test(ua) ? "android" : /iPhone|iPad|iPod/i.test(ua) ? "ios" : "other");
    }
    if (typeof window !== "undefined") {
      const url = new URL(window.location.href);
      if (url.searchParams.get("envShortcutFallback") === "1") {
        setTitle(url.searchParams.get("envShortcutTitle") || "this page");
      }
    }
  }, []);

  if (!open) return null;

  function dismiss() {
    if (typeof window !== "undefined") {
      const url = new URL(window.location.href);
      url.searchParams.delete("envShortcutFallback");
      url.searchParams.delete("envShortcutTitle");
      window.history.replaceState(window.history.state, "", url.pathname + url.search + url.hash);
    }
    onClose();
  }

  const instruction = platform === "android"
    ? "Chrome must confirm launcher shortcuts. Open Chrome’s ⋮ menu and choose “Install and create shortcut” to add " + title + " to your phone."
    : platform === "ios"
      ? "Open this page in Safari, tap Share, then choose “Add to Home Screen” to add " + title + " to your phone."
      : "Use your phone browser’s Share or menu action to add " + title + " to the phone Home Screen.";

  return (
    <div className="fixed inset-0 z-[110] flex items-end justify-center bg-black/55 p-0 backdrop-blur-sm sm:items-center sm:p-4" onMouseDown={(event) => { if (event.target === event.currentTarget) dismiss(); }}>
      <section role="dialog" aria-modal="true" aria-labelledby="shortcut-fallback-title" className="w-full max-w-md rounded-t-3xl border border-border bg-surface p-5 text-fg shadow-2xl sm:rounded-3xl sm:p-6">
        <div className="flex items-start gap-3">
          <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-accent-soft text-accent"><Smartphone size={21} aria-hidden="true" /></span>
          <div className="min-w-0 flex-1">
            <h2 id="shortcut-fallback-title" className="text-lg font-semibold">Finish adding to your phone</h2>
            <p className="mt-2 text-sm leading-6 text-muted">{instruction}</p>
          </div>
        </div>
        <div className="mt-5 flex justify-end">
          <button type="button" onClick={dismiss} className={PRIMARY_BUTTON_CLASS}>Got it</button>
        </div>
      </section>
    </div>
  );
}
