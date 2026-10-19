import { CATEGORIES } from "@/data/categories";
import { activeCount } from "@/lib/registry";

export function Footer() {
  const count = activeCount();
  return (
    <footer className="mt-auto border-t border-border bg-surface">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-x-4 gap-y-1 px-4 py-3 text-[11px] text-subtle sm:px-6 sm:text-xs">
        <p>© {new Date().getFullYear()} chAs Technologies LLC · enV</p>
        <p className="hidden sm:block">{CATEGORIES.length} categories · {count} live tools</p>
      </div>
    </footer>
  );
}
