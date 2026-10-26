import { useEffect, useRef, type ButtonHTMLAttributes } from "react";

/** One undo checkpoint per press; repeat stops on release, cancellation or blur. */
export function StudioRepeatButton({ action, begin, ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { action: () => void; begin: () => void }) {
  const latest = useRef({ action, begin }); latest.current = { action, begin };
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pressed = useRef(false);
  function stop() { pressed.current = false; if (timer.current) clearTimeout(timer.current); timer.current = null; }
  useEffect(() => { window.addEventListener("blur", stop); return () => { stop(); window.removeEventListener("blur", stop); }; }, []);
  function tick() { if (!pressed.current) return; latest.current.action(); timer.current = setTimeout(tick, 75); }
  function start() { if (pressed.current || props.disabled) return; pressed.current = true; latest.current.begin(); latest.current.action(); timer.current = setTimeout(tick, 330); }
  return <button {...props} type="button" style={{ ...props.style, touchAction: "none" }}
    onPointerDown={(event) => { if (event.button !== 0) return; event.preventDefault(); event.currentTarget.setPointerCapture(event.pointerId); start(); }}
    onPointerUp={stop} onPointerCancel={stop} onLostPointerCapture={stop} onBlur={stop}
    onContextMenu={(event) => event.preventDefault()}
    onKeyDown={(event) => { if (event.key === " " || event.key === "Enter") { event.preventDefault(); if (!event.repeat) start(); } }}
    onKeyUp={(event) => { if (event.key === " " || event.key === "Enter") { event.preventDefault(); stop(); } }}
    onClick={(event) => { if (event.detail === 0 && !pressed.current) { latest.current.begin(); latest.current.action(); } }} />;
}
