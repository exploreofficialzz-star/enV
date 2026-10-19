import { Link, useRouterState } from "@tanstack/react-router";
import { useState } from "react";
import { Bell, Heart, Home, LayoutGrid, MoreVertical, UserRound } from "lucide-react";
import { useCurrentUser } from "@/lib/auth/use-current-user";

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
  const pathname = useRouterState({ select: state => state.location.pathname });
  const isWalletPage = pathname === "/wallet";
  const user = useCurrentUser();
  const [showNotifications, setShowNotifications] = useState(false);

  return (
    <header className="sticky top-0 z-30 bg-bg/95 backdrop-blur-md">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-3 px-4 sm:h-16 sm:px-6">
        {isWalletPage ? (
          <>
            <h1 className="text-xl font-semibold tracking-tight text-fg sm:text-2xl">Wallet</h1>
            <nav className="ml-auto flex items-center gap-2" aria-label="Wallet actions">
              <div className="relative">
                <button type="button" aria-label="Notifications" title="Notifications" aria-expanded={showNotifications} onClick={() => setShowNotifications(value => !value)} className="relative inline-flex size-10 items-center justify-center rounded-full border border-border bg-surface text-fg transition hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent">
                  <Bell className="size-5" strokeWidth={2.2} aria-hidden="true" />
                  <span className="absolute right-2 top-2 size-2 rounded-full bg-rose-500 ring-2 ring-bg" aria-hidden="true" />
                </button>
                {showNotifications ? <div role="status" className="absolute right-0 top-full z-50 mt-2 w-64 rounded-2xl border border-border bg-surface p-4 text-sm text-fg shadow-xl"><p className="font-semibold">Notifications</p><p className="mt-1 text-muted">You’re all caught up.</p></div> : null}
              </div>
              <Link to="/account" aria-label="Profile and account" title={user?.displayName ?? "Profile"} className="inline-flex size-10 items-center justify-center overflow-hidden rounded-full border border-border bg-surface-2 text-fg transition hover:bg-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent">
                {user?.profileImageUrl ? <img src={user.profileImageUrl} alt="" className="size-full object-cover" /> : <UserRound className="size-5" strokeWidth={2.1} aria-hidden="true" />}
              </Link>
            </nav>
          </>
        ) : (
          <>
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
          </>
        )}
      </div>
    </header>
  );
}
