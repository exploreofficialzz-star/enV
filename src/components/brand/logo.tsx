import { Link } from "@tanstack/react-router";
import { cn } from "@/lib/utils";

type LogoSize = "header" | "search" | "hero";

/** The canonical enV lockup used throughout the browser application. */
export function Logo({ className, size = "header" }: { className?: string; size?: LogoSize }) {
  const homeHero = size === "hero";
  const imageSize = {
    header: "h-14 w-[84px] sm:h-16 sm:w-24",
    search: "h-8 w-12",
    hero: "h-[62px] w-[157px] sm:h-[70px] sm:w-[180px]",
  }[size];

  return (
    <Link
      to="/"
      className={cn("inline-flex shrink-0 items-center justify-center text-fg no-underline", className)}
      aria-label="enV home"
    >
      <img
        src={homeHero ? "/logo-home-transparent.png" : "/logo-header-transparent.png"}
        alt=""
        width={homeHero ? 813 : 960}
        height={homeHero ? 317 : 640}
        className={cn("object-contain dark:hidden", imageSize)}
      />
      <img
        src={homeHero ? "/logo-home-dark.png" : "/logo-header-dark.png"}
        alt=""
        width={homeHero ? 813 : 960}
        height={homeHero ? 317 : 640}
        className={cn("hidden object-contain dark:block", imageSize)}
      />
    </Link>
  );
}
