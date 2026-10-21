import { Link, useRouterState } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import {
  Bell,
  Check,
  Download,
  Heart,
  Home,
  LayoutGrid,
  LifeBuoy,
  MessageCircle,
  Monitor,
  MoreVertical,
  Settings as SettingsIcon,
  Smartphone,
  Tablet,
  UserRound,
} from "lucide-react";
import { useCurrentUser } from "@/lib/auth/use-current-user";
import { usePrefs } from "@/lib/storage";
import { ShortcutManagerDialog, ShortcutFallbackDialog } from "@/components/layout/shortcut-manager-dialog";

const MENU_ITEM_BASE_CLASS = "flex min-h-8 w-full items-center rounded-lg px-3 py-1 text-sm leading-5 text-muted transition-colors hover:bg-surface-2 hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent";
const MENU_ITEM_CLASS = `${MENU_ITEM_BASE_CLASS} gap-2.5`;
const MENU_VIEW_ITEM_CLASS = `${MENU_ITEM_BASE_CLASS} justify-start gap-0`;
const MENU_HEADING_CLASS = "px-3 pb-1 text-[0.68rem] font-semibold uppercase tracking-[0.12em] text-accent";

const MENU_GROUPS = [
  { title: "Product", links: [
    { to: "/about", label: "About" }, { to: "/tools", label: "Tools" },
    { to: "/pricing", label: "Pricing" }, { to: "/tokens/guide", label: "Token guide" },
  ] },
  { title: "Resources", links: [
    { to: "/help", label: "Help center" }, { to: "/blog", label: "Blog & guides" },
    { to: "/contact", label: "Contact" },
  ] },
] as const;

function closeMenu(event: React.MouseEvent<HTMLElement>) {
  event.currentTarget.closest("details")?.removeAttribute("open");
}

