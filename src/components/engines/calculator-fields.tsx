import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import type { UiField } from "@/components/engines/fields";

/**
 * Input grid for calculators. Unlike the shared FieldGrid it does not nest a <label> inside a
 * <label>, links hints and the current error to the input (aria-describedby), and marks the
 * input an error is about (aria-invalid) so assistive technology announces it.
 */
export function CalculatorFields({
  fields,
  values,
  onChange,
  invalidField,
  errorId,
}: {
  fields: UiField[];
  values: Record<string, string>;
  onChange: (name: string, value: string) => void;
  /** Name of the field the current error is about, if any. */
  invalidField?: string | null;
  /** id of the element that shows the current error. */
  errorId?: string;
}) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {fields.map((f) => {
        const invalid = invalidField === f.name;
        const hintId = f.hint ? `${f.name}-hint` : undefined;
        const describedBy = [hintId, invalid ? errorId : undefined].filter(Boolean).join(" ") || undefined;
        const common = {
          id: f.name,
          "aria-invalid": invalid ? true : undefined,
          "aria-describedby": describedBy,
          className: invalid ? "outline outline-2 outline-danger" : undefined,
        };
        return (
          <div key={f.name} className={f.type === "textarea" ? "flex flex-col gap-1.5 sm:col-span-2" : "flex flex-col gap-1.5"}>
            <Label htmlFor={f.name}>{f.label}</Label>
            {f.type === "textarea" ? (
              <Textarea
                {...common}
                value={values[f.name] ?? ""}
                placeholder={f.placeholder}
                spellCheck={false}
                onChange={(e) => onChange(f.name, e.target.value)}
              />
            ) : f.type === "select" ? (
              <Select
                {...common}
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
                  {...common}
                  type={f.type === "number" ? "text" : (f.type ?? "text")}
                  inputMode={f.type === "number" ? "decimal" : undefined}
                  autoComplete="off"
                  spellCheck={false}
                  value={values[f.name] ?? ""}
                  placeholder={f.placeholder}
                  min={f.min}
                  max={f.max}
                  step={f.step}
                  onChange={(e) => onChange(f.name, e.target.value)}
                />
                {f.suffix ? (
                  <span className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-xs text-subtle">{f.suffix}</span>
                ) : null}
              </div>
            )}
            {f.hint ? (
              <span id={hintId} className="text-xs text-subtle">
                {f.hint}
              </span>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
