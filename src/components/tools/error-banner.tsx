import { useContext, useEffect } from "react";
import { ToolExecutionTelemetryContext } from "@/components/tools/tool-execution-context";

export function ErrorBanner({ message }: { message: string | null }) {
  const telemetry = useContext(ToolExecutionTelemetryContext);
  useEffect(() => {
    if (message) telemetry?.finish("failure", "TOOL_EXECUTION_FAILED");
  }, [message, telemetry]);
  if (!message) return null;
  return (
    <p role="alert" className="rounded-md bg-danger/10 px-3 py-2 text-sm text-danger">
      {message}
    </p>
  );
}
