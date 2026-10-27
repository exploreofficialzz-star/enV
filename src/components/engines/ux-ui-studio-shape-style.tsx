import { normalizedCornerRadii, type CornerRadii, type ShapeBorderStyle } from "@/lib/engines/ux-ui-studio-shape-style";

type ShapeStyleLayer = {
  id: string;
  width: number;
  height: number;
  radius: number;
  borderWidth: number;
  borderColor: string;
  background: string;
  cornerRadii?: CornerRadii;
  borderStyle?: ShapeBorderStyle;
};

type ShapeStylePatch = Partial<Pick<ShapeStyleLayer, "radius" | "cornerRadii" | "borderWidth" | "borderColor" | "borderStyle">>;

const inputClass = "min-h-11 w-full min-w-0 rounded-lg border border-border bg-surface px-2 text-sm text-fg";
const cornerLabels: Array<{ key: keyof CornerRadii; label: string }> = [
  { key: "topLeft", label: "Top left corner" },
  { key: "topRight", label: "Top right corner" },
  { key: "bottomLeft", label: "Bottom left corner" },
  { key: "bottomRight", label: "Bottom right corner" },
];

/** Explicit edge controls complement the quick radius presets and vertical faders. */
export function StudioShapeStyle({ layer, change }: { layer: ShapeStyleLayer; change: (patch: ShapeStylePatch) => void }) {
  const radii = normalizedCornerRadii(layer);
  const individual = Boolean(layer.cornerRadii);
  const maxRadius = Math.max(0, Math.max(layer.width, layer.height));
  return <div className="uxui-shape-edge-controls w-full min-w-0 space-y-3" role="group" aria-label="Shape edges and border">
    <div className="flex flex-wrap gap-2" role="group" aria-label="Corner radius mode">
      <button type="button" aria-pressed={!individual} className="min-h-11 rounded-lg border border-border px-3 text-xs font-semibold text-fg" onClick={() => change({ radius: radii.topLeft, cornerRadii: undefined })}>All corners</button>
      <button type="button" aria-pressed={individual} className="min-h-11 rounded-lg border border-border px-3 text-xs font-semibold text-fg" onClick={() => change({ cornerRadii: radii })}>Individual corners</button>
    </div>
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
      {individual ? cornerLabels.map(({ key, label }) => <label key={key} className="flex min-w-0 flex-col gap-1 text-xs text-muted">
        <span>{label}</span>
        <input type="number" aria-label={label} min="0" max={maxRadius} step="1" inputMode="numeric" className={inputClass} value={layer.cornerRadii?.[key] ?? radii[key]} onChange={event => change({ cornerRadii: { ...(layer.cornerRadii || radii), [key]: Math.max(0, Math.min(maxRadius, Number(event.target.value) || 0)) } })} />
      </label>) : <label className="flex min-w-0 flex-col gap-1 text-xs text-muted">
        <span>Corner radius</span>
        <input type="number" aria-label="All corners radius" min="0" max={maxRadius} step="1" inputMode="numeric" className={inputClass} value={layer.radius} onChange={event => change({ radius: Math.max(0, Math.min(maxRadius, Number(event.target.value) || 0)) })} />
      </label>}
    </div>
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
      <label className="flex min-w-0 flex-col gap-1 text-xs text-muted"><span>Border style</span>
        <select aria-label="Shape border style" className={inputClass} value={layer.borderStyle || "solid"} onChange={event => change({ borderStyle: event.target.value as ShapeBorderStyle })}>
          <option value="solid">Solid</option><option value="dashed">Dashed</option><option value="dotted">Dotted</option>
        </select>
      </label>
      <label className="flex min-w-0 flex-col gap-1 text-xs text-muted"><span>Border width</span>
        <input type="number" aria-label="Shape border width" min="0" max="64" step="1" inputMode="numeric" className={inputClass} value={layer.borderWidth} onChange={event => change({ borderWidth: Math.max(0, Math.min(64, Number(event.target.value) || 0)) })} />
      </label>
      <label className="flex min-w-0 flex-col gap-1 text-xs text-muted"><span>Border color</span>
        <input type="color" aria-label="Shape border color" className={inputClass} value={/^#[0-9a-f]{6}$/i.test(layer.borderColor) ? layer.borderColor : "#111111"} onChange={event => change({ borderColor: event.target.value })} />
      </label>
    </div>
  </div>;
}
