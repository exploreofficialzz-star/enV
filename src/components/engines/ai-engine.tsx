import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { FieldGrid, type UiField } from "@/components/engines/fields";
import { ErrorBanner } from "@/components/tools/error-banner";
import { CodeResult } from "@/components/engines/result-panel";
import { initialValues } from "@/components/engines/initial-values";

const TONES = [
  { value: "natural", label: "Natural" },
  { value: "professional", label: "Professional" },
  { value: "friendly", label: "Friendly" },
  { value: "bold", label: "Bold" },
  { value: "playful", label: "Playful" },
];

function clean(v: string | undefined, fallback: string) {
  const value = (v ?? "").trim();
  return value || fallback;
}

function fieldsFor(op: string): UiField[] {
  const tone: UiField = { name: "tone", label: "Tone", type: "select", defaultValue: "natural", options: TONES };
  const topic: UiField = { name: "topic", label: "Topic / subject", type: "text", defaultValue: "AI tools for creators" };
  const audience: UiField = { name: "audience", label: "Audience", type: "text", defaultValue: "creators and small businesses" };
  if (["title", "yt-title"].includes(op)) return [topic, audience, tone, { name: "count", label: "Options", type: "number", defaultValue: 8, min: 1, max: 20 }];
  if (["caption", "tt-caption"].includes(op)) return [topic, audience, tone, { name: "count", label: "Options", type: "number", defaultValue: 5, min: 1, max: 15 }];
  if (op === "bio") return [{ name: "role", label: "Role / what you do", type: "text", defaultValue: "AI music creator" }, audience, tone, { name: "count", label: "Options", type: "number", defaultValue: 5, min: 1, max: 15 }];
  if (op === "product-desc") return [{ name: "product", label: "Product name", type: "text", defaultValue: "AI Music Generator Class" }, { name: "features", label: "Features / benefits", type: "textarea", defaultValue: "Beginner friendly\nWorks from a smartphone\nUses accessible tools" }, audience, tone];
  if (op === "email") return [{ name: "purpose", label: "Email purpose", type: "text", defaultValue: "Introduce a new digital product" }, { name: "points", label: "Key points", type: "textarea", defaultValue: "What it does\nWho it is for\nHow to get started" }, tone];
  if (op === "prompt" || op === "prompt-improve") return [{ name: "task", label: op === "prompt" ? "Task" : "Existing prompt", type: "textarea", defaultValue: op === "prompt" ? "Create a launch plan for a digital product" : "Write a good social media post about my product." }, audience, tone];
  if (op === "alt") return [{ name: "image", label: "Describe the image", type: "textarea", defaultValue: "A person using a laptop to create music with AI" }, tone];
  if (op === "meta-desc") return [topic, { name: "page", label: "Page purpose", type: "textarea", defaultValue: "Explain the product, key benefits, and how visitors can get started." }, tone];
  if (op === "resume") return [{ name: "duty", label: "Duty / responsibility", type: "textarea", defaultValue: "Managed social media content and improved engagement" }, { name: "result", label: "Result or metric (optional)", type: "text", defaultValue: "increased engagement" }, tone];
  if (op === "yt-desc") return [topic, audience, tone, { name: "points", label: "Key points", type: "textarea", defaultValue: "Problem\nSolution\nPractical examples\nCall to action" }];
  if (["blog-outline", "content-brief", "idea", "ideas"].includes(op)) return [topic, audience, tone, { name: "goal", label: "Goal", type: "text", defaultValue: "Educate and give the reader a practical next step" }];
  if (["ad-copy", "cta", "hook", "product-title", "feature-benefit"].includes(op)) return [topic, audience, tone, { name: "benefit", label: "Main benefit", type: "text", defaultValue: "Save time and get started quickly" }];
  if (op === "faq") return [topic, audience, { name: "points", label: "Key points", type: "textarea", defaultValue: "What it is\nWho it is for\nHow it works\nPricing or access" }];
  if (op === "agenda") return [{ name: "goal", label: "Meeting goal", type: "text", defaultValue: "Plan the next launch" }, { name: "topics", label: "Topics", type: "textarea", defaultValue: "Progress\nBlockers\nDecisions\nNext steps" }];
  if (op === "actions") return [{ name: "notes", label: "Rough notes", type: "textarea", defaultValue: "John — finish landing page by Friday\nAda — confirm pricing\nTeam — test checkout" }];
  if (["rewrite", "shorten", "expand"].includes(op)) return [{ name: "text", label: "Text", type: "textarea", defaultValue: "We are launching a new product that helps people create useful content faster." }, tone];
  if (op === "pros-cons") return [topic, { name: "option", label: "Option / decision", type: "text", defaultValue: "Launch now vs wait for more features" }];
  return [topic, audience, tone];
}

