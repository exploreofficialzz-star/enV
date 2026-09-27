import { Check, Copy } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { copyToClipboard } from "@/lib/utils";

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
      onClick={async () => {
        const success = await copyToClipboard(text);
        if (success) {
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
