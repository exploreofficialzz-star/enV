import { useEffect, useMemo, useState } from "react";
import { ArrowDownUp, Clock3 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { ErrorBanner } from "@/components/tools/error-banner";
import { CopyButton } from "@/components/tools/copy-button";
import { convert, formatUnitValue, paperSizes, systems } from "@/lib/engines/units";
import { parseNumber } from "@/lib/utils";

type Mode = "standard" | "table" | "quick" | "comparison" | "reference";
type HistoryItem = { amount: string; from: string; to: string; result: string };
type DpiFields = { pixels: string; inches: string; dpi: string };

const MODE_COPY: Record<Mode, string> = {
  standard: "Instant conversion with a full unit comparison.",
  table: "Use one value as a reference across every supported unit.",
  quick: "Common conversions are one tap away.",
  comparison: "Compare the same value across the complete unit set.",
  reference: "Browse units and conversion factors before calculating.",
};

const PAPER_QUICK_IDS = ["a4", "letter", "a3", "legal", "a5"] as const;
const DPI_PRESETS = [72, 96, 150, 300, 600] as const;

function PaperSizeConverter({ mode }: { mode: Mode }) {
  const sizes = Object.values(paperSizes);
  const [paperId, setPaperId] = useState("a4");
  const [firstId, setFirstId] = useState("a4");
  const [secondId, setSecondId] = useState("letter");
  const paper = paperSizes[paperId] ?? paperSizes.a4;
  const first = paperSizes[firstId] ?? paperSizes.a4;
  const second = paperSizes[secondId] ?? paperSizes.letter;
  const widthIn = (widthMm: number) => formatUnitValue(widthMm / 25.4);
  const sizeOptions = (id: string, selected: string, onChange: (value: string) => void, ariaLabel: string) => (
    <Select id={id} value={selected} onChange={(event) => onChange(event.target.value)} aria-label={ariaLabel}>
      {sizes.map((size) => <option key={size.id} value={size.id}>{size.name}</option>)}
    </Select>
  );

  if (mode === "table") {
    return <div className="space-y-5">
      <p className="text-sm text-subtle">{MODE_COPY[mode]}</p>
      <div className="overflow-x-auto"><table className="w-full text-left text-sm">
        <caption className="mb-2 text-left text-xs text-subtle">Standard paper dimensions</caption>
        <thead><tr className="text-xs text-subtle"><th className="py-2 font-medium">Size</th><th className="py-2 font-medium">Width (mm)</th><th className="py-2 font-medium">Height (mm)</th><th className="py-2 font-medium">Width (in)</th><th className="py-2 font-medium">Height (in)</th></tr></thead>
        <tbody>{sizes.map((size) => <tr key={size.id} className="border-t border-border"><th scope="row" className="py-2 font-medium">{size.name}</th><td className="py-2 tabular-nums">{size.widthMm}</td><td className="py-2 tabular-nums">{size.heightMm}</td><td className="py-2 tabular-nums">{widthIn(size.widthMm)}</td><td className="py-2 tabular-nums">{widthIn(size.heightMm)}</td></tr>)}</tbody>
      </table></div>
    </div>;
  }

  if (mode === "comparison") {
    return <div className="space-y-5">
      <p className="text-sm text-subtle">{MODE_COPY[mode]}</p>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5"><Label htmlFor="paper-first">First paper size</Label>{sizeOptions("paper-first", firstId, setFirstId, "First paper size")}</div>
        <div className="space-y-1.5"><Label htmlFor="paper-second">Second paper size</Label>{sizeOptions("paper-second", secondId, setSecondId, "Second paper size")}</div>
      </div>
      <div className="overflow-x-auto"><table className="w-full text-left text-sm">
        <caption className="mb-2 text-left text-xs text-subtle">Compare paper dimensions</caption>
        <thead><tr className="text-xs text-subtle"><th className="py-2 font-medium">Dimension</th><th className="py-2 font-medium">{first.name}</th><th className="py-2 font-medium">{second.name}</th><th className="py-2 font-medium">Difference (mm)</th></tr></thead>
        <tbody>
          <tr className="border-t border-border"><th scope="row" className="py-2 font-medium">Width (mm)</th><td className="py-2">{first.widthMm}</td><td className="py-2">{second.widthMm}</td><td className="py-2">{formatUnitValue(first.widthMm - second.widthMm)}</td></tr>
          <tr className="border-t border-border"><th scope="row" className="py-2 font-medium">Height (mm)</th><td className="py-2">{first.heightMm}</td><td className="py-2">{second.heightMm}</td><td className="py-2">{formatUnitValue(first.heightMm - second.heightMm)}</td></tr>
          <tr className="border-t border-border"><th scope="row" className="py-2 font-medium">Area (mm²)</th><td className="py-2">{formatUnitValue(first.widthMm * first.heightMm)}</td><td className="py-2">{formatUnitValue(second.widthMm * second.heightMm)}</td><td className="py-2">{formatUnitValue(first.widthMm * first.heightMm - second.widthMm * second.heightMm)}</td></tr>
        </tbody>
      </table></div>
    </div>;
  }

  if (mode === "quick") {
    return <div className="space-y-5">
      <p className="text-sm text-subtle">{MODE_COPY[mode]}</p>
      <div className="flex flex-wrap gap-2">{PAPER_QUICK_IDS.map((id) => <Button key={id} type="button" variant="outline" onClick={() => setPaperId(id)}>{paperSizes[id]!.name}</Button>)}</div>
      <div className="rounded-lg bg-surface-2 p-4" role="status"><p className="font-medium">{paper.name}</p><p className="mt-1 text-sm">{paper.widthMm} × {paper.heightMm} mm ({widthIn(paper.widthMm)} × {widthIn(paper.heightMm)} in)</p></div>
    </div>;
  }

  if (mode === "reference") {
    return <div className="space-y-5">
      <p className="text-sm text-subtle">{MODE_COPY[mode]}</p>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{sizes.map((size) => <div key={size.id} className="rounded-lg border border-border p-4"><p className="font-medium">{size.name}</p><p className="mt-1 text-sm text-subtle">{size.widthMm} × {size.heightMm} mm ({widthIn(size.widthMm)} × {widthIn(size.heightMm)} in)</p></div>)}</div>
    </div>;
  }

  return <div className="max-w-xl space-y-5">
    <p className="text-sm text-subtle">{MODE_COPY[mode]}</p>
    <div className="space-y-1.5"><Label htmlFor="paper-size">Paper size</Label>{sizeOptions("paper-size", paperId, setPaperId, "Paper size")}</div>
    <div className="rounded-lg bg-surface-2 p-4" role="status"><p className="font-medium">{paper.name}</p><p className="mt-1 text-sm">{paper.widthMm} × {paper.heightMm} mm ({widthIn(paper.widthMm)} × {widthIn(paper.heightMm)} in)</p></div>
    <p className="text-xs text-subtle">Paper standards have two dimensions and are shown as references rather than treated as one-dimensional units.</p>
  </div>;
}

function DpiConverter({ mode }: { mode: Mode }) {
  const [fields, setFields] = useState<DpiFields>({ pixels: "2480", inches: "8.266666667", dpi: "300" });
  const pixels = Number(fields.pixels);
  const inches = Number(fields.inches);
  const dpi = Number(fields.dpi);
  const valid = fields.pixels.trim() !== "" && fields.inches.trim() !== "" && fields.dpi.trim() !== "" && Number.isFinite(pixels) && pixels >= 0 && Number.isFinite(inches) && inches >= 0 && Number.isFinite(dpi) && dpi > 0;

  function updateField(name: keyof DpiFields, value: string) {
    setFields((current) => {
      const next = { ...current, [name]: value };
      const px = Number(next.pixels);
      const width = Number(next.inches);
      const resolution = Number(next.dpi);
      if (!Number.isFinite(resolution) || resolution <= 0) return next;
      if (name === "pixels" && value.trim() && Number.isFinite(px) && px >= 0) next.inches = formatUnitValue(px / resolution);
      else if ((name === "inches" || name === "dpi") && next.inches.trim() && Number.isFinite(width) && width >= 0) next.pixels = formatUnitValue(width * resolution);
      return next;
    });
  }

  const widthForDpi = (value: number) => pixels / value;
  const pixelsForWidth = (width: number, resolution: number) => width * resolution;

  if (mode === "reference") {
    return <div className="space-y-5">
      <p className="text-sm text-subtle">{MODE_COPY[mode]}</p>
      <div className="grid gap-3 sm:grid-cols-2">
        {[{ name: "Pixel (px)", detail: "A digital image sample or screen coordinate." }, { name: "Inch (in)", detail: "A physical print-length unit." }, { name: "Millimetre (mm)", detail: "25.4 millimetres equal one inch." }, { name: "DPI / PPI", detail: "Dots or pixels per inch; a higher value packs more pixels into the same print width." }].map((item) => <div key={item.name} className="rounded-lg border border-border p-4"><p className="font-medium">{item.name}</p><p className="mt-1 text-sm text-subtle">{item.detail}</p></div>)}
      </div>
      <p className="rounded-lg bg-surface-2 p-4 text-sm">Print width (in) = pixels ÷ DPI. Pixels = print width (in) × DPI.</p>
    </div>;
  }

  return <div className="space-y-5">
    <p className="text-sm text-subtle">{MODE_COPY[mode]}</p>
    <div className="grid gap-4 sm:grid-cols-3">
      <label className="space-y-1.5"><Label htmlFor="dpi-pixels">Pixels</Label><Input id="dpi-pixels" inputMode="decimal" value={fields.pixels} onChange={(event) => updateField("pixels", event.target.value)} /></label>
      <label className="space-y-1.5"><Label htmlFor="dpi-inches">Print width (in)</Label><Input id="dpi-inches" inputMode="decimal" value={fields.inches} onChange={(event) => updateField("inches", event.target.value)} /></label>
      <label className="space-y-1.5"><Label htmlFor="dpi-value">DPI / PPI</Label><Input id="dpi-value" inputMode="decimal" value={fields.dpi} onChange={(event) => updateField("dpi", event.target.value)} /></label>
    </div>
    {!valid ? <ErrorBanner message={fields.dpi.trim() && Number(fields.dpi) <= 0 ? "DPI / PPI must be greater than 0." : "Enter nonnegative pixels and print width with a positive DPI / PPI value."} /> : null}
    {valid ? <div className="rounded-lg bg-surface-2 p-4 text-sm" role="status">{formatUnitValue(pixels)} pixels at {formatUnitValue(dpi)} DPI = {formatUnitValue(inches)} in ({formatUnitValue(inches * 25.4)} mm).</div> : null}
    {mode === "quick" ? <div className="flex flex-wrap gap-2" aria-label="Common DPI presets">{DPI_PRESETS.map((value) => <Button key={value} type="button" variant="outline" onClick={() => updateField("dpi", String(value))}>{value} DPI</Button>)}</div> : null}
    {mode === "table" ? <div className="overflow-x-auto"><table className="w-full text-left text-sm"><caption className="mb-2 text-left text-xs text-subtle">Pixels required for one inch and eight inches of print width</caption><thead><tr className="text-xs text-subtle"><th className="py-2 font-medium">DPI</th><th className="py-2 font-medium">Pixels / inch</th><th className="py-2 font-medium">Pixels / 8 in</th></tr></thead><tbody>{DPI_PRESETS.map((value) => <tr key={value} className="border-t border-border"><th scope="row" className="py-2 font-medium">{value}</th><td className="py-2">{value}</td><td className="py-2">{value * 8}</td></tr>)}</tbody></table></div> : null}
    {mode === "comparison" ? <div className="overflow-x-auto"><table className="w-full text-left text-sm"><caption className="mb-2 text-left text-xs text-subtle">Print width for {formatUnitValue(pixels)} pixels at common resolutions</caption><thead><tr className="text-xs text-subtle"><th className="py-2 font-medium">DPI</th><th className="py-2 font-medium">Width (in)</th><th className="py-2 font-medium">Width (mm)</th></tr></thead><tbody>{DPI_PRESETS.map((value) => <tr key={value} className="border-t border-border"><th scope="row" className="py-2 font-medium">{value}</th><td className="py-2">{formatUnitValue(widthForDpi(value))}</td><td className="py-2">{formatUnitValue(widthForDpi(value) * 25.4)}</td></tr>)}</tbody></table></div> : null}
    {mode === "quick" ? <p className="text-xs text-subtle">{formatUnitValue(pixelsForWidth(inches, dpi))} pixels are required for {formatUnitValue(inches)} inches at the selected resolution.</p> : null}
    <p className="text-xs text-subtle">Print width (in) = pixels ÷ DPI; pixels = print width (in) × DPI.</p>
  </div>;
}

export function ConverterEngine({ system, mode = "standard" }: { system: string; mode?: Mode }) {
  const def = systems[system];
  const units = def?.units ?? [];
  const [amount, setAmount] = useState("1");
  const [from, setFrom] = useState(units[0]?.id ?? "");
  const [to, setTo] = useState(units[1]?.id ?? units[0]?.id ?? "");
  const [history, setHistory] = useState<HistoryItem[]>([]);

  useEffect(() => {
    setFrom(units[0]?.id ?? "");
    setTo(units[1]?.id ?? units[0]?.id ?? "");
  }, [system]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    try { setHistory(JSON.parse(localStorage.getItem(`env-converter-history:${system}`) ?? "[]")); } catch { setHistory([]); }
  }, [system]);

  const result = useMemo(() => {
    if (!def || !amount.trim()) return null;
    const n = parseNumber(amount);
    if (!Number.isFinite(n)) return { error: "Enter a valid number." };
    try {
      const value = convert(system, n, from, to);
      return Number.isFinite(value) ? { value } : { error: "These units cannot be converted for this value." };
    }
    catch (e) { return { error: e instanceof Error ? e.message : "Cannot convert these units." }; }
  }, [amount, def, from, system, to]);

  if (!def) return <p className="text-sm text-muted">Unknown unit system.</p>;
  if (system === "paper") return <PaperSizeConverter mode={mode} />;
  if (system === "dpi") return <DpiConverter mode={mode} />;

  const text = result && "value" in result && typeof result.value === "number" && Number.isFinite(result.value)
    ? `${amount} ${from} = ${formatUnitValue(result.value)} ${to}` : "";
  const current = result && "value" in result && result.value !== undefined ? result.value : null;
  const sourceNumber = parseNumber(amount);

  function saveHistory() {
    if (!text) return;
    const item = { amount, from, to, result: formatUnitValue(current as number) };
    const next = [item, ...history.filter(x => !(x.amount === item.amount && x.from === item.from && x.to === item.to))].slice(0, 8);
    setHistory(next); localStorage.setItem(`env-converter-history:${system}`, JSON.stringify(next));
  }

  function tableRows() {
    return units.map(unit => {
      let value = "—";
      if (Number.isFinite(sourceNumber) && amount.trim()) {
        try { value = formatUnitValue(convert(system, sourceNumber, from, unit.id)); } catch { /* unsupported pair */ }
      }
      return { unit, value };
    });
  }

  const rows = tableRows();
  const quickPairs = units.slice(0, Math.min(units.length, 8)).flatMap((unit, index) => units.slice(index + 1, Math.min(units.length, index + 3)).map(other => [unit, other] as const)).slice(0, 8);

  return <div className="space-y-5">
    <div className="flex flex-wrap items-center justify-between gap-2"><p className="text-sm text-subtle">{MODE_COPY[mode]}</p>{text ? <Button variant="outline" size="sm" onClick={saveHistory}><Clock3 className="mr-2 size-4"/>Save conversion</Button> : null}</div>
    <div className="grid gap-4 sm:grid-cols-[1fr_auto_1fr] sm:items-end">
      <div className="space-y-1.5"><Label htmlFor="from-amount">From</Label><Input id="from-amount" inputMode="decimal" value={amount} onChange={event=>setAmount(event.target.value)} /><Select value={from} onChange={event=>setFrom(event.target.value)} aria-label="From unit">{units.map(unit=><option key={unit.id} value={unit.id}>{unit.label}</option>)}</Select></div>
      <Button type="button" variant="outline" size="icon" className="mx-auto" aria-label="Swap units" onClick={()=>{setFrom(to);setTo(from)}}><ArrowDownUp className="size-4"/></Button>
      <div className="space-y-1.5"><Label>To</Label><div className="flex h-11 items-center rounded-md bg-surface-2 px-3 text-sm font-medium tabular-nums">{current !== null && Number.isFinite(current) ? formatUnitValue(current) : "—"}</div><Select value={to} onChange={event=>setTo(event.target.value)} aria-label="To unit">{units.map(unit=><option key={unit.id} value={unit.id}>{unit.label}</option>)}</Select></div>
    </div>
    <ErrorBanner message={result && "error" in result ? result.error ?? null : null}/>
    {text && current !== null && Number.isFinite(current) ? <div className="flex items-center justify-between gap-3 rounded-lg bg-surface-2 px-4 py-3"><p className="text-sm font-medium tabular-nums">{text}</p><CopyButton text={text}/></div> : null}
    {mode === "quick" ? <div className="grid gap-2 sm:grid-cols-2">{quickPairs.map(([a,b])=><button key={`${a.id}-${b.id}`} type="button" className="rounded-lg border border-border p-3 text-left text-sm hover:bg-surface-2" onClick={()=>{setFrom(a.id);setTo(b.id)}}><span className="font-medium">{a.label}</span><span className="mx-2 text-subtle">→</span><span>{b.label}</span></button>)}</div> : null}
    {mode !== "reference" ? <div className="overflow-x-auto"><table className="w-full text-left text-sm"><caption className="mb-2 text-left text-xs text-subtle">{mode === "comparison" ? "Complete comparison from the source value" : "All units from the source value"}</caption><thead><tr className="text-xs text-subtle"><th className="py-2 font-medium">Unit</th><th className="py-2 font-medium">Value</th></tr></thead><tbody>{rows.map(row=><tr key={row.unit.id} className="border-t border-border"><td className="py-2">{row.unit.label}</td><td className="py-2 tabular-nums">{row.value}</td></tr>)}</tbody></table></div> : <div className="grid gap-2 sm:grid-cols-2">{units.map(unit=><div key={unit.id} className="rounded-lg border border-border p-3"><p className="font-medium">{unit.label}</p><p className="mt-1 text-xs text-subtle">Base factor: {unit.toBase === 0 ? "special / reference mapping" : unit.toBase}</p></div>)}</div>}
    {history.length ? <div className="border-t border-border pt-4"><div className="mb-2 flex items-center gap-2 text-sm font-medium"><Clock3 className="size-4"/>Recent conversions</div><div className="flex flex-wrap gap-2">{history.map((item,index)=><button key={index} type="button" className="rounded-md bg-surface-2 px-3 py-2 text-xs" onClick={()=>{setAmount(item.amount);setFrom(item.from);setTo(item.to)}}>{item.amount} → {item.result}</button>)}</div></div> : null}
  </div>;
}
