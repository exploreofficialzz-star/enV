import { Link } from "@tanstack/react-router";
import { cn } from "@/lib/utils";

export function Logo({
  className,
  markClassName,
  wordmark = true,
}: {
  className?: string;
  markClassName?: string;
  wordmark?: boolean;
}) {
  return (
    <Link
      to="/"
      className={cn("inline-flex items-center gap-2.5 text-fg no-underline", className)}
      aria-label="enV home"
    >
      <svg
        viewBox="0 0 48 48"
        className={cn("size-8 shrink-0", markClassName)}
        aria-hidden="true"
      >
        <path
          d="M8 30.5 24 12.5 40 30.5"
          fill="none"
          stroke="#12A38A"
          strokeWidth="5.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="M12.5 36.5 24 23.5 35.5 36.5"
          fill="none"
          stroke="#1DB87A"
          strokeWidth="5.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      {wordmark ? (
        <span className="text-[1.35rem] font-semibold tracking-tight">
          en<span className="text-accent">V</span>
        </span>
      ) : null}
    </Link>
  );
}
