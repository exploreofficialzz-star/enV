import { CopyButton } from "@/components/tools/copy-button";
import { downloadText } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Download } from "lucide-react";

export function ResultPanel({
  items,
  extraText,
  filename = "env-result.txt",
}: {
  items: { label: string; value: string; hint?: string; primary?: boolean }[];
  extraText?: string;
  filename?: string;
}) {
  if (items.length === 0 && !extraText) return null;
  const blob = extraText ?? items.map((i) => `${i.label}: ${i.value}`).join("\n");
  return (
    <div className="mt-6 space-y-3">
      <div className="flex flex-wrap gap-2">
        <CopyButton text={blob} />
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => downloadText(blob, filename)}
        >
          <Download className="size-4" />
          Download
        </Button>
      </div>
      <dl className="divide-y divide-border rounded-lg bg-surface-2">
        {items.map((item) => (
          <div key={item.label} className="flex items-baseline justify-between gap-4 px-4 py-3">
            <dt className="text-sm text-muted">{item.label}</dt>
            <dd className="text-right">
              <span className={item.primary ? "text-lg font-semibold tabular-nums" : "text-sm font-medium tabular-nums"}>
                {item.value}
              </span>
              {item.hint ? <span className="mt-0.5 block text-xs text-subtle">{item.hint}</span> : null}
            </dd>
          </div>
        ))}
      </dl>
      {extraText ? (
        <pre className="max-h-80 overflow-auto rounded-lg bg-ink px-4 py-3 font-mono text-xs leading-5 text-bg">
          {extraText}
        </pre>
      ) : null}
    </div>
  );
}

export function CodeResult({
  code,
  filename,
}: {
  code: string;
  filename?: string;
}) {
  if (!code) return null;
  return (
    <div className="mt-6 space-y-3">
      <div className="flex flex-wrap gap-2">
        <CopyButton text={code} />
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => downloadText(code, filename ?? "env-output.txt")}
        >
          <Download className="size-4" />
          Download
        </Button>
      </div>
      <pre className="max-h-[28rem] overflow-auto rounded-lg bg-ink px-4 py-3 font-mono text-[13px] leading-6 text-bg whitespace-pre-wrap">
        {code}
      </pre>
    </div>
  );
}
