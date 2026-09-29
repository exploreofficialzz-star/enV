export type InteractiveWorkflow = "generator" | "page-builder" | "experience-builder" | "template" | "shareable-page";

const FAMILY_LABELS: Record<string, string> = {
  "ask-out": "Ask-Out", question: "Question", "yes-no": "Yes-No", reveal: "Reveal", surprise: "Surprise",
  quiz: "Quiz", memory: "Memory", story: "Story", choice: "Choice", decision: "Decision", countdown: "Countdown",
  "interactive-card": "Interactive Card", "interactive-letter": "Interactive Letter", "interactive-invitation": "Interactive Invitation", "interactive-message": "Interactive Message",
};

const GENERATORS = new Set(["ask-out", "question", "reveal", "surprise", "quiz", "memory", "choice", "countdown", "interactive-card", "interactive-letter", "interactive-invitation", "interactive-message"]);
const QUESTIONS: Record<string, string[]> = {
  "ask-out": ["Where would you like to go?", "What day works?", "What should the invitation say?"],
  question: ["What do you want to ask?", "Why does the answer matter?", "What tone feels right?"],
  "yes-no": ["What decision needs a yes or no?"],
  reveal: ["What should be revealed?"], surprise: ["What would make the surprise personal?"],
  quiz: ["Question one", "Question two", "Question three"], memory: ["What memory should be remembered?"],
  story: ["What is the opening?", "What happens next?", "How should it end?"],
  choice: ["What are the choices?", "What happens after a choice?"], decision: ["What decision is being made?", "What are the options?"],
  countdown: ["What date and time should be counted down to?"], "interactive-card": ["What should the card say?"],
  "interactive-letter": ["What should the letter say?"], "interactive-invitation": ["What event is being invited to?"], "interactive-message": ["What message should appear?"]
};

export function parseInteractiveToolId(toolId: string): { family: string; workflow: InteractiveWorkflow } {
  const match = toolId.match(/^(.+)-(generator|page-builder|experience-builder|template|shareable-page)$/);
  if (!match || !FAMILY_LABELS[match[1]]) throw new Error(`Unsupported interactive tool: ${toolId}`);
  const workflow = match[2] as InteractiveWorkflow;
  if (workflow === "generator" && !GENERATORS.has(match[1])) throw new Error(`Generator unavailable for ${match[1]}.`);
  return { family: match[1], workflow };
}

export interface InteractiveInput { title: string; recipient: string; body: string; optionA: string; optionB: string; date: string; }
const esc = (v: string) => v.replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]!));
const clean = (v: string, fallback: string) => v.trim() || fallback;
const label = (family: string) => FAMILY_LABELS[family];

function validate(family: string, workflow: InteractiveWorkflow, input: InteractiveInput) {
  if (family === "countdown") {
    if (!input.date || Number.isNaN(Date.parse(input.date))) throw new Error("Enter a valid future date for the countdown.");
    if (new Date(input.date).getTime() <= Date.now()) throw new Error("Countdown date must be in the future.");
  }
  if (family === "choice" || family === "decision" || family === "yes-no") {
    if (!clean(input.optionA, "")) throw new Error("Enter the first option.");
    if (family !== "yes-no" && !clean(input.optionB, "")) throw new Error("Enter the second option.");
  }
}

export function buildInteractiveOutput(family: string, workflow: InteractiveWorkflow, input: InteractiveInput): string {
  if (!FAMILY_LABELS[family]) throw new Error("Unsupported interactive family.");
  validate(family, workflow, input);
  const name = label(family);
  const title = clean(input.title, `${name} Experience`);
  const recipient = clean(input.recipient, "Guest");
  const body = clean(input.body, `Welcome to this ${name.toLowerCase()} experience.`);
  const a = clean(input.optionA, "Yes");
  const b = clean(input.optionB, "Not yet");
  const pageTitle = esc(title);

  if (workflow === "generator" || workflow === "template") {
    return `${name} ${workflow === "template" ? "Template" : "Generator"}\n\nTitle: ${title}\nFor: ${recipient}\n\n${body}${family === "choice" || family === "decision" ? `\n\nOptions:\n1. ${a}\n2. ${b}` : ""}`;
  }
  if (workflow === "experience-builder" || workflow === "page-builder" || workflow === "shareable-page") {
    const interaction = family === "countdown"
      ? `<strong id="countdown"></strong><script>const t=new Date(${JSON.stringify(new Date(input.date).toISOString())}).getTime(),e=document.getElementById('countdown');function tick(){const d=Math.max(0,t-Date.now()),s=Math.floor(d/1000);e.textContent=d?' '+Math.floor(s/86400)+'d '+Math.floor(s%86400/3600)+'h '+Math.floor(s%3600/60)+'m '+s%60+'s':'It is time!';}tick();setInterval(tick,1000);</script>`
      : family === "yes-no" ? `<button onclick="document.getElementById('answer').textContent='${esc(a)}'">${esc(a)}</button><button onclick="document.getElementById('answer').textContent='No'">No</button><p id="answer"></p>`
      : family === "choice" || family === "decision" ? `<button onclick="document.getElementById('answer').textContent='${esc(a)}'">${esc(a)}</button><button onclick="document.getElementById('answer').textContent='${esc(b)}'">${esc(b)}</button><p id="answer"></p>`
      : family === "reveal" || family === "surprise" ? `<button onclick="document.getElementById('hidden').hidden=false">Reveal</button><p id="hidden" hidden>${esc(body)}</p>`
      : `<button onclick="document.getElementById('body').hidden=false">Continue</button><p id="body" hidden>${esc(body)}</p>`;
    return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${pageTitle}</title></head><body><main><h1>${pageTitle}</h1><p>For ${esc(recipient)}</p><p>${esc(body)}</p>${interaction}</main></body></html>`;
  }
  throw new Error("Unsupported interactive workflow.");
}

export const interactiveFamilies = Object.keys(FAMILY_LABELS);
export const interactiveQuestions = QUESTIONS;
