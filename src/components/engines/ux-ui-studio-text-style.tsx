type TextStyleLayer = {
  id: string;
  fontSize: number;
  fontWeight: number;
  lineHeight: number;
  letterSpacing: number;
  textAlign: "left" | "center" | "right";
};

type TextStylePatch = Partial<Omit<TextStyleLayer, "id">>;

const buttonClass = "inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-lg border border-border bg-surface px-2 text-sm font-semibold text-fg aria-pressed:bg-fg aria-pressed:text-surface disabled:opacity-40";
const numberClass = "min-h-11 w-[72px] min-w-0 rounded-lg border border-border bg-surface px-2 text-sm tabular-nums text-fg";
const fieldClass = "flex min-w-0 flex-none flex-col gap-1";
const weightNames: Record<number, string> = { 100: "Thin", 200: "Extra light", 300: "Light", 400: "Regular", 500: "Medium", 600: "Semibold", 700: "Bold", 800: "Extra bold", 900: "Black" };
const alignments = ["left", "center", "right"] as const;

/** Direct typography controls stay separate from sideways tool browsing gestures. */
export function StudioTextStyle({ layer, begin, change }: {
  layer: TextStyleLayer;
  begin: () => void;
  change: (patch: TextStylePatch) => void;
}) {
  const maxFontSize = Math.max(512, layer.fontSize);
  const weights = Array.from(new Set([100, 200, 300, 400, 500, 600, 700, 800, 900, layer.fontWeight])).sort((a, b) => a - b);
  const apply = (patch: TextStylePatch) => {
    if (Object.entries(patch).every(([key, value]) => layer[key as keyof TextStyleLayer] === value)) return;
    begin();
    change(patch);
  };
  const fontSize = (next: number) => apply({ fontSize: Math.max(1, Math.min(maxFontSize, Math.round(next))) });
  const spacing = (next: number) => apply({ letterSpacing: Number(Math.max(-5, Math.min(30, next)).toFixed(1)) });
  return <div className="uxui-text-style-controls flex w-full min-w-0 gap-3 overflow-x-auto overscroll-x-contain pb-2" role="group" aria-label="Text typography controls">
    <div className={fieldClass}>
      <span className="text-xs font-semibold text-muted">Text size · px</span>
      <span className="flex items-center gap-1">
        <button type="button" aria-label="Decrease text size" className={buttonClass} disabled={layer.fontSize <= 1} onClick={() => fontSize(layer.fontSize - 1)}>−</button>
        <input type="number" aria-label="Text font size" className={numberClass} min="1" max={maxFontSize} step="1" inputMode="numeric" value={layer.fontSize} onChange={event => { if (event.target.value !== "" && Number.isFinite(event.target.valueAsNumber)) fontSize(event.target.valueAsNumber); }} />
        <button type="button" aria-label="Increase text size" className={buttonClass} disabled={layer.fontSize >= maxFontSize} onClick={() => fontSize(layer.fontSize + 1)}>+</button>
      </span>
    </div>
    <div className={fieldClass}>
      <span className="text-xs font-semibold text-muted">Weight</span>
      <div className="flex items-center gap-1">
        <button type="button" aria-label="Bold text" aria-pressed={layer.fontWeight >= 700} className={buttonClass} onClick={() => apply({ fontWeight: layer.fontWeight >= 700 ? 400 : 700 })}><strong>B</strong></button>
        <select aria-label="Text font weight" className="min-h-11 w-[124px] rounded-lg border border-border bg-surface px-2 text-xs text-fg" value={layer.fontWeight} onChange={event => apply({ fontWeight: Number(event.target.value) })}>
          {weights.map(weight => <option key={weight} value={weight}>{weightNames[weight] || "Custom"} · {weight}</option>)}
        </select>
      </div>
    </div>
    <div className={fieldClass}>
      <span className="text-xs font-semibold text-muted">Letter spacing · px</span>
      <span className="flex items-center gap-1">
        <button type="button" aria-label="Tighten letter spacing" className={buttonClass} disabled={layer.letterSpacing <= -5} onClick={() => spacing(layer.letterSpacing - 0.2)}>−</button>
        <input type="number" aria-label="Text letter spacing" className={numberClass} min="-5" max="30" step="0.1" inputMode="decimal" value={layer.letterSpacing} onChange={event => { if (event.target.value !== "" && Number.isFinite(event.target.valueAsNumber)) spacing(event.target.valueAsNumber); }} />
        <button type="button" aria-label="Widen letter spacing" className={buttonClass} disabled={layer.letterSpacing >= 30} onClick={() => spacing(layer.letterSpacing + 0.2)}>+</button>
      </span>
    </div>
    <label className={fieldClass}>
      <span className="text-xs font-semibold text-muted">Line height</span>
      <input type="number" aria-label="Text line height" className={numberClass} min="0.8" max="3" step="0.05" inputMode="decimal" value={layer.lineHeight} onChange={event => { if (event.target.value !== "" && Number.isFinite(event.target.valueAsNumber)) apply({ lineHeight: Number(Math.max(0.8, Math.min(3, event.target.valueAsNumber)).toFixed(2)) }); }} />
    </label>
    <div className={fieldClass}>
      <span className="text-xs font-semibold text-muted">Alignment</span>
      <div className="flex items-center gap-1" role="group" aria-label="Text alignment">
        {alignments.map(align => <button type="button" key={align} aria-label={"Align text " + align} aria-pressed={layer.textAlign === align} className={buttonClass} onClick={() => apply({ textAlign: align })}>{align === "left" ? "Left" : align === "center" ? "Center" : "Right"}</button>)}
      </div>
    </div>
  </div>;
}
