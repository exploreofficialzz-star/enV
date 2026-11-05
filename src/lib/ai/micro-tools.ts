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
const numbered = (lines: string[], count: number) => lines.slice(0, Math.max(1, Math.min(count, lines.length))).map((line, index) => (index + 1) + ". " + line).join("\n\n");
const splitList = (value: string) => value.split(/\r?\n|,/u).map((line) => line.trim()).filter(Boolean);
const wordsIn = (value: string) => value.trim() ? value.trim().split(/\s+/u).length : 0;

function shortenExtractively(value: string, requestedWords: number): string {
  const text = value.replace(/\s+/gu, " ").trim();
  const target = Number.isFinite(requestedWords) ? Math.max(10, Math.min(500, Math.trunc(requestedWords))) : 60;
  if (wordsIn(text) <= target) return text;
  const sentences = (text.match(/[^.!?]+[.!?]+["')\]]*|[^.!?]+$/gu) ?? [text]).map((sentence) => sentence.trim()).filter(Boolean);
  if (sentences.length > 1) {
    const selected: string[] = [];
    let count = 0;
    for (const sentence of sentences) {
      const sentenceWords = wordsIn(sentence);
      if (selected.length > 0 && count + sentenceWords > target) break;
      selected.push(sentence);
      count += sentenceWords;
      if (count >= target) break;
    }
    return selected.join(" ").replace(/\s+$/u, "").replace(/[.!?…]+$/u, "") + "…";
  }
  return text.split(/\s+/u).slice(0, target).join(" ") + "…";
}

function boundedYouTubeTitle(value: string): string {
  const text = value.replace(/\s+/gu, " ").trim();
  if (text.length <= 100) return text;
  const prefix = text.slice(0, 99);
  const boundary = prefix.lastIndexOf(" ");
  return (boundary > 45 ? prefix.slice(0, boundary) : prefix).trim() + "…";
}

function parseQuestionAnswers(value: string): Map<string, string> {
  const answers = new Map<string, string>();
  for (const line of value.split(/\r?\n/u).map((entry) => entry.trim()).filter(Boolean)) {
    const separator = line.indexOf("|");
    if (separator < 1) continue;
    const question = line.slice(0, separator).trim().toLocaleLowerCase();
    const answer = line.slice(separator + 1).trim();
    if (question && answer) answers.set(question, answer);
  }
  return answers;
}

/** Deterministic local generation contract shared by Web, Kotlin and Swift. */
export function generateAiMicroTool(operation: AiMicroOperation, values: AiMicroValues): string {
  const topic = clean(values.topic, "your topic");
  const audience = clean(values.audience, "your audience");
  const style = tonePhrase(clean(values.tone, "natural"));
  const parsedCount = Number(values.count || 5);
  const count = Number.isFinite(parsedCount) ? Math.max(1, Math.min(20, Math.trunc(parsedCount))) : 5;

  if (["title", "yt-title"].includes(operation)) {
    const keyword = clean(values.keyword, topic);
    const angle = clean(values.angle, "a practical guide");
    const candidates = [
      keyword + ": " + angle + " for " + audience,
      "How " + audience + " can get started with " + topic,
      topic + ", explained: " + angle,
      "What to know before you try " + topic,
      "The " + topic + " checklist for " + audience,
      "Common " + topic + " mistakes and how to avoid them",
      "A step-by-step guide to " + topic,
      topic + ": key ideas, examples and next steps",
    ].map(boundedYouTubeTitle);
    return numbered([...new Set(candidates)], count);
  }
  if (operation === "tt-caption") {
    const action = clean(values.cta, "What would you add?");
    const hook = clean(values.hook, "A useful reminder");
    return numbered([
      hook + ": " + topic + ". " + action,
      "A practical note for " + audience + ": " + topic + " is worth exploring one step at a time.",
      "Save this if " + topic + " is on your list. " + action,
      "One idea to take away about " + topic + ": start small, then build on what works.",
      "For " + audience + ": here is a fresh way to think about " + topic + ". " + action,
      "Quick breakdown: " + topic + ". Keep what works for you and test the rest.",
      "What is one thing you would change about " + topic + "? " + action,
    ], count);
  }
  if (operation === "blog-outline") {
    const goal = clean(values.goal, "Help the reader understand the topic and take a useful next step");
    const angle = clean(values.angle, "Explain the practical problem before presenting the solution");
    const keyPoints = splitList(values.keyPoints ?? "");
    const cta = clean(values.cta, "[Add one relevant next step for the reader]");
    return [
      "CONTENT BRIEF\nTopic: " + topic + "\nAudience: " + audience + "\nGoal: " + goal + "\nEditorial angle: " + angle,
      "OUTLINE\n1. Opening: name the reader's problem and why it matters\n2. The essentials: define " + topic + " in plain language\n3. The decision: explain the main choices, trade-offs or criteria\n4. Practical walkthrough: arrange the steps in the order a reader should use them\n5. Example or evidence: use a real example, source or supplied detail\n6. Common mistakes: explain what to check before acting\n7. Recap: summarise the useful points and answer the opening question\n8. Next step: " + cta,
      keyPoints.length ? "SUPPLIED FACTS / POINTS TO INCLUDE\n" + keyPoints.map((point) => "• " + point).join("\n") : "RESEARCH CHECK\nAdd verified facts, examples and sources before making factual claims.",
      "EDITORIAL CHECK\nKeep each section useful to the stated audience. Remove repeated points and do not present assumptions as evidence.",
    ].join("\n\n");
  }
  if (operation === "cta") {
    const action = clean(values.action, "Learn more");
    const benefit = clean(values.benefit, "");
    const promise = benefit ? " to " + benefit : "";
    const candidates = [
      action + promise,
      "Ready to explore " + topic + "? " + action + ".",
      "Take the next step with " + topic + ": " + action + ".",
      "See whether " + topic + " fits your needs. " + action + ".",
      audience + ": make your next move on " + topic + ". " + action + ".",
    ];
    return numbered([...new Set(candidates)], 5) + (benefit ? "" : "\n\nAdd a specific, supportable benefit before publishing a stronger promise.");
  }
  if (operation === "expand") {
    const source = clean(values.text, "");
    if (!source) return "Add the text or notes you want to expand, then generate again.";
    const context = clean(values.context, "[Add why this matters. Do not publish this placeholder.]");
    const example = clean(values.example, "[Add a real example or remove this section.]");
    const nextStep = clean(values.nextStep, "[Add the action, decision or response needed.]");
    const targetAudience = clean(values.audience, "[Name the reader or audience.]");
    return [
      source,
      "WHY IT MATTERS\n" + context,
      "WHO IT AFFECTS\nWrite for: " + targetAudience,
      "EXAMPLE / SUPPORTING DETAIL\n" + example,
      "NEXT STEP\n" + nextStep,
      "EDITORIAL NOTE\nReplace every bracketed prompt with verified, relevant detail. This local expansion scaffold does not invent supporting facts.",
    ].join("\n\n");
  }
  if (operation === "faq") {
    const questions = splitList(values.points ?? "");
    if (!questions.length) return "Add one question per line, then generate the FAQ.";
    const verifiedAnswers = parseQuestionAnswers(values.answers ?? "");
    const missing: string[] = [];
    const output = questions.map((question) => {
      const answer = verifiedAnswers.get(question.toLocaleLowerCase());
      if (!answer) missing.push(question);
      return "Q: " + question + "\nA: " + (answer ?? "[Add a verified answer before publishing.]");
    });
    return output.join("\n\n") + (missing.length ? "\n\nNEEDS AN ANSWER\n" + missing.map((question) => "• " + question).join("\n") + "\n\nOnly publish answers confirmed by your product, policy or source material." : "");
  }
  if (operation === "feature-benefit") {
    const features = splitList(values.benefit ?? "");
    if (!features.length) return "Add one product feature per line.";
    const outcomes = splitList(values.outcomes ?? "");
    return features.map((feature, index) => {
      const outcome = outcomes[index];
      return "Feature: " + feature + "\nCustomer outcome: " + (outcome ?? "[Add the specific result this feature creates.]") + "\nEvidence to support the claim: [Add a measured result, user example or verified product detail.]";
    }).join("\n\n") + (outcomes.length > features.length ? "\n\nNote: extra outcome entries were not matched to a feature and were left out." : "");
  }
  if (operation === "agenda") {
    const goal = clean(values.goal, "Make a clear decision");
    const points = splitList(clean(values.topics, "Progress\nBlockers\nDecisions\nNext steps"));
    const requestedDuration = Number(values.duration || 30);
    const duration = Number.isFinite(requestedDuration) ? Math.max(points.length, Math.min(600, Math.trunc(requestedDuration))) : Math.max(30, points.length);
    const base = Math.floor(duration / points.length);
    const remainder = duration % points.length;
    return "Meeting goal: " + goal + "\nPlanned duration: " + duration + " minutes\n\nAGENDA\n" + points.map((item, index) => (index + 1) + ". " + item + " — " + (base + (index < remainder ? 1 : 0)) + " min").join("\n") + "\n\nCLOSE\nConfirm decisions, owners, deadlines and unresolved questions before ending.";
  }
  if (operation === "actions") {
    const lines = (values.notes ?? "").split(/\r?\n/u).map((line) => line.trim()).filter(Boolean);
    if (!lines.length) return "Add one action item per line. Use Owner | Action | Due date | Priority where possible.";
    const parsed = lines.map((line) => {
      const parts = line.split("|").map((part) => part.trim());
      if (parts.length === 1) return { owner: "[Assign owner]", action: parts[0], due: "[Add due date]", priority: "Not set" };
      return { owner: parts[0] || "[Assign owner]", action: parts[1] || "[Describe action]", due: parts[2] || "[Add due date]", priority: parts[3] || "Not set" };
    });
    const incomplete = parsed.filter((item) => item.owner.startsWith("[") || item.due.startsWith("[") || item.action.startsWith("[")).length;
    return "ACTION REGISTER\n" + parsed.map((item, index) => (index + 1) + ". Owner: " + item.owner + " | Action: " + item.action + " | Due: " + item.due + " | Priority: " + item.priority).join("\n") + "\n\nFOLLOW-UP\n" + (incomplete ? incomplete + " item(s) need an owner, action or due date confirmed." : "Review owners and dates with the team before sharing.") + "\nStatus has not been inferred; update it after the meeting.";
  }
  if (operation === "product-title") {
    const benefit = clean(values.benefit, "");
    const keyword = clean(values.keyword, "");
    const target = clean(values.audience, "");
    const base = keyword || topic;
    const audienceSuffix = target ? " for " + target : "";
    const candidates = [
      benefit ? base + " — " + benefit : base + ": A practical guide",
      "The " + base + " guide" + audienceSuffix,
      base + ": Features, uses and key details",
      "Getting started with " + base,
      "A closer look at " + base,
      base + ": What to know before you choose",
    ];
    return numbered([...new Set(candidates)], 6);
  }
  if (operation === "pros-cons") {
    const option = clean(values.option, "the option being considered");
    const upsides = splitList(values.upsides ?? "");
    const risks = splitList(values.risks ?? "");
    const criteria = splitList(values.criteria ?? "");
    return [
      "DECISION: " + option,
      "UPSIDE TO VERIFY\n" + (upsides.length ? upsides.map((item) => "• " + item).join("\n") : "• [Add observed advantages or expected benefits.]"),
      "RISKS / COSTS TO CHECK\n" + (risks.length ? risks.map((item) => "• " + item).join("\n") : "• [Add known risks, costs or trade-offs.]"),
      "DECISION CRITERIA\n" + (criteria.length ? criteria.map((item) => "• " + item).join("\n") : "• What measurable result would make this worthwhile?\n• What is the smallest safe test?\n• What evidence would make you stop or change course?"),
      "EVIDENCE CHECK\nSeparate measured results from assumptions. Do not treat a blank section as proof that no risk or benefit exists.",
    ].join("\n\n");
  }
  if (operation === "shorten") {
    const text = clean(values.text, "");
    if (!text) return "Add the text you want to shorten.";
    const parsedTarget = Number(values.count || 60);
    return shortenExtractively(text, Number.isFinite(parsedTarget) ? parsedTarget : 60);
  }
  if (operation === "yt-desc") {
    const points = splitList(values.points ?? "");
    const links = splitList(values.links ?? "");
    const chapters = splitList(values.chapters ?? "");
    const cta = clean(values.cta, "[Add one clear viewer action.]");
    const sections = [
      topic,
      "This video covers " + topic + (audience ? " for " + audience : "") + ". The description uses a " + style + " tone and only relies on the details supplied here.",
      points.length ? "WHAT YOU'LL LEARN\n" + points.map((point) => "• " + point).join("\n") : "WHAT YOU'LL LEARN\n[Add the key points covered in the video.]",
      chapters.length ? "CHAPTERS\n" + chapters.join("\n") : "",
      links.length ? "LINKS / RESOURCES\n" + links.join("\n") : "",
      "NEXT STEP\n" + cta,
      "Check every link, chapter time and factual claim before publishing.",
    ].filter(Boolean);
    return sections.join("\n\n");
  }
  throw new Error("Unsupported AI micro-tool operation: " + operation);
}