function tonePhrase(tone: string) {
  return tone === "professional" ? "clear and professional" : tone === "bold" ? "confident and direct" : tone === "playful" ? "light and playful" : tone === "friendly" ? "warm and friendly" : "natural and conversational";
}

function numbered(lines: string[], count: number) {
  return lines.slice(0, Math.max(1, Math.min(count, lines.length))).map((x, i) => `${i + 1}. ${x}`).join("\n\n");
}

function run(op: string, v: Record<string, string>) {
  const topic = clean(v.topic, "your topic");
  const audience = clean(v.audience, "your audience");
  const tone = clean(v.tone, "natural");
  const style = tonePhrase(tone);
  const count = Math.max(1, Math.min(20, Number(v.count || 5)));

  if (["title", "yt-title"].includes(op)) {
    const lines = [
      `${topic}: What ${audience} Should Know`,
      `How to Get Better Results With ${topic}`,
      `The Simple Guide to ${topic}`,
      `I Tried ${topic} — Here’s What I Learned`,
      `${topic} Explained Without the Jargon`,
      `5 Things ${audience} Should Know About ${topic}`,
      `Before You Start With ${topic}, Read This`,
      `A Practical ${topic} Guide for ${audience}`,
    ];
    return numbered(lines, count);
  }
  if (["caption", "tt-caption"].includes(op)) {
    const lines = [
      `${topic} made simple. Save this for later.`,
      `If you're into ${topic}, this one is for you.`,
      `A quick reminder for ${audience}: you don't need to overcomplicate ${topic}.`,
      `Learning ${topic} one step at a time. What would you add?`,
      `Here's the part about ${topic} people usually skip.`,
      `Small steps, better results. That's the goal with ${topic}.`,
      `Trying to understand ${topic}? Start here.`,
    ];
    return numbered(lines, count);
  }
  if (op === "bio") {
    const role = clean(v.role, "creator");
    const lines = [
      `${role} | Helping ${audience} learn, create & grow.`,
      `${role} • ${topic} • Building in public.`,
      `Creating around ${topic}. Sharing what I learn along the way.`,
      `${role} | Making ${topic} easier to understand.`,
      `${role} focused on practical ideas for ${audience}.`,
    ];
    return numbered(lines, count);
  }
  if (op === "product-desc") {
    const product = clean(v.product, "your product");
    const features = clean(v.features, "Useful features and practical benefits").split(/\n|,/).map((x) => x.trim()).filter(Boolean);
    return `${product}\n\nA practical option for ${audience} who want a simple way to get started.\n\nKey benefits:\n${features.map((x) => `• ${x}`).join("\n")}\n\nPositioning style: ${style}.\n\nCTA: Get started and see what ${product} can help you create.`;
  }
  if (op === "email") {
    const purpose = clean(v.purpose, "share an update");
    const points = clean(v.points, "The main details").split(/\n|,/).map((x) => x.trim()).filter(Boolean);
    return `Subject: ${purpose}\n\nHi,\n\nI wanted to reach out about ${purpose.toLowerCase()}.\n\n${points.map((x) => `• ${x}`).join("\n")}\n\nIf this is relevant to you, take a look and let me know what you think.\n\nBest,`;
  }
  if (op === "prompt") return `ROLE\nYou are a helpful specialist supporting ${audience}.\n\nTASK\n${clean(v.task, "Complete the requested task")}.\n\nSTYLE\nUse a ${style} style.\n\nCONTEXT\nFocus on practical, accurate output. Avoid unnecessary filler and clearly state assumptions.\n\nOUTPUT\nReturn a useful, structured answer with headings or bullets where they improve readability.\n\nCHECK\nBefore answering, verify that the response directly addresses the task and is suitable for ${audience}.`;
  if (op === "prompt-improve") {
    const original = clean(v.task, "Write a social media post about my product.");
    return `Improved prompt:\n\nRewrite the following request into a precise, ${style} instruction for an AI assistant serving ${audience}. Preserve the original intent, add useful context placeholders where information is missing, specify the desired output format, and avoid inventing facts.\n\nOriginal request:\n${original}\n\nSuggested output format:\n1. Goal\n2. Context\n3. Constraints\n4. Tone\n5. Deliverable\n6. Quality checks`;
  }
  if (op === "alt") return `Alt text: ${clean(v.image, "An image showing the described subject")}. Keep the final published alt text concise, describe the meaningful visual content, and omit decorative details that do not help someone understand the image.`;
  if (op === "meta-desc") return `${topic} — ${clean(v.page, "Learn the key details, benefits, and practical next steps.")} Start here for a concise overview and useful guidance.`.slice(0, 160);
  if (op === "resume") {
    const duty = clean(v.duty, "Managed a project");
    const result = clean(v.result, "improved outcomes");
    return numbered([
      `${duty}, contributing to ${result}.`,
      `Led ${duty.toLowerCase()} and delivered measurable progress toward ${result}.`,
      `Executed ${duty.toLowerCase()}, helping the team achieve ${result}.`,
      `Owned ${duty.toLowerCase()} with a focus on ${result}.`,
    ], 4);
  }
  if (op === "yt-desc") {
    const points = clean(v.points, "Key points and practical examples").split(/\n|,/).map((x) => x.trim()).filter(Boolean);
    return `${topic}\n\nIn this video, we break down ${topic} for ${audience} in a ${style} way.\n\nWhat you'll cover:\n${points.map((x) => `• ${x}`).join("\n")}\n\nIf you found this useful, save it for later and share it with someone working on the same goal.`;
  }
  if (op === "blog-outline") {
    return `Title: ${topic}\nAudience: ${audience}\nGoal: ${clean(v.goal, "Educate the reader")}\n\nOutline\n1. Introduction — the problem and why it matters\n2. What ${topic} means\n3. The key ideas ${audience} should understand\n4. Practical steps or examples\n5. Common mistakes to avoid\n6. Checklist / next steps\n7. Conclusion and CTA`;
  }
  if (op === "content-brief") return `Content brief\nTopic: ${topic}\nAudience: ${audience}\nGoal: ${clean(v.goal, "Educate and help the reader act")}\nTone: ${style}\n\nCore question: What does the reader need to know or do?\nPrimary sections: problem → context → solution → examples → next step\nCTA: Give the reader one clear action to take.`;
  if (op === "ad-copy") return numbered([`Stop overcomplicating ${topic}. Get ${clean(v.benefit, "a useful result")} with a simple approach.`, `${topic} for ${audience}: practical, clear, and built around ${clean(v.benefit, "a useful result")}.`, `Ready to make ${topic} easier? Start with ${clean(v.benefit, "a useful result")} and take the next step today.`], 3);
  if (op === "cta") return numbered([`Get started with ${topic}`, `Try ${topic} today`, `See how ${topic} can help`, `Learn more about ${topic}`, `Start creating with ${topic}`], 5);
  if (op === "hook") return numbered([`Most people overcomplicate ${topic}.`, `Before you try ${topic}, know this.`, `Here's what I wish I knew about ${topic}.`, `If you're a ${audience}, save this.`, `The simple way to approach ${topic}.`], 5);
  if (op === "product-title") return numbered([`${topic} — ${clean(v.benefit, "Simple and practical")}`, `${topic}: ${clean(v.benefit, "A better way to get started")}`, `The ${topic} Starter Guide`, `${topic} Made Simple`, `${topic} Toolkit`], 5);
  if (op === "feature-benefit") { const lines = clean(v.benefit, "Saves time").split(/\n|,/).map((x) => x.trim()).filter(Boolean); return lines.map((x) => `Feature: ${x}\nBenefit: Helps ${audience} get a clearer result with less friction.`).join("\n\n"); }
  if (op === "faq") { const points = clean(v.points, "What it is\nHow it works").split(/\n|,/).map((x) => x.trim()).filter(Boolean); return points.map((x) => `Q: ${x} about ${topic}?\nA: Explain ${x.toLowerCase()} in a concise, factual way for ${audience}.`).join("\n\n"); }
  if (op === "agenda") { const points = clean(v.topics, "Progress\nBlockers\nDecisions\nNext steps").split(/\n|,/).map((x) => x.trim()).filter(Boolean); return `Meeting goal: ${clean(v.goal, "Make a clear decision")}\n\nAgenda\n${points.map((x, i) => `${i + 1}. ${x}`).join("\n")}\n\nClose with owners, deadlines, and unresolved questions.`; }
  if (op === "actions") { const notes = clean(v.notes, "Person — task — deadline").split(/\n/).map((x) => x.trim()).filter(Boolean); return `Action items\n${notes.map((x, i) => `${i + 1}. ${x}`).join("\n")}\n\nBefore sharing, confirm each owner and deadline.`; }
  if (op === "rewrite") return `Rewritten in a ${style} tone:\n\n${clean(v.text, "Your original text")}\n\nEdit for clarity, natural flow, and consistent tone before publishing.`;
  if (op === "shorten") { const text = clean(v.text, "Your original text"); const words = text.split(/\s+/).filter(Boolean); return words.length > 28 ? `${words.slice(0, 28).join(" ")}…` : text; }
  if (op === "expand") return `${clean(v.text, "Your notes")}.\n\nKey context: explain why this matters, who it affects, and what should happen next. Add one practical example and finish with a clear next step.`;
  if (op === "pros-cons") return `Decision worksheet: ${clean(v.option, "your option")}\n\nPros\n• Potential upside: ${topic} may help achieve the stated goal.\n• Can be tested with a small, measurable experiment.\n• Creates information for the next decision.\n\nCons / risks\n• Requires time, money, or attention.\n• Results may differ from assumptions.\n• A larger commitment may reduce flexibility.\n\nQuestions to verify\n• What is the smallest useful test?\n• What metric decides whether to continue?\n• What would make you stop or change direction?`;
  if (["idea", "ideas"].includes(op)) return numbered([`How-to: ${topic} for ${audience}`, `Common mistake: ${topic}`, `Case study: a real example of ${topic}`, `Checklist: getting started with ${topic}`, `Myth vs fact: ${topic}`, `Quick tips: ${topic}`, `Beginner guide: ${topic}`, `Behind the scenes: working on ${topic}`], 8);
  return `${topic}\n\nA ${style} draft for ${audience}.`;
}

export function AiEngine({ op }: { op: string }) {
  const fields = useMemo(() => fieldsFor(op), [op]);
  const [values, setValues] = useState(() => initialValues(fields));
  const [out, setOut] = useState("");
  const [error, setError] = useState<string | null>(null);
  const runTool = () => {
    try { setError(null); setOut(run(op, values)); }
    catch (e) { setError(e instanceof Error ? e.message : "Could not run AI micro-tool."); }
  };
  return <div className="space-y-4">
    <div className="rounded-lg border border-border/60 bg-muted/30 p-3 text-sm text-subtle">The Generate button here runs locally with deterministic templates. It does not send your text anywhere and does not claim to be an LLM.</div>
    <FieldGrid fields={fields} values={values} onChange={(name, value) => setValues((x) => ({ ...x, [name]: value }))} />
    <div className="flex flex-wrap gap-2"><Button type="button" onClick={runTool}>Generate</Button><Button type="button" variant="ghost" onClick={() => { setOut(""); setError(null); }}>Clear</Button></div>
    <ErrorBanner message={error} />
    <CodeResult code={out} filename={`env-ai-${op}.txt`} />
  </div>;
}
