import type { ToolMeta } from "@/types/tool";

export function disclaimerText(tool: ToolMeta): string | null {
  switch (tool.disclaimer) {
    case "health":
      return "Estimates only — not medical advice.";
    case "finance":
      return "Estimates based on your inputs — not financial advice.";
    case "earnings":
      return "Editable assumptions. Not a prediction of actual payouts.";
    case "mockup":
      return "DEMO / MOCKUP / FICTIONAL — not authentic evidence.";
    case "estimate":
      return "Approximate result. Check assumptions before relying on it.";
    default:
      return null;
  }
}
