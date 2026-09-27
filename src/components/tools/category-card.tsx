import { Link } from "@tanstack/react-router";
import { toolIcon } from "@/lib/icons";
import type { CategoryMeta } from "@/types/tool";

export function CategoryCard({
  category,
  count,
}: {
  category: CategoryMeta;
  count: number;
}) {
  const Icon = toolIcon(category.icon);
  return (
    <Link
      to="/tools/$category"
      params={{ category: category.id }}
      className="flex items-start gap-3 rounded-xl bg-surface p-4 shadow-[var(--shadow-border)] transition-transform duration-150 hover:-translate-y-0.5"
    >
      <span className="inline-flex size-10 items-center justify-center rounded-md bg-accent-soft text-accent">
        <Icon className="size-4" />
      </span>
      <span className="min-w-0">
        <span className="block text-sm font-semibold text-fg">{category.name}</span>
        <span className="mt-0.5 block text-xs text-muted">{category.blurb}</span>
        <span className="mt-2 block text-[11px] font-medium uppercase tracking-wide text-subtle">
          {count} tools
        </span>
      </span>
    </Link>
  );
}
