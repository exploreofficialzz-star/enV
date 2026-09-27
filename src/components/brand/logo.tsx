import { Link } from "@tanstack/react-router";
import { cn } from "@/lib/utils";

export function Logo({
  className,
}: {
  className?: string;
}) {
  return (
    <Link
      to="/"
      className={cn("inline-flex shrink-0 items-center text-fg no-underline", className)}
      aria-label="enV home"
    >
      <img src="/logo-header.jpg" alt="enV" className="h-10 w-auto object-contain" />
    </Link>
  );
}
