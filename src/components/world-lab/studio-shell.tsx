import { useEffect, useId, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowLeft, FlaskConical, FolderOpen, Hammer, Info, LineChart, X } from "lucide-react";

export type StudioGroupId = "project" | "build" | "experiments" | "results";

const GROUPS: ReadonlyArray<{ id: StudioGroupId; label: string; Icon: typeof FolderOpen }> = [
  { id: "project", label: "project", Icon: FolderOpen },
  { id: "build", label: "build", Icon: Hammer },
  { id: "experiments", label: "experiment", Icon: FlaskConical },
  { id: "results", label: "results", Icon: LineChart },
];

/**
 * Quiet explanation. The full sentence stays in the document (readable by screen
 * readers and tests) but is visually reduced to a single tappable "i" until opened,
 * so panels read like a studio inspector instead of a page of prose.
 */
export function StudioNote({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  const root = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (event: PointerEvent) => {
      if (root.current && !root.current.contains(event.target as Node)) setOpen(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", close);
      document.removeEventListener("keydown", escape);
    };
  }, [open]);

  return (
    <span ref={root} className="wl-note" data-open={open ? "true" : "false"}>
      <button
        type="button"
        className="wl-note__btn"
        aria-expanded={open}
        aria-controls={id}
        aria-label="About this"
        title="About this"
        onClick={() => setOpen((value) => !value)}
      >
        <Info aria-hidden="true" size={15} strokeWidth={2} />
      </button>
      <span id={id} role="note" className={open ? "wl-note__bubble" : "sr-only"}>
        {children}
      </span>
    </span>
  );
}

type RailProps = {
  open: boolean;
  active: StudioGroupId | null;
  onSelect: (group: StudioGroupId) => void;
};

/** Icon-only rail: left column on tablet and desktop, bottom bar on phones. */
export function StudioRail({ open, active, onSelect }: RailProps) {
  return (
    <nav className="wl-rail" aria-label="World Lab tools">
      {GROUPS.map(({ id, label, Icon }) => (
        <button
          key={id}
          type="button"
          className="wl-icon-btn"
          data-active={open && active === id ? "true" : "false"}
          data-group={id}
          aria-label={`Open ${label} tools`}
          aria-expanded={open && active === id}
          title={label[0].toUpperCase() + label.slice(1)}
          onClick={() => onSelect(id)}
        >
          <Icon aria-hidden="true" size={22} strokeWidth={1.9} />
        </button>
      ))}
    </nav>
  );
}

type DrawerProps = {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
};

/** Right panel on tablet/desktop, bottom sheet on phones. Content stays mounted. */
export function StudioDrawer({ open, onClose, children }: DrawerProps) {
  const drawer = useRef<HTMLElement>(null);

  useEffect(() => {
    const node = drawer.current;
    if (!node) return;
    if (open) node.removeAttribute("inert");
    else node.setAttribute("inert", "");
  }, [open]);

  return (
    <aside
      ref={drawer}
      className="wl-drawer"
      data-open={open ? "true" : "false"}
      aria-label="World Lab tool panel"
      aria-hidden={open ? undefined : true}
    >
      <div className="wl-drawer__grip" aria-hidden="true" />
      <button type="button" className="wl-icon-btn wl-drawer__close" aria-label="Close tools" title="Close" onClick={onClose}>
        <X aria-hidden="true" size={20} strokeWidth={2} />
      </button>
      <div className="wl-drawer__body" data-wl-scroll="true">
        {children}
      </div>
    </aside>
  );
}

/** One named block of tools inside the drawer; the rail scrolls to it. */
export function StudioGroup({ id, children }: { id: StudioGroupId; children: ReactNode }) {
  return (
    <section className="wl-group" data-wl-group={id} aria-label={`${id} tools`}>
      {children}
    </section>
  );
}

export function StudioBack() {
  return (
    <Link to="/" className="wl-icon-btn wl-back" aria-label="Leave World Lab" title="Leave">
      <ArrowLeft aria-hidden="true" size={20} strokeWidth={2} />
    </Link>
  );
}

export function scrollToStudioGroup(root: HTMLElement | null, id: StudioGroupId) {
  const target = root?.querySelector<HTMLElement>(`[data-wl-group="${id}"]`);
  target?.scrollIntoView({ block: "start", behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
}

type HoldProps = {
  label: string;
  onStep: () => void;
  children: ReactNode;
  /** Fire once per press instead of repeating while held. */
  once?: boolean;
};

/** Press-and-hold control for looking and walking; a single tap or key press takes one step. */
export function StudioHoldButton({ label, onStep, children, once = false }: HoldProps) {
  const timer = useRef<number | null>(null);
  const step = useRef(onStep);
  step.current = onStep;

  const stop = () => {
    if (timer.current !== null) window.clearInterval(timer.current);
    timer.current = null;
  };
  useEffect(() => stop, []);

  return (
    <button
      type="button"
      className="wl-icon-btn"
      aria-label={label}
      title={label}
      onPointerDown={(event) => {
        event.preventDefault();
        stop();
        step.current();
        if (!once) timer.current = window.setInterval(() => step.current(), 55);
      }}
      onPointerUp={stop}
      onPointerLeave={stop}
      onPointerCancel={stop}
      onBlur={stop}
      onKeyDown={(event: ReactKeyboardEvent<HTMLButtonElement>) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          step.current();
        }
      }}
      onClick={(event) => event.preventDefault()}
    >
      {children}
    </button>
  );
}
