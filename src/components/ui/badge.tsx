import { cn } from "@/lib/utils";

export function Badge({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full bg-surface-2 px-2 py-0.5 text-[11px] font-medium uppercase tracking-wide text-muted",
        className,
      )}
    >
      {children}
    </span>
  );
}
