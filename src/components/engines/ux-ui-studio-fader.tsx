import { useRef, type PointerEvent } from "react";

/** Vertical adjustment leaves horizontal touch gestures to the surrounding tool strip. */
export function StudioFader({ label, name, value, min, max, step = 1, begin, change }: {
  label: string; name: string; value: number; min: number; max: number; step?: number;
  begin: () => void; change: (value: number) => void;
}) {
  const drag = useRef<{ id: number; x: number; y: number; value: number; axis: "waiting" | "horizontal" | "vertical" } | null>(null);
  const clamp = (next: number) => Number(Math.max(min, Math.min(max, min + Math.round((next - min) / step) * step)).toFixed(6));
  const fraction = Math.max(0, Math.min(1, (value - min) / Math.max(step, max - min)));
  function move(event: PointerEvent<HTMLDivElement>) {
    const active = drag.current;
    if (!active || active.id !== event.pointerId) return;
    const dx = event.clientX - active.x, dy = event.clientY - active.y;
    if (active.axis === "waiting") {
      if (Math.max(Math.abs(dx), Math.abs(dy)) < 8) return;
      if (Math.abs(dy) > Math.abs(dx) * 1.5) active.axis = "vertical";
      else if (Math.abs(dx) >= Math.abs(dy)) active.axis = "horizontal";
      else return;
      if (active.axis === "vertical") begin();
    }
    if (active.axis === "vertical") {
      event.preventDefault();
      change(clamp(active.value - dy * (max - min) / 80));
    }
  }
  return <div className="uxui-fader-field" data-field={label}>
    <span>{label}</span>
    <div className="uxui-fader" role="slider" tabIndex={0} aria-label={name} aria-orientation="vertical"
      aria-valuemin={min} aria-valuemax={max} aria-valuenow={value}
      aria-description="Drag up or down to adjust. Swipe sideways to browse tools."
      onPointerDown={event => {
        if (event.button !== 0 || !event.isPrimary) return;
        drag.current = { id: event.pointerId, x: event.clientX, y: event.clientY, value, axis: "waiting" };
        event.currentTarget.setPointerCapture(event.pointerId);
        event.currentTarget.focus({ preventScroll: true });
      }} onPointerMove={move}
      onPointerUp={() => { drag.current = null; }} onPointerCancel={() => { drag.current = null; }}
      onLostPointerCapture={() => { drag.current = null; }} onBlur={() => { drag.current = null; }}
      onKeyDown={event => {
        const direction = event.key === "ArrowUp" || event.key === "ArrowRight" ? 1 : event.key === "ArrowDown" || event.key === "ArrowLeft" ? -1 : 0;
        if (!direction && event.key !== "Home" && event.key !== "End") return;
        event.preventDefault();
        const next = clamp(event.key === "Home" ? min : event.key === "End" ? max : value + direction * step * (event.shiftKey ? 10 : 1));
        if (next !== value) { if (!event.repeat) begin(); change(next); }
      }}>
      <span className="uxui-fader-track" aria-hidden="true"><span style={{ height: `${fraction * 100}%` }} /></span>
      <span className="uxui-fader-thumb" aria-hidden="true" style={{ bottom: `${fraction * 52}px` }} />
    </div>
    <output aria-hidden="true">{Number(value.toFixed(2))}</output>
  </div>;
}
