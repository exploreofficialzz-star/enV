import { Check, Copy } from "lucide-react";
import { useState } from "react";
import type { MouseEvent } from "react";
import { Button } from "@/components/ui/button";
import { copyToClipboard } from "@/lib/utils";
import { recordAnalyticsEvent } from "@/lib/analytics/client";

export function CopyButton({
  text,
  label = "Copy",
}: {
  text: string;
  label?: string;
}) {
  const [ok, setOk] = useState(false);
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      disabled={!text}
      onClick={async (event: MouseEvent<HTMLButtonElement>) => {
        const root = event.currentTarget.closest<HTMLElement>("[data-env-tool-id]");
        const success = await copyToClipboard(text);
        if (success) {
          const toolId = root?.dataset.envToolId;
          const startedAt = Number(root?.dataset.envToolStartedAt);
          if (toolId) {
            recordAnalyticsEvent({
              name: "tool_completed",
              toolId,
              outcome: "success",
              ...(Number.isFinite(startedAt) && startedAt > 0
                ? { durationMs: Math.min(3_600_000, Math.max(0, Date.now() - startedAt)) }
                : {}),
              properties: { completion_action: "copy_result" },
            });
            if (root) delete root.dataset.envToolStartedAt;
          }
          setOk(true);
          setTimeout(() => setOk(false), 1400);
        }
      }}
    >
      {ok ? <Check className="size-4" /> : <Copy className="size-4" />}
      {ok ? "Copied" : label}
    </Button>
  );
}
