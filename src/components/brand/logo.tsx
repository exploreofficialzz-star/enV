import { Link } from "@tanstack/react-router";
import { cn } from "@/lib/utils";

type LogoSize = "header" | "search" | "hero";

/** The canonical enV lockup used throughout the browser application. */
export function Logo({ className, size = "header" }: { className?: string; size?: LogoSize }) {
  const imageSize = {
    header: "h-14 w-[84px] sm:h-16 sm:w-24",
    search: "h-8 w-12",
    hero: "h-[168px] w-[252px] sm:h-[192px] sm:w-[288px]",
  }[size];

  return (
    <Link
      to="/"
      className={cn("inline-flex shrink-0 items-center justify-center text-fg no-underline", className)}
      aria-label="enV home"
    >
      <img
        src="/logo-header-transparent.png"
        alt=""
        width={252}
        height={168}
        className={cn("object-contain dark:hidden", imageSize)}
      />
      <img
        src="/logo-header-dark.png"
        alt=""
        width={252}
        height={168}
        className={cn("hidden object-contain dark:block", imageSize)}
      />
    </Link>
  );
}
