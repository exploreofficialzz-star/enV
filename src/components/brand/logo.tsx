import { Link } from "@tanstack/react-router";
import { cn } from "@/lib/utils";

export function Logo({
  className,
  image = false,
}: {
  className?: string;
  image?: boolean;
}) {
  return (
    <Link
      to="/"
      className={cn("inline-flex items-center gap-2.5 text-fg no-underline", className)}
      aria-label="enV home"
    >
      {image ? (
        <img
          src="/logo-header-transparent.png"
          alt="enV"
          className="h-14 w-[84px] object-contain sm:h-16 sm:w-24"
        />
      ) : (
        <>
          <svg viewBox="0 0 48 48" className="size-8 shrink-0" aria-hidden="true">
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
          <span className="text-[1.35rem] font-semibold tracking-tight">
            en<span className="text-accent">V</span>
          </span>
        </>
      )}
    </Link>
  );
}
