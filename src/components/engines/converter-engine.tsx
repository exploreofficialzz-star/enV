import { useMemo, useState } from "react";
import { ArrowDownUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { ErrorBanner } from "@/components/tools/error-banner";
import { CopyButton } from "@/components/tools/copy-button";
import { convert, formatUnitValue, systems } from "@/lib/engines/units";
import { parseNumber } from "@/lib/utils";

export function ConverterEngine({ system }: { system: string }) {
  const def = systems[system];
  const units = def?.units ?? [];
  const [amount, setAmount] = useState("1");
  const [from, setFrom] = useState(units[0]?.id ?? "");
  const [to, setTo] = useState(units[1]?.id ?? units[0]?.id ?? "");

  const result = useMemo(() => {
    if (!def) return null;
    const n = parseNumber(amount);
    if (!amount.trim()) return null;
    if (!Number.isFinite(n)) {
      return { error: "Enter a valid number." };
    }
    try {
      const value = convert(system, n, from, to);
      return { value };
    } catch (e) {
      return { error: e instanceof Error ? e.message : "Cannot convert these units." };
    }
  }, [amount, def, from, system, to]);

  if (!def) return <p className="text-sm text-muted">Unknown unit system.</p>;

  const text =
    result && "value" in result && result.value !== undefined
      ? `${amount} ${from} = ${formatUnitValue(result.value)} ${to}`
      : "";

  return (
    <div className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-[1fr_auto_1fr] sm:items-end">
        <div className="space-y-1.5">
          <Label htmlFor="from-amount">From</Label>
          <Input
            id="from-amount"
            inputMode="decimal"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />
          <Select value={from} onChange={(e) => setFrom(e.target.value)} aria-label="From unit">
            {units.map((u) => (
              <option key={u.id} value={u.id}>
                {u.label}
              </option>
            ))}
          </Select>
        </div>
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="mx-auto"
          aria-label="Swap units"
          onClick={() => {
            setFrom(to);
            setTo(from);
          }}
        >
          <ArrowDownUp className="size-4" />
        </Button>
        <div className="space-y-1.5">
          <Label>To</Label>
          <div className="flex h-11 items-center rounded-md bg-surface-2 px-3 text-sm font-medium tabular-nums">
            {result && "value" in result && result.value !== undefined
              ? formatUnitValue(result.value)
              : "—"}
          </div>
          <Select value={to} onChange={(e) => setTo(e.target.value)} aria-label="To unit">
            {units.map((u) => (
              <option key={u.id} value={u.id}>
                {u.label}
              </option>
            ))}
          </Select>
        </div>
      </div>
      <ErrorBanner message={result && "error" in result ? result.error ?? null : null} />
      {text ? (
        <div className="flex items-center justify-between gap-3 rounded-lg bg-surface-2 px-4 py-3">
          <p className="text-sm">{text}</p>
          <CopyButton text={text} />
        </div>
      ) : null}
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <caption className="mb-2 text-left text-xs text-subtle">All units from the source value</caption>
          <thead>
            <tr className="text-xs text-subtle">
              <th className="py-2 font-medium">Unit</th>
              <th className="py-2 font-medium">Value</th>
            </tr>
          </thead>
          <tbody>
            {units.map((u) => {
              const n = parseNumber(amount);
              let v = "—";
              if (Number.isFinite(n) && amount.trim()) {
                try {
                  v = formatUnitValue(convert(system, n, from, u.id));
                } catch {
                  v = "—";
                }
              }
              return (
                <tr key={u.id} className="border-t border-border">
                  <td className="py-2">{u.label}</td>
                  <td className="py-2 tabular-nums">{v}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
