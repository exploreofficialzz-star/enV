import { Link } from "@tanstack/react-router";
import { cn } from "@/lib/utils";

export function Logo({
  className,
  wordmark = true,
}: {
  className?: string;
  wordmark?: boolean;
}) {
  return (
    <Link
      to="/"
      className={cn("inline-flex shrink-0 items-center text-fg no-underline", className)}
      aria-label="enV home"
    >
      <img src="/logo-icon.png" alt="" aria-hidden="true" className="size-8 object-contain" />
      {wordmark ? (
        <span className="text-[1.35rem] font-semibold tracking-tight">
          en<span className="text-accent">V</span>
        </span>
      ) : null}
    </Link>
  );
}
