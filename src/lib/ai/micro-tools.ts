export const AI_MICRO_TOOL_OPERATION = {
  "ai-meeting-agenda-generator": "agenda",
  "blog-outline-generator": "blog-outline",
  "call-to-action-generator": "cta",
  "expand-helper": "expand",
  "faq-generator": "faq",
  "feature-benefit-generator": "feature-benefit",
  "meeting-action-items": "actions",
  "product-title-generator": "product-title",
  "pros-cons-generator": "pros-cons",
  "shorten-helper": "shorten",
  "tiktok-caption-helper": "tt-caption",
  "youtube-description-helper": "yt-desc",
  "youtube-title-helper": "yt-title",
} as const;

export type AiMicroToolId = keyof typeof AI_MICRO_TOOL_OPERATION;
export type AiMicroOperation = (typeof AI_MICRO_TOOL_OPERATION)[AiMicroToolId];
export type AiMicroValues = Record<string, string>;

export function isAiMicroToolId(toolId: string): toolId is AiMicroToolId {
  return Object.hasOwn(AI_MICRO_TOOL_OPERATION, toolId);
}

export function operationForAiMicroTool(toolId: string): AiMicroOperation | undefined {
  return isAiMicroToolId(toolId) ? AI_MICRO_TOOL_OPERATION[toolId] : undefined;
}

export function isAiMicroOperation(operation: string): operation is AiMicroOperation {
  return Object.values(AI_MICRO_TOOL_OPERATION).includes(operation as AiMicroOperation);
}

const clean = (value: string | undefined, fallback: string) => (value ?? "").trim() || fallback;
const tonePhrase = (tone: string) => tone === "professional" ? "clear and professional" : tone === "bold" ? "confident and direct" : tone === "playful" ? "light and playful" : tone === "friendly" ? "warm and friendly" : "natural and conversational";
const numbered = (lines: string[], count: number) => lines.slice(0, Math.max(1, Math.min(count, lines.length))).map((line, index) => `${index + 1}. ${line}`).join("\n\n");
const splitList = (value: string) => value.split(/\n|,/).map((line) => line.trim()).filter(Boolean);

/** Exact deterministic generation contract shared by Web route tests and platform parity fixtures. */
export function generateAiMicroTool(operation: AiMicroOperation, values: AiMicroValues): string {
  const topic = clean(values.topic, "your topic");
  const audience = clean(values.audience, "your audience");
  const style = tonePhrase(clean(values.tone, "natural"));
  const parsedCount = Number(values.count || 5);
  const count = Number.isFinite(parsedCount) ? Math.max(1, Math.min(20, parsedCount)) : 5;

  if (["title", "yt-title"].includes(operation)) {
    return numbered([
      `${topic}: What ${audience} Should Know`,
      `How to Get Better Results With ${topic}`,
      `The Simple Guide to ${topic}`,
      `I Tried ${topic} — Here’s What I Learned`,
      `${topic} Explained Without the Jargon`,
      `5 Things ${audience} Should Know About ${topic}`,
      `Before You Start With ${topic}, Read This`,
      `A Practical ${topic} Guide for ${audience}`,
    ], count);
  }
  if (operation === "tt-caption") {
    return numbered([
      `${topic} made simple. Save this for later.`,
      `If you're into ${topic}, this one is for you.`,
      `A quick reminder for ${audience}: you don't need to overcomplicate ${topic}.`,
      `Learning ${topic} one step at a time. What would you add?`,
      `Here's the part about ${topic} people usually skip.`,
      `Small steps, better results. That's the goal with ${topic}.`,
      `Trying to understand ${topic}? Start here.`,
    ], count);
  }
  if (operation === "blog-outline") {
    return `Title: ${topic}\nAudience: ${audience}\nGoal: ${clean(values.goal, "Educate the reader")}\n\nOutline\n1. Introduction — the problem and why it matters\n2. What ${topic} means\n3. The key ideas ${audience} should understand\n4. Practical steps or examples\n5. Common mistakes to avoid\n6. Checklist / next steps\n7. Conclusion and CTA`;
  }
  if (operation === "cta") {
    return numbered([`Get started with ${topic}`, `Try ${topic} today`, `See how ${topic} can help`, `Learn more about ${topic}`, `Start creating with ${topic}`], 5);
  }
  if (operation === "expand") {
    return `${clean(values.text, "Your notes")}.\n\nKey context: explain why this matters, who it affects, and what should happen next. Add one practical example and finish with a clear next step.`;
  }
  if (operation === "faq") {
    const points = splitList(clean(values.points, "What it is\nHow it works"));
    return points.map((point) => `Q: ${point} about ${topic}?\nA: Explain ${point.toLowerCase()} in a concise, factual way for ${audience}.`).join("\n\n");
  }
  if (operation === "feature-benefit") {
    const lines = splitList(clean(values.benefit, "Saves time"));
    return lines.map((line) => `Feature: ${line}\nBenefit: Helps ${audience} get a clearer result with less friction.`).join("\n\n");
  }
  if (operation === "agenda") {
    const topics = splitList(clean(values.topics, "Progress\nBlockers\nDecisions\nNext steps"));
    return `Meeting goal: ${clean(values.goal, "Make a clear decision")}\n\nAgenda\n${topics.map((item, index) => `${index + 1}. ${item}`).join("\n")}\n\nClose with owners, deadlines, and unresolved questions.`;
  }
  if (operation === "actions") {
    const notes = clean(values.notes, "Person — task — deadline").split("\n").map((line) => line.trim()).filter(Boolean);
    return `Action items\n${notes.map((note, index) => `${index + 1}. ${note}`).join("\n")}\n\nBefore sharing, confirm each owner and deadline.`;
  }
  if (operation === "product-title") {
    const benefit = clean(values.benefit, "Simple and practical");
    return numbered([`${topic} — ${benefit}`, `${topic}: ${clean(values.benefit, "A better way to get started")}`, `The ${topic} Starter Guide`, `${topic} Made Simple`, `${topic} Toolkit`], 5);
  }
  if (operation === "pros-cons") {
    return `Decision worksheet: ${clean(values.option, "your option")}\n\nPros\n• Potential upside: ${topic} may help achieve the stated goal.\n• Can be tested with a small, measurable experiment.\n• Creates information for the next decision.\n\nCons / risks\n• Requires time, money, or attention.\n• Results may differ from assumptions.\n• A larger commitment may reduce flexibility.\n\nQuestions to verify\n• What is the smallest useful test?\n• What metric decides whether to continue?\n• What would make you stop or change direction?`;
  }
  if (operation === "shorten") {
    const text = clean(values.text, "Your original text");
    const words = text.split(/\s+/).filter(Boolean);
    return words.length > 28 ? `${words.slice(0, 28).join(" ")}…` : text;
  }
  if (operation === "yt-desc") {
    const points = splitList(clean(values.points, "Key points and practical examples"));
    return `${topic}\n\nIn this video, we break down ${topic} for ${audience} in a ${style} way.\n\nWhat you'll cover:\n${points.map((point) => `• ${point}`).join("\n")}\n\nIf you found this useful, save it for later and share it with someone working on the same goal.`;
  }
  throw new Error(`Unsupported AI micro-tool operation: ${operation}`);
}
