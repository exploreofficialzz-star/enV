export type RelationshipWorkflow = "generator" | "quiz" | "interactive-page" | "message-builder" | "reveal-page" | "countdown-page";

const FAMILY_RULES: Record<string, { label: string; workflows: RelationshipWorkflow[] }> = {
  crush: { label: "Crush", workflows: ["generator","quiz","interactive-page","message-builder","reveal-page","countdown-page"] },
  "ask-out": { label: "Ask-Out", workflows: ["quiz","interactive-page","message-builder","reveal-page","countdown-page"] },
  valentine: { label: "Valentine", workflows: ["generator","quiz","interactive-page","message-builder","reveal-page","countdown-page"] },
  friendship: { label: "Friendship", workflows: ["generator","quiz","interactive-page","message-builder","reveal-page","countdown-page"] },
  couple: { label: "Couple", workflows: ["generator","quiz","interactive-page","message-builder","reveal-page","countdown-page"] },
  appreciation: { label: "Appreciation", workflows: ["generator","quiz","interactive-page","message-builder","reveal-page","countdown-page"] },
  confession: { label: "Confession", workflows: ["generator","quiz","interactive-page","message-builder","reveal-page","countdown-page"] },
  "love-letter": { label: "Love Letter", workflows: ["generator","quiz","interactive-page","message-builder","reveal-page","countdown-page"] },
  compatibility: { label: "Compatibility", workflows: ["generator","quiz","interactive-page","message-builder","reveal-page","countdown-page"] },
  memory: { label: "Memory", workflows: ["quiz","interactive-page","message-builder","reveal-page","countdown-page"] },
  question: { label: "Question", workflows: ["quiz","interactive-page","message-builder","reveal-page","countdown-page"] },
  surprise: { label: "Surprise", workflows: ["quiz","interactive-page","message-builder","reveal-page","countdown-page"] },
};

export function parseRelationshipToolId(toolId: string): { family: string; workflow: RelationshipWorkflow } {
  const match = toolId.match(/^(.+)-(generator|quiz|interactive-page|message-builder|reveal-page|countdown-page)$/);
  if (!match || !FAMILY_RULES[match[1]] || !FAMILY_RULES[match[1]].workflows.includes(match[2] as RelationshipWorkflow)) {
    throw new Error(`Unsupported relationship tool: ${toolId}`);
  }
  return { family: match[1], workflow: match[2] as RelationshipWorkflow };
}

export interface RelationshipInput {
  person: string;
  otherPerson: string;
  details: string;
  tone: string;
  date: string;
  answers: string[];
}

