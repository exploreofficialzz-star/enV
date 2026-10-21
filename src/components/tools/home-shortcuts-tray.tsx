import { useEffect, useState } from "react";
import { AppWindow, FolderOpen, Plus, X } from "lucide-react";
import { CATEGORY_MAP } from "@/data/categories";
import { toolIcon } from "@/lib/icons";
import { getToolById } from "@/lib/registry";
import {
  HOME_SHORTCUTS_CHANGED_EVENT,
  readHomeShortcuts,
  removeHomeShortcut,
  requestShortcutManager,
  type HomeShortcut,
} from "@/lib/home-shortcuts";
import { ToolAppIcon } from "@/components/tools/tool-app-icon";

function ShortcutGlyph({ shortcut }: { shortcut: HomeShortcut }) {
  if (shortcut.kind === "tool" && shortcut.toolId) {
    const tool = getToolById(shortcut.toolId);
    if (tool) return <ToolAppIcon tool={tool} className="size-11" />;
  }
  if (shortcut.kind === "category" && shortcut.categoryId) {
    const category = CATEGORY_MAP[shortcut.categoryId as keyof typeof CATEGORY_MAP];
    if (category) {
      const Icon = toolIcon(category.icon);
      return <span className="flex size-11 items-center justify-center rounded-[14px] bg-accent-soft text-accent"><Icon size={22} aria-hidden="true" /></span>;
    }
  }
  return <span className="flex size-11 items-center justify-center rounded-[14px] bg-accent-soft text-accent"><AppWindow size={22} aria-hidden="true" /></span>;
}

export function HomeShortcutsTray() {
  const [shortcuts, setShortcuts] = useState<HomeShortcut[]>([]);

  useEffect(() => {
    const refresh = () => setShortcuts(readHomeShortcuts());
    refresh();
    window.addEventListener(HOME_SHORTCUTS_CHANGED_EVENT, refresh);
    window.addEventListener("storage", refresh);
    return () => {
      window.removeEventListener(HOME_SHORTCUTS_CHANGED_EVENT, refresh);
      window.removeEventListener("storage", refresh);
    };
  }, []);

  return (
    <section aria-label="Your shortcuts" className="mx-auto mt-4 w-full max-w-3xl rounded-[28px] border border-border bg-surface p-3 text-left shadow-[var(--shadow-border)] sm:p-4">
      <div className="flex items-center justify-between gap-3 px-1">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-fg sm:text-base">Your shortcuts</h2>
          <p className="mt-0.5 text-xs text-muted">Your favorite enV pages, ready in one tap.</p>
        </div>
        <button type="button" onClick={requestShortcutManager} className="inline-flex min-h-9 shrink-0 items-center gap-1.5 rounded-xl border border-border px-3 py-1.5 text-xs font-semibold text-accent transition hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent">
          <Plus size={15} aria-hidden="true" /> Add
        </button>
      </div>

      {shortcuts.length ? (
        <div className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-6">
          {shortcuts.map((shortcut) => (
            <div key={shortcut.id} className="group relative min-w-0 rounded-2xl border border-transparent p-2 text-center transition hover:border-border hover:bg-surface-2">
              <a href={shortcut.href} aria-label={`Open shortcut: ${shortcut.title}`} className="flex min-h-[92px] min-w-0 flex-col items-center justify-center gap-2 rounded-xl px-1 py-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent">
                <ShortcutGlyph shortcut={shortcut} />
                <span className="w-full truncate text-[11px] font-semibold leading-4 text-muted group-hover:text-fg">{shortcut.title}</span>
                <span className="inline-flex items-center gap-1 text-[9px] font-medium uppercase tracking-wide text-subtle">
                  {shortcut.kind === "tool" ? "Tool" : shortcut.kind === "category" ? <><FolderOpen size={10} aria-hidden="true" /> Category</> : "Page"}
                </span>
              </a>
              <button type="button" onClick={() => removeHomeShortcut(shortcut.id)} aria-label={`Remove ${shortcut.title} shortcut`} title="Remove shortcut" className="absolute right-1 top-1 flex size-7 items-center justify-center rounded-full bg-surface text-muted opacity-100 shadow-sm ring-1 ring-border transition hover:text-danger focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent sm:opacity-0 sm:group-hover:opacity-100">
                <X size={13} aria-hidden="true" />
              </button>
            </div>
          ))}
        </div>
      ) : (
        <button type="button" onClick={requestShortcutManager} className="mt-3 flex min-h-20 w-full items-center justify-center gap-3 rounded-2xl border border-dashed border-border px-4 py-4 text-left transition hover:border-accent/50 hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-surface-2 text-accent"><Plus size={19} aria-hidden="true" /></span>
          <span className="min-w-0">
            <span className="block text-sm font-semibold text-fg">Create your first shortcut</span>
            <span className="mt-0.5 block text-xs leading-5 text-muted">Pin a tool, category, or the page you are viewing.</span>
          </span>
        </button>
      )}
    </section>
  );
}
