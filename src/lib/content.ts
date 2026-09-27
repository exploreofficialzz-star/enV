import type { ToolMeta } from "@/types/tool";

export function howToFor(tool: ToolMeta): string[] {
  const fileish = ["image", "pdf", "device"].includes(tool.engine.type);
  return [
    `Open ${tool.name} from search or the ${tool.category} category.`,
    fileish
      ? "Add your file. Processing stays on this device."
      : "Enter the values or text you want to process.",
    "Review the result. Invalid input shows a short, specific error.",
    "Copy or download the output if you need it.",
  ];
}

export function faqFor(tool: ToolMeta): { q: string; a: string }[] {
  const faq = [
    {
      q: `Does ${tool.name} upload my data?`,
      a: tool.status === "planned"
        ? `${tool.name} is not available yet. When it ships, data will only leave the browser if the work cannot be done locally.`
        : tool.requiresBackend
          ? "This tool needs a server component. Nothing is sent until you run the action."
          : `No. ${tool.name} runs in your browser. enV does not receive the contents you type or the files you select.`,
    },
    {
      q: `Do I need an account to use ${tool.name}?`,
      a: `No. You can use ${tool.name} without signing in.`,
    },
    {
      q: `Is ${tool.name} free?`,
      a: `Yes. ${tool.name} is part of the free enV toolkit.`,
    },
  ];
  if (tool.disclaimer === "health") {
    faq.push({
      q: "Is this medical advice?",
      a: "No. Results are simplified estimates and not a diagnosis. Talk to a clinician for personal advice.",
    });
  }
  if (tool.disclaimer === "finance" || tool.disclaimer === "earnings") {
    faq.push({
      q: "Are these numbers exact?",
      a: "No. They are estimates based on the numbers you enter. They are not financial, tax, or career advice.",
    });
  }
  if (tool.disclaimer === "mockup") {
    faq.push({
      q: "Can I present this as a real screenshot?",
      a: "No. Output is labeled DEMO / MOCKUP / FICTIONAL. Do not use it as evidence, impersonation, or deception.",
    });
  }
  return faq;
}

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