const esc = (value: string) => value.replace(/[&<>"']/g, (c) => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]!));
const title = (value: string) => value.replace(/-/g, " ").replace(/\b\w/g, (m) => m.toUpperCase());

function clean(value: string, fallback: string) { return value.trim() || fallback; }

const questionSets: Record<string, string[]> = {
  crush: ["How well do you know each other?", "What shared activity sounds most fun?", "Which quality matters most?", "What would make a great first hangout?", "How direct should the invitation be?"],
  "ask-out": ["Where would you both enjoy going?", "What day works best?", "What tone feels natural?", "How should the invitation be delivered?", "What is a comfortable backup plan?"],
  valentine: ["What is their favorite kind of date?", "Which small gift feels personal?", "What shared memory should be mentioned?", "What tone should the message use?", "What makes the day feel special?"],
  friendship: ["What do you enjoy doing together?", "Which memory best represents the friendship?", "What quality do you appreciate most?", "What should you do together next?", "What makes the friendship feel supportive?"],
  couple: ["What is your favorite shared memory?", "What activity should you plan next?", "Which value matters most to you both?", "How do you prefer to resolve disagreements?", "What future moment would you like to create?"],
  appreciation: ["What specific action are you grateful for?", "When did it make a difference?", "Which quality deserves recognition?", "How would you like to show appreciation?", "What should you remember to say?"],
  confession: ["How long have you felt this way?", "What quality drew you in?", "What moment made it clear?", "How direct should you be?", "What outcome would feel respectful?"],
  "love-letter": ["What memory should open the letter?", "Which quality should be praised?", "What feeling should be expressed?", "What future hope should be included?", "How should the letter close?"],
  compatibility: ["How do you handle plans?", "How do you communicate under stress?", "What kind of time together feels best?", "Which shared value matters most?", "How do you balance independence and closeness?"],
  memory: ["Which shared memory comes first to mind?", "Where did it happen?", "What detail makes it memorable?", "What feeling does it bring back?", "What could you do to revisit it?"],
  question: ["What do you genuinely want to know?", "Why does the answer matter?", "What tone will feel comfortable?", "When is a good moment to ask?", "How will you listen to the answer?"],
  surprise: ["What does the person enjoy?", "What small detail would make it personal?", "When should the surprise happen?", "Who should be involved?", "What backup plan is safe?"],
};

export function scoreRelationshipQuiz(family: string, answers: string[]): number {
  if (!FAMILY_RULES[family] || !questionSets[family]) throw new Error("Unsupported relationship quiz.");
  const answered = answers.filter((a) => a.trim()).length;
  return Math.round((answered / questionSets[family].length) * 100);
}

export function buildRelationshipOutput(family: string, workflow: RelationshipWorkflow, input: RelationshipInput): string {
  const rule = FAMILY_RULES[family];
  if (!rule || !rule.workflows.includes(workflow)) throw new Error("Unsupported relationship operation.");
  const person = clean(input.person, "Your Name");
  const other = clean(input.otherPerson, "Their Name");
  const details = clean(input.details, "a thoughtful moment together");
  const tone = clean(input.tone, "warm");

  if (workflow === "generator") {
    return `${rule.label} Generator\n\nFor: ${other}\nTone: ${tone}\n\n${family === "friendship" ? `I appreciate the friendship we have. ${details}. Let’s make another good memory soon.` : family === "appreciation" ? `I appreciate you, ${other}. ${details}. Thank you for being someone I can count on.` : `I’ve been thinking about ${other}. ${details}. I’d love to share a meaningful moment together soon.`}`;
  }

  if (workflow === "quiz") {
    const qs = questionSets[family];
    if (!qs) throw new Error("Quiz questions unavailable.");
    const score = scoreRelationshipQuiz(family, input.answers);
    return `${rule.label} Quiz\n\n${qs.map((q, i) => `${i + 1}. ${q}\n   Answer: ${input.answers[i]?.trim() || "(not answered)"}`).join("\n\n")}\n\nCompletion score: ${score}%`;
  }

  if (workflow === "message-builder") {
    return `Message to ${other}\n\nHi ${other},\n\nI wanted to say this in a ${tone} way: ${details}.\n\nNo pressure to respond immediately — I just wanted to be honest and thoughtful.\n\n— ${person}`;
  }

  if (workflow === "reveal-page") {
    return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(rule.label)} Reveal</title></head><body><main><p>${esc(person)} prepared something for ${esc(other)}.</p><button onclick="this.nextElementSibling.hidden=false">Reveal</button><p hidden>${esc(details)}</p></main></body></html>`;
  }

  if (workflow === "interactive-page") {
    const qs = questionSets[family] ?? [];
    return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(rule.label)}</title></head><body><main><h1>${esc(rule.label)}</h1><p>For ${esc(other)}</p><ol>${qs.map((q) => `<li>${esc(q)}</li>`).join("")}</ol><button onclick="document.querySelector('#message').hidden=false">Show message</button><p id="message" hidden>${esc(details)}</p></main></body></html>`;
  }

  if (!input.date || Number.isNaN(Date.parse(input.date))) throw new Error("Enter a valid future date for the countdown.");
  const target = new Date(input.date);
  if (target.getTime() <= Date.now()) throw new Error("Countdown date must be in the future.");
  const iso = target.toISOString();
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(rule.label)} Countdown</title></head><body><main><h1>${esc(rule.label)} countdown</h1><p>For ${esc(other)}</p><strong id="countdown"></strong><script>const target=new Date(${JSON.stringify(iso)}).getTime();const el=document.getElementById('countdown');function tick(){const d=Math.max(0,target-Date.now());const s=Math.floor(d/1000);el.textContent=d?' '+Math.floor(s/86400)+'d '+Math.floor(s%86400/3600)+'h '+Math.floor(s%3600/60)+'m '+s%60+'s':'It is time!';}tick();setInterval(tick,1000);</script></main></body></html>`;
}

export const relationshipFamilies = Object.keys(FAMILY_RULES);