export function Header() {
  const pathname = useRouterState({ select: state => state.location.pathname });
  const isWalletPage = pathname === "/wallet";
  const user = useCurrentUser();
  const [showNotifications, setShowNotifications] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuTop, setMenuTop] = useState(64);
  const [shortcutManagerOpen, setShortcutManagerOpen] = useState(false);
  const [shortcutFallbackOpen, setShortcutFallbackOpen] = useState(false);
  const menuRef = useRef<HTMLDetailsElement>(null);
  const menuPanelRef = useRef<HTMLDivElement>(null);
  const viewMode = usePrefs((state) => state.viewMode);
  const setViewMode = usePrefs((state) => state.setViewMode);

  function chooseViewMode(mode: "mobile" | "tablet" | "desktop") {
    setViewMode(mode);
  }

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("envShortcutFallback") === "1") setShortcutFallbackOpen(true);
  }, []);

  useEffect(() => {
    const closeFromOutside = (event: PointerEvent) => {
      const menu = menuRef.current;
      if (menu?.open && !menu.contains(event.target as Node)) {
        menu.removeAttribute("open");
        setMenuOpen(false);
      }
    };
    const closeWithEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      const menu = menuRef.current;
      if (!menu?.open) return;
      menu.removeAttribute("open");
      setMenuOpen(false);
      menu.querySelector("summary")?.focus();
    };
    document.addEventListener("pointerdown", closeFromOutside);
    document.addEventListener("keydown", closeWithEscape);
    return () => {
      document.removeEventListener("pointerdown", closeFromOutside);
      document.removeEventListener("keydown", closeWithEscape);
    };
  }, []);

  useEffect(() => {
    if (!menuOpen) return;
    const updatePosition = () => {
      const anchor = menuRef.current?.querySelector("summary");
      const panel = menuPanelRef.current;
      if (!anchor || !panel) return;
      const preferredTop = anchor.getBoundingClientRect().bottom + 8;
      const maximumTop = window.innerHeight - panel.getBoundingClientRect().height - 8;
      setMenuTop(Math.max(8, Math.min(preferredTop, maximumTop)));
    };
    updatePosition();
    window.addEventListener("resize", updatePosition);
    return () => window.removeEventListener("resize", updatePosition);
  }, [menuOpen]);

  return (
    <>
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
              <details ref={menuRef} className="group relative" onToggle={(event) => setMenuOpen(event.currentTarget.open)}>
                <summary aria-label="More options" title="More options" aria-expanded={menuOpen} className="flex size-10 list-none cursor-pointer items-center justify-center rounded-lg text-muted transition-colors hover:bg-surface-2 hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent [&::-webkit-details-marker]:hidden">
                  <MoreVertical className="size-6" strokeWidth={2.4} />
                </summary>
                <div ref={menuPanelRef} role="group" aria-label="More navigation" style={{ top: menuTop }} className="fixed right-3 z-50 w-[15.5rem] max-w-[calc(100vw_-_5rem)] sm:w-80 sm:max-w-[calc(100vw_-_4rem)] rounded-2xl border border-border bg-surface p-2 shadow-2xl">
                  <section className="border-b border-border px-1 py-1" aria-label="Account">
                    <Link to="/account" onClick={(event) => { closeMenu(event); setMenuOpen(false); }} className={MENU_ITEM_CLASS}>Account</Link>
                    <Link to="/wallet" onClick={(event) => { closeMenu(event); setMenuOpen(false); }} className={MENU_ITEM_CLASS}>Wallet</Link>
                  </section>
                  <section className="border-b border-border px-1 py-1" aria-label="View mode">
                    <h2 className={MENU_HEADING_CLASS}>View mode</h2>
                    <button type="button" aria-pressed={viewMode === "mobile"} onClick={(event) => { chooseViewMode("mobile"); closeMenu(event); setMenuOpen(false); }} className={MENU_VIEW_ITEM_CLASS}>
                      <span className="flex min-w-0 flex-1 items-center gap-0"><Smartphone size={16} className="shrink-0" aria-hidden="true" /><span>Mobile view</span></span>
                      {viewMode === "mobile" ? <Check size={15} className="text-accent" aria-hidden="true" /> : null}
                    </button>
                    <button type="button" aria-pressed={viewMode === "tablet"} onClick={(event) => { chooseViewMode("tablet"); closeMenu(event); setMenuOpen(false); }} className={MENU_VIEW_ITEM_CLASS}>
                      <span className="flex min-w-0 flex-1 items-center gap-0"><Tablet size={16} className="shrink-0" aria-hidden="true" /><span>Tablet view</span></span>
                      {viewMode === "tablet" ? <Check size={15} className="text-accent" aria-hidden="true" /> : null}
                    </button>
                    <button type="button" aria-pressed={viewMode === "desktop"} onClick={(event) => { chooseViewMode("desktop"); closeMenu(event); setMenuOpen(false); }} className={MENU_VIEW_ITEM_CLASS}>
                      <span className="flex min-w-0 flex-1 items-center gap-0"><Monitor size={16} className="shrink-0" aria-hidden="true" /><span>Desktop view</span></span>
                      {viewMode === "desktop" ? <Check size={15} className="text-accent" aria-hidden="true" /> : null}
                    </button>
                  </section>
                  {MENU_GROUPS.map((group) => (
                    <section key={group.title} className="border-b border-border px-1 py-1 last:border-b-0" aria-label={group.title}>
                      <h2 className={MENU_HEADING_CLASS}>{group.title}</h2>
                      {group.links.map((link) => (
                        <Link key={link.to} to={link.to} onClick={(event) => { closeMenu(event); setMenuOpen(false); }} className={MENU_ITEM_CLASS}>{link.label}</Link>
                      ))}
                    </section>
                  ))}
                  <section className="px-1 py-1" aria-label="Preferences and support">
                    <h2 className={MENU_HEADING_CLASS}>Preferences &amp; support</h2>
                    <button type="button" onClick={(event) => { closeMenu(event); setMenuOpen(false); setShortcutManagerOpen(true); }} className={MENU_ITEM_CLASS}><Download size={16} aria-hidden="true" /><span>Add to phone home screen</span></button>
                    <Link to="/settings" onClick={(event) => { closeMenu(event); setMenuOpen(false); }} className={MENU_ITEM_CLASS}><SettingsIcon size={16} aria-hidden="true" /><span>Settings</span></Link>
                    <Link to="/help-feedback" onClick={(event) => { closeMenu(event); setMenuOpen(false); }} className={MENU_ITEM_CLASS}><MessageCircle size={16} aria-hidden="true" /><span>Help & feedback</span></Link>
                  </section>
                </div>
              </details>
            </nav>
          </>
        )}
      </div>
      </header>
      <ShortcutManagerDialog open={shortcutManagerOpen} onClose={() => setShortcutManagerOpen(false)} pathname={pathname} />
      <ShortcutFallbackDialog open={shortcutFallbackOpen} onClose={() => setShortcutFallbackOpen(false)} />
    </>
  );
}
