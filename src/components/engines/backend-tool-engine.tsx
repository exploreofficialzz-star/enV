import { useState } from "react";
import { apiUrl } from "@/lib/api/base";
import { recordToolExecutionResult } from "@/lib/analytics/client";
import { Button } from "@/components/ui/button";
import { ErrorBanner } from "@/components/tools/error-banner";
import { CodeResult } from "@/components/engines/result-panel";

export function BackendToolEngine({ toolId, category }: { toolId: string; category: string }) {
  const [input, setInput] = useState("");
  const [out, setOut] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const run = async () => {
    if (busy) return;
    const startedAt = Date.now();
    setBusy(true);
    setErr(null);
    try {
      const response = await fetch(apiUrl("/api/backend/tool"), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ toolId, category, input, options: {} }),
        credentials: "include",
      });
      const payload = await response.json() as { output?: unknown; error?: string };
      if (!response.ok) throw new Error(payload.error || "Backend returned an unsuccessful response.");
      setOut(String(payload.output ?? ""));
      recordToolExecutionResult(toolId, "success", Date.now() - startedAt, "backend_operation");
    } catch (error) {
      setErr(error instanceof Error ? error.message : "Backend operation failed.");
      recordToolExecutionResult(toolId, "failure", Date.now() - startedAt, "backend_operation", "BACKEND_OPERATION_FAILED");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <textarea
        className="min-h-40 w-full rounded-lg border bg-background p-3 font-mono text-sm"
        value={input}
        onChange={event => setInput(event.target.value)}
        placeholder="Enter the input required by this tool…"
      />
      <ErrorBanner message={err} />
      <Button onClick={run} disabled={busy}>{busy ? "Running…" : "Run tool"}</Button>
      <CodeResult code={out} filename={`env-${toolId}.txt`} />
    </div>
  );
}
