import { Upload } from "lucide-react";
import { useId, useRef, useState } from "react";
import { cn } from "@/lib/utils";

function matchesAcceptedType(file: File, accept?: string): boolean {
  const rules = (accept ?? "").split(",").map((rule) => rule.trim().toLowerCase()).filter(Boolean);
  if (!rules.length || rules.includes("*/*")) return true;
  const name = file.name.toLowerCase();
  const type = file.type.toLowerCase();
  return rules.some((rule) => {
    if (rule.startsWith(".")) return name.endsWith(rule);
    if (rule.endsWith("/*")) return type.startsWith(rule.slice(0, -1));
    return type === rule;
  });
}

export function FileDropzone({ accept, multiple, label = "Drop a file here or browse", hint, disabled = false, onFiles }: {
  accept?: string;
  multiple?: boolean;
  label?: string;
  hint?: string;
  disabled?: boolean;
  onFiles: (files: File[]) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const inputId = useId();
  const hintId = inputId + "-hint";
  const errorId = inputId + "-error";
  const [over, setOver] = useState(false);
  const [validationError, setValidationError] = useState("");

  const take = (list: FileList | File[] | null) => {
    if (disabled || !list || list.length === 0) return;
    const selected = Array.from(list);
    const candidates = multiple ? selected : selected.slice(0, 1);
    const accepted = candidates.filter((file) => matchesAcceptedType(file, accept));
    const rejected = candidates.filter((file) => !matchesAcceptedType(file, accept));
    const tooMany = !multiple && selected.length > 1;
    if (rejected.length) {
      const names = rejected.slice(0, 2).map((file) => file.name).join(", ");
      setValidationError(rejected.length === 1 ? names + " is not a supported file type." : rejected.length + " files are not supported: " + names + (rejected.length > 2 ? " and others." : "."));
    } else if (tooMany) setValidationError("Choose one file at a time.");
    else setValidationError("");
    if (accepted.length) onFiles(accepted);
    if (inputRef.current) inputRef.current.value = "";
  };
  const openPicker = () => { if (!disabled) inputRef.current?.click(); };

  return (
    <div className="space-y-2">
      <div role="button" tabIndex={disabled ? -1 : 0} aria-label={label} aria-disabled={disabled || undefined}
        aria-describedby={validationError ? errorId : hint ? hintId : undefined}
        onClick={openPicker}
        onKeyDown={(event) => { if (disabled || (event.key !== "Enter" && event.key !== " ")) return; event.preventDefault(); openPicker(); }}
        onDragEnter={(event) => { event.preventDefault(); if (!disabled) setOver(true); }}
        onDragOver={(event) => { event.preventDefault(); if (!disabled) setOver(true); }}
        onDragLeave={(event) => { if (event.currentTarget === event.target || !event.currentTarget.contains(event.relatedTarget as Node | null)) setOver(false); }}
        onDrop={(event) => { event.preventDefault(); setOver(false); if (!disabled) take(event.dataTransfer.files); }}
        className={cn("flex min-h-32 flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border-strong bg-surface-2 px-4 py-6 text-center transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent", over && !disabled && "border-accent bg-accent-soft", disabled && "cursor-not-allowed opacity-50", !disabled && "cursor-pointer hover:border-border-strong hover:bg-surface-2/80")}>
        <Upload className="size-5 text-muted" aria-hidden="true" />
        <p className="text-sm font-medium">{label}</p>
        {hint ? <p id={hintId} className="text-xs text-muted">{hint}</p> : null}
        <input id={inputId} ref={inputRef} type="file" accept={accept} multiple={multiple} disabled={disabled} className="sr-only" onChange={(event) => take(event.target.files)} />
      </div>
      {validationError ? <p id={errorId} className="text-xs text-danger" role="alert">{validationError}</p> : null}
    </div>
  );
}
