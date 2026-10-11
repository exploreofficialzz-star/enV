import { Link } from "@tanstack/react-router";
import { Heart, Home, LayoutGrid, MoreVertical } from "lucide-react";

export function Header() {
  return (
    <header className="sticky top-0 z-30 bg-bg/90 backdrop-blur-md">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-3 px-4 sm:h-16 sm:px-6">
        <Link
          to="/"
          aria-label="Home"
          title="Home"
          className="inline-flex size-10 items-center justify-center rounded-lg text-muted transition-colors hover:bg-surface-2 hover:text-fg"
        >
          <Home className="size-6" strokeWidth={2.4} />
        </Link>

        <nav className="ml-auto flex items-center gap-1" aria-label="Quick links">
          <Link
            to="/favorites"
            aria-label="Saved tools"
            title="Saved tools"
            className="inline-flex size-10 items-center justify-center rounded-lg text-muted transition-colors hover:bg-surface-2 hover:text-fg"
          >
            <Heart className="size-6" strokeWidth={2.4} />
          </Link>
          <Link
            to="/tools"
            search={{ q: "" }}
            aria-label="Tools"
            title="Tools"
            className="inline-flex size-10 items-center justify-center rounded-lg text-muted transition-colors hover:bg-surface-2 hover:text-fg"
          >
            <LayoutGrid className="size-6" strokeWidth={2.4} />
          </Link>
          <details className="group relative">
            <summary
              aria-label="More options"
              title="More options"
              className="flex size-10 list-none cursor-pointer items-center justify-center rounded-lg text-muted transition-colors hover:bg-surface-2 hover:text-fg [&::-webkit-details-marker]:hidden"
            >
              <MoreVertical className="size-6" strokeWidth={2.4} />
            </summary>
            <div className="absolute right-0 top-full z-50 mt-2 min-w-44 rounded-xl border border-border bg-surface p-1.5 shadow-xl">
              <Link className="block rounded-lg px-3 py-2 text-sm hover:bg-surface-2" to="/assistant">AI assistant</Link>
              <Link className="block rounded-lg px-3 py-2 text-sm hover:bg-surface-2" to="/account">Account</Link>
              <Link className="block rounded-lg px-3 py-2 text-sm hover:bg-surface-2" to="/search" search={{ q: "" }}>Search tools</Link>
              <Link className="block rounded-lg px-3 py-2 text-sm hover:bg-surface-2" to="/pricing">Pricing</Link>
            </div>
          </details>
        </nav>
      </div>
    </header>
  );
}
