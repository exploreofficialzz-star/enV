import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

export type UiField = {
  name: string;
  label: string;
  type?: "number" | "text" | "select" | "textarea" | "color" | "date" | "time";
  suffix?: string;
  options?: { value: string; label: string }[];
  defaultValue?: string | number;
  min?: number;
  max?: number;
  step?: number;
  hint?: string;
  placeholder?: string;
};

export function FieldGrid({
  fields,
  values,
  onChange,
}: {
  fields: UiField[];
  values: Record<string, string>;
  onChange: (name: string, value: string) => void;
}) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {fields.map((f) => (
        <label
          key={f.name}
          className={f.type === "textarea" ? "flex flex-col gap-1.5 sm:col-span-2" : "flex flex-col gap-1.5"}
        >
          <Label htmlFor={f.name}>{f.label}</Label>
          {f.type === "textarea" ? (
            <Textarea
              id={f.name}
              value={values[f.name] ?? ""}
              placeholder={f.placeholder}
              onChange={(e) => onChange(f.name, e.target.value)}
            />
          ) : f.type === "select" ? (
            <Select
              id={f.name}
              value={values[f.name] ?? String(f.defaultValue ?? f.options?.[0]?.value ?? "")}
              onChange={(e) => onChange(f.name, e.target.value)}
            >
              {(f.options ?? []).map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </Select>
          ) : (
            <div className="relative">
              <Input
                id={f.name}
                type={f.type === "number" ? "text" : (f.type ?? "text")}
                inputMode={f.type === "number" ? "decimal" : undefined}
                value={values[f.name] ?? ""}
                placeholder={f.placeholder}
                min={f.min}
                max={f.max}
                step={f.step}
                onChange={(e) => onChange(f.name, e.target.value)}
              />
              {f.suffix ? (
                <span className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-xs text-subtle">
                  {f.suffix}
                </span>
              ) : null}
            </div>
          )}
          {f.hint ? <span className="text-xs text-subtle">{f.hint}</span> : null}
        </label>
      ))}
    </div>
  );
}
