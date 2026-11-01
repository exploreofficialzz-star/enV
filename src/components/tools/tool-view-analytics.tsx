import { useEffect } from "react";
import { recordAnalyticsEvent } from "@/lib/analytics/client";

export function ToolViewAnalytics({ toolId }: { toolId: string }) {
  useEffect(() => {
    recordAnalyticsEvent({ name: "tool_viewed", toolId });
  }, [toolId]);
  return null;
}
