import { Link } from "@tanstack/react-router";
import { cn } from "@/lib/utils";

/** The single canonical enV wordmark used by all application brand placements. */
export function Logo({ className }: { className?: string }) {
  return (
    <Link
      to="/"
      className={cn("inline-flex items-center text-fg no-underline", className)}
      aria-label="enV home"
    >
      <img
        src="/logo-header-transparent.png"
        alt=""
        width={96}
        height={64}
        className="h-14 w-[84px] object-contain sm:h-16 sm:w-24"
      />
    </Link>
  );
}
