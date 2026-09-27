import { Upload } from "lucide-react";
import { useRef, useState } from "react";
import { cn } from "@/lib/utils";

export function FileDropzone({
  accept,
  multiple,
  label = "Drop a file here or browse",
  hint,
  onFiles,
}: {
  accept?: string;
  multiple?: boolean;
  label?: string;
  hint?: string;
  onFiles: (files: File[]) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);

  const take = (list: FileList | null) => {
    if (!list || list.length === 0) return;
    onFiles(Array.from(list));
  };

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => inputRef.current?.click()}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") inputRef.current?.click();
      }}
      onDragOver={(e) => {
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        take(e.dataTransfer.files);
      }}
      className={cn(
        "flex min-h-36 cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border-strong bg-surface-2 px-4 py-8 text-center transition-colors",
        over && "border-accent bg-accent-soft",
      )}
    >
      <Upload className="size-5 text-muted" />
      <p className="text-sm font-medium">{label}</p>
      {hint ? <p className="text-xs text-muted">{hint}</p> : null}
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        multiple={multiple}
        className="sr-only"
        onChange={(e) => take(e.target.files)}
      />
    </div>
  );
}
