import { Link, useRouterState } from "@tanstack/react-router";
import { Heart, Home, LayoutGrid, Search, User } from "lucide-react";
import { cn } from "@/lib/utils";

const ITEMS = [
  { to: "/", label: "Home", icon: Home, match: (p: string) => p === "/" },
  {
    to: "/tools",
    label: "Tools",
    icon: LayoutGrid,
    match: (p: string) => p.startsWith("/tools"),
  },
  { to: "/search", label: "Search", icon: Search, match: (p: string) => p.startsWith("/search") },
  {
    to: "/favorites",
    label: "Saved",
    icon: Heart,
    match: (p: string) => p.startsWith("/favorites"),
  },
  {
    to: "/account",
    label: "Account",
    icon: User,
    match: (p: string) => p.startsWith("/account") || p.startsWith("/history"),
  },
] as const;

export function MobileNav() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-bg/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-md md:hidden"
      aria-label="Mobile"
    >
      <ul className="grid grid-cols-5">
        {ITEMS.map((item) => {
          const active = item.match(pathname);
          const Icon = item.icon;
          return (
            <li key={item.to}>
              <Link
                to={item.to}
                className={cn(
                  "flex min-h-14 flex-col items-center justify-center gap-1 text-[11px] font-medium",
                  active ? "text-accent" : "text-muted",
                )}
              >
                <Icon className="size-5" strokeWidth={active ? 2.2 : 1.8} />
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
