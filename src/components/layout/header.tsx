import { Link, useRouterState } from "@tanstack/react-router";
import { Heart, Moon, Search, Sun } from "lucide-react";
import { Logo } from "@/components/brand/logo";
import { Button } from "@/components/ui/button";
import { usePrefs } from "@/lib/storage";
import { cn } from "@/lib/utils";

const NAV = [
  { to: "/tools", label: "Tools" },
  { to: "/search", label: "Search" },
  { to: "/pricing", label: "Pricing" },
] as const;

export function Header() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const theme = usePrefs((s) => s.theme);
  const toggleTheme = usePrefs((s) => s.toggleTheme);

  return (
    <header className="sticky top-0 z-30 border-b border-border bg-bg/90 backdrop-blur-md">
      <div className="mx-auto flex h-14 max-w-6xl items-center gap-4 px-4 sm:h-16 sm:px-6">
        <Logo wordmark={false} />
        <nav className="ml-2 hidden items-center gap-1 md:flex" aria-label="Primary">
          {NAV.map((item) => (
            <Link
              key={item.to}
              to={item.to}
              className={cn(
                "rounded-md px-3 py-2 text-sm font-medium text-muted transition-colors hover:bg-surface-2 hover:text-fg",
                pathname === item.to || pathname.startsWith(item.to)
                  ? "text-fg"
                  : "",
              )}
            >
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-1">
          <Link
            to="/search"
            className="hidden items-center gap-2 rounded-full bg-surface px-3 py-2 text-sm text-subtle shadow-[var(--shadow-border)] hover:text-fg sm:inline-flex"
            aria-label="Search tools"
          >
            <Search className="size-4" />
            <span className="pr-8">Search tools</span>
            <kbd className="hidden rounded bg-surface-2 px-1.5 text-[10px] font-medium text-muted lg:inline">
              /
            </kbd>
          </Link>
          <Link
            to="/favorites"
            className="inline-flex size-11 items-center justify-center rounded-md text-muted hover:bg-surface-2 hover:text-fg"
            aria-label="Favorites"
          >
            <Heart className="size-4" />
          </Link>
          <Button
            variant="ghost"
            size="icon"
            onClick={toggleTheme}
            aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
          >
            {theme === "dark" ? <Sun className="size-4" /> : <Moon className="size-4" />}
          </Button>
        </div>
      </div>
    </header>
  );
}
