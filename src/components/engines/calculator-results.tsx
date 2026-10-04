import { Download } from "lucide-react";
import { CopyButton } from "@/components/tools/copy-button";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import {
  clampDigits,
  describeOutput,
  digitRange,
  modeUsesDigits,
  type DisplayItem,
  type DisplaySettings,
} from "@/lib/calc/display";
import { PRECISION_MODE_LABELS, type PrecisionMode } from "@/lib/calc/numeric";
import { cn, downloadText } from "@/lib/utils";

export function CalculatorResults({
  items,
  summary,
  stale,
  inputs,
  steps,
  filename,
}: {
  items: DisplayItem[];
  /** Plain-text record of the calculation, used by "Copy summary" and "Download". */
  summary: string;
  /** True when the inputs changed after this result was calculated. */
  stale: boolean;
  inputs: Array<{ label: string; value: string; suffix?: string }>;
  steps: string[];
  filename: string;
}) {
  if (items.length === 0) return null;
  const primary = items.find((item) => item.primary) ?? items[0];
  const given = inputs.filter((input) => input.value.trim() !== "");
  return (
    <section className={cn("mt-6 space-y-3", stale && "opacity-60")} aria-label="Result">
      <div className="flex flex-wrap gap-2">
        <CopyButton text={describeOutput(primary)} label="Copy result" />
        <CopyButton text={summary} label="Copy summary" />
        <Button type="button" variant="outline" size="sm" onClick={() => downloadText(summary, filename)}>
          <Download className="size-4" />
          Download
        </Button>
      </div>
      {stale ? <p className="text-xs text-subtle">Inputs changed. Press Calculate to update this result.</p> : null}
      <dl className="divide-y divide-border rounded-lg bg-surface-2">
        {items.map((item, index) => (
          <div key={`${item.label}-${index}`} className="flex items-baseline justify-between gap-4 px-4 py-3">
            <dt className="text-sm text-muted">{item.label}</dt>
            <dd className="text-right">
              <span className={item.primary ? "text-lg font-semibold tabular-nums" : "text-sm font-medium tabular-nums"}>
                {item.value}
                {item.unit ? <span className="ml-1 text-sm font-normal text-subtle">{item.unit}</span> : null}
              </span>
              {item.hint ? <span className="mt-0.5 block text-xs text-subtle">{item.hint}</span> : null}
            </dd>
          </div>
        ))}
      </dl>
      {given.length > 0 || steps.length > 0 ? (
        <details className="rounded-lg bg-surface-2 px-4 py-3 text-sm">
          <summary className="cursor-pointer font-medium">Show calculation</summary>
          <div className="mt-3 space-y-3 text-xs text-muted">
            {steps.length > 0 ? (
              <ol className="list-decimal space-y-1 pl-5">
                {steps.map((step) => (
                  <li key={step}>{step}</li>
                ))}
              </ol>
            ) : null}
            {given.length > 0 ? (
              <ul className="space-y-1">
                {given.map((input) => (
                  <li key={input.label}>
                    {input.label}: <span className="tabular-nums text-fg">{input.value.trim()}{input.suffix ? ` ${input.suffix}` : ""}</span>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        </details>
      ) : null}
    </section>
  );
}

const DEFAULT_DIGITS: Record<PrecisionMode, number> = { auto: 6, decimals: 2, significant: 4, scientific: 4, engineering: 4, exact: 6 };

/** Lets the person choose how results are rounded and written. Only numeric results are affected. */
export function NumberDisplayControls({ settings, onChange }: { settings: DisplaySettings; onChange: (next: DisplaySettings) => void }) {
  const { min, max } = digitRange(settings.mode);
  const digitChoices = Array.from({ length: max - min + 1 }, (_, index) => min + index);
  return (
    <details className="rounded-lg bg-surface-2 px-4 py-3 text-sm">
      <summary className="cursor-pointer font-medium">Number display</summary>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="calc-display-mode">Format</Label>
          <Select
            id="calc-display-mode"
            value={settings.mode}
            onChange={(e) => {
              const mode = e.target.value as PrecisionMode;
              onChange({ mode, digits: clampDigits(mode, DEFAULT_DIGITS[mode]) });
            }}
          >
            {(Object.keys(PRECISION_MODE_LABELS) as PrecisionMode[]).map((mode) => (
              <option key={mode} value={mode}>
                {PRECISION_MODE_LABELS[mode]}
              </option>
            ))}
          </Select>
        </div>
        {modeUsesDigits(settings.mode) ? (
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="calc-display-digits">{settings.mode === "decimals" ? "Decimal places" : "Significant figures"}</Label>
            <Select
              id="calc-display-digits"
              value={String(clampDigits(settings.mode, settings.digits))}
              onChange={(e) => onChange({ ...settings, digits: clampDigits(settings.mode, Number(e.target.value)) })}
            >
              {digitChoices.map((digits) => (
                <option key={digits} value={digits}>
                  {digits}
                </option>
              ))}
            </Select>
          </div>
        ) : null}
        <p className="text-xs text-subtle sm:col-span-2">
          {settings.mode === "auto"
            ? "Automatic keeps at least six significant digits and never rounds a non-zero result to 0."
            : "Applies to numeric results only. The calculation itself always uses full precision."}
        </p>
      </div>
    </details>
  );
}
