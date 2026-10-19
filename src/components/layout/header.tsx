import { Link } from "@tanstack/react-router";
import { Heart, Home, LayoutGrid, MoreVertical } from "lucide-react";

const MENU_GROUPS = [
  { title: "Product", links: [
    { to: "/about", label: "About" }, { to: "/tools", label: "Tools" },
    { to: "/pricing", label: "Pricing" }, { to: "/tokens", label: "Token guide" },
  ] },
  { title: "Resources", links: [
    { to: "/help", label: "Help center" }, { to: "/blog", label: "Blog & guides" },
    { to: "/contact", label: "Contact" },
  ] },
] as const;

function closeMenu(event: React.MouseEvent<HTMLAnchorElement>) {
  event.currentTarget.closest("details")?.removeAttribute("open");
}

export function Header() {
  return (
    <header className="sticky top-0 z-30 bg-bg/95 backdrop-blur-md">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-3 px-4 sm:h-16 sm:px-6">
        <Link to="/" aria-label="Home" title="Home" className="inline-flex size-10 items-center justify-center rounded-lg text-muted transition-colors hover:bg-surface-2 hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent">
          <Home className="size-6" strokeWidth={2.4} />
        </Link>
        <nav className="ml-auto flex items-center gap-1" aria-label="Quick links">
          <Link to="/favorites" aria-label="Saved tools" title="Saved tools" className="inline-flex size-10 items-center justify-center rounded-lg text-muted transition-colors hover:bg-surface-2 hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent">
            <Heart className="size-6" strokeWidth={2.4} />
          </Link>
          <Link to="/tools" search={{ q: "" }} aria-label="Tools" title="Tools" className="inline-flex size-10 items-center justify-center rounded-lg text-muted transition-colors hover:bg-surface-2 hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent">
            <LayoutGrid className="size-6" strokeWidth={2.4} />
          </Link>
          <details className="group relative">
            <summary aria-label="More options" title="More options" className="flex size-10 list-none cursor-pointer items-center justify-center rounded-lg text-muted transition-colors hover:bg-surface-2 hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent [&::-webkit-details-marker]:hidden">
              <MoreVertical className="size-6" strokeWidth={2.4} />
            </summary>
            <div className="absolute right-0 top-full z-50 mt-2 max-h-[min(78dvh,760px)] w-[min(88vw,520px)] overflow-y-auto rounded-[2rem] border border-border bg-surface p-4 shadow-2xl" aria-label="More navigation">
              <div className="border-b border-border px-1 py-2">
                <Link to="/account" onClick={closeMenu} className="block min-h-12 rounded-xl px-4 py-3 text-base text-fg transition-colors hover:bg-surface-2">Account</Link>
                <Link to="/wallet" onClick={closeMenu} className="block min-h-12 rounded-xl px-4 py-3 text-base text-fg transition-colors hover:bg-surface-2">Wallet</Link>
              </div>
              {MENU_GROUPS.map((group) => (
                <section key={group.title} className="border-b border-border px-1 py-3 last:border-b-0" aria-label={group.title}>
                  <h2 className="px-4 pb-2 text-xs font-semibold uppercase tracking-[0.16em] text-subtle">{group.title}</h2>
                  {group.links.map((link) => (
                    <Link key={link.to} to={link.to} onClick={closeMenu} className="block min-h-12 rounded-xl px-4 py-3 text-base text-muted transition-colors hover:bg-surface-2 hover:text-fg">{link.label}</Link>
                  ))}
                </section>
              ))}
            </div>
          </details>
        </nav>
      </div>
    </header>
  );
}
