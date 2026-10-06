import { Link, useRouterState } from "@tanstack/react-router";
import { cn } from "@/lib/utils";

const ITEMS = [
  { to: "/", label: "Home", match: (p: string) => p === "/" },
  { to: "/tools", label: "Tools", match: (p: string) => p.startsWith("/tools") },
  { to: "/search", label: "Search", match: (p: string) => p.startsWith("/search") },
  { to: "/favorites", label: "Saved", match: (p: string) => p.startsWith("/favorites") },
  { to: "/account", label: "Account", match: (p: string) => p.startsWith("/account") || p.startsWith("/history") },
] as const;

export function MobileNav() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-bg/95 pb-[max(env(safe-area-inset-bottom,0px),12px)] backdrop-blur-md md:hidden"
      aria-label="Mobile"
    >
      <ul className="grid grid-cols-5">
        {ITEMS.map((item) => {
          const active = item.match(pathname);
          return (
            <li key={item.to}>
              <Link
                to={item.to}
                className={cn(
                  "flex min-h-16 items-center justify-center px-1 text-xs font-medium",
                  active ? "text-accent" : "text-muted",
                )}
              >
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
