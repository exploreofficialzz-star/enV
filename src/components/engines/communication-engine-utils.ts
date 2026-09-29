export type Kind = "email" | "message" | "sms" | "meeting" | "agenda" | "minutes" | "signature" | "invitation" | "announcement" | "thank-you" | "follow-up" | "reminder";
export type Action = "generator" | "template" | "builder" | "planner" | "formatter";

export function parseToolId(toolId: string): { kind: Kind; action: Action } {
  const actions: Action[] = ["generator", "template", "builder", "planner", "formatter"];
  const action = actions.find((candidate) => toolId.endsWith(`-${candidate}`));
  if (!action) throw new Error(`Unsupported communication action: ${toolId}`);
  const prefix = toolId.slice(0, -(action.length + 1));
  const kinds: Kind[] = ["thank-you", "follow-up", "email", "message", "sms", "meeting", "agenda", "minutes", "signature", "invitation", "announcement", "reminder"];
  const kind = kinds.find((candidate) => prefix === candidate);
  if (!kind) throw new Error(`Unsupported communication type: ${toolId}`);
  return { kind, action };
}

export function kindLabel(kind: Kind) {
  return kind === "thank-you" ? "Thank You" : kind === "follow-up" ? "Follow Up" : kind[0].toUpperCase() + kind.slice(1);
}

export function buildCommunication(input: {
  kind: Kind; action: Action; name: string; subject: string; date: string; place: string;
  purpose: string; details: string; tone: string; items: string;
}) {
  const { kind, action, name, subject, date, place, purpose, details, tone, items } = input;
  const recipient = name.trim() || "[Recipient]";
  const title = subject.trim() || `${kindLabel(kind)}`;
  const context = purpose.trim() || "[Purpose / context]";
  const body = details.trim() || "[Add the main details here.]";
  const dateLine = date.trim() || "[Date / time]";
  const placeLine = place.trim() || "[Location / channel]";
  const lines = items.split(/\r?\n/).map((x) => x.trim()).filter(Boolean);

  if (action === "formatter") return formatCommunication(body, kind);
  if (action === "template") return templateFor(kind);

  if (kind === "email") return action === "planner"
    ? `EMAIL PLAN\n\nSubject: ${title}\nRecipient: ${recipient}\nPurpose: ${context}\nTone: ${tone}\n\nStructure:\n1. Greeting\n2. Purpose in the first paragraph\n3. Supporting details\n4. Clear request or next step\n5. Closing and signature`
    : `To: ${recipient}\nSubject: ${title}\n\nHello ${recipient},\n\n${body}\n\n${action === "builder" ? `Next step: ${context}.\n\n` : ""}Best regards,\n[Your name]`;

  if (kind === "message" || kind === "sms") return action === "planner"
    ? `${kindLabel(kind).toUpperCase()} PLAN\n\nAudience: ${recipient}\nPurpose: ${context}\nTone: ${tone}\n\nKey points:\n${lines.map((x, i) => `${i + 1}. ${x}`).join("\n") || "1. Main point\n2. Required action"}`
    : `${action === "builder" ? `To: ${recipient}\n` : ""}${action === "builder" ? `Purpose: ${context}\n\n` : ""}${body}`;

  if (kind === "meeting") return action === "planner"
    ? `MEETING PLAN\n\n${title}\nDate/time: ${dateLine}\nLocation: ${placeLine}\nPurpose: ${context}\n\nAgenda:\n${lines.map((x, i) => `${i + 1}. ${x}`).join("\n")}`
    : `MEETING: ${title}\nDate/time: ${dateLine}\nLocation: ${placeLine}\nAttendee: ${recipient}\nPurpose: ${context}\n\n${body}`;

  if (kind === "agenda" || kind === "minutes") {
    const heading = kind === "agenda" ? "AGENDA" : "MEETING MINUTES";
    return `${heading}\n${title}\nDate/time: ${dateLine}\nLocation: ${placeLine}\n\n${lines.map((x, i) => `${i + 1}. ${x}`).join("\n") || `1. ${body}`}\n\nNotes: ${body}`;
  }

  if (kind === "signature") return action === "planner"
    ? `SIGNATURE PLAN\n\nName: ${recipient}\nRole/context: ${context}\n\nInclude:\n• Full name\n• Role or organization\n• Contact method\n• Optional website or social link\n• Optional legal/disclaimer line`
    : `${recipient}\n${context}\n${body}`;

  if (kind === "invitation") return `YOU'RE INVITED\n\n${title}\n\nWhen: ${dateLine}\nWhere: ${placeLine}\n\n${body}\n\nPlease confirm your attendance.`;
  if (kind === "announcement") return `ANNOUNCEMENT\n\n${title}\n\n${body}\n\nEffective: ${dateLine}\nNext step: ${context}`;
  if (kind === "thank-you") return `Dear ${recipient},\n\nThank you for ${context}. ${body}\n\nI truly appreciate your time and support.\n\nWarm regards,\n[Your name]`;
  if (kind === "follow-up") return `Subject: Follow-up — ${title}\n\nHello ${recipient},\n\nI am following up regarding ${context}. ${body}\n\nPlease let me know the next step when convenient.\n\nBest regards,\n[Your name]`;
  if (kind === "reminder") return `REMINDER\n\n${title}\nFor: ${recipient}\nWhen: ${dateLine}\nWhere: ${placeLine}\n\n${body}\n\nAction needed: ${context}`;

  return body;
}

function templateFor(kind: Kind) {
  const templates: Record<Kind, string> = {
    email: "To: [Recipient]\nSubject: [Subject]\n\nHello [Name],\n\n[Purpose and key details]\n\n[Requested action / next step]\n\nBest regards,\n[Your name]",
    message: "Hello [Name],\n\n[Main message]\n\n[Next step]",
    sms: "[Name], [short message]. [Action or next step].",
    meeting: "MEETING: [Title]\nDate/time: [Date]\nLocation: [Location]\nPurpose: [Purpose]\n\n[Key details]",
    agenda: "AGENDA — [Meeting]\n\n1. Welcome\n2. [Topic]\n3. [Topic]\n4. Questions\n5. Decisions and next steps",
    minutes: "MEETING MINUTES — [Meeting]\nDate: [Date]\n\nAttendees: [Names]\n\nDiscussion:\n[Notes]\n\nDecisions:\n[Decisions]\n\nAction items:\n[Owner — task — deadline]",
    signature: "[Full name]\n[Role / organization]\n[Phone or email]\n[Website]\n[Optional disclaimer]",
    invitation: "YOU'RE INVITED\n\n[Event title]\nWhen: [Date/time]\nWhere: [Location]\n\n[Event details]\n\nPlease RSVP by [Date].",
    announcement: "ANNOUNCEMENT\n\n[Headline]\n\n[What is changing / happening]\n\nEffective: [Date]\nNext step: [Action]",
    "thank-you": "Dear [Name],\n\nThank you for [reason].\n\n[Personal detail or appreciation]\n\nWarm regards,\n[Your name]",
    "follow-up": "Subject: Follow-up — [Topic]\n\nHello [Name],\n\nI am following up regarding [topic].\n\n[Question / next step]\n\nBest regards,\n[Your name]",
    reminder: "REMINDER\n\n[Task / event]\nWhen: [Date/time]\nWhere: [Location]\n\n[Important details]\nAction needed: [Action]",
  };
  return templates[kind];
}

function formatCommunication(text: string, kind: Kind) {
  const cleaned = text.replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();
  if (!cleaned) return `${kindLabel(kind)} Formatter\n\nPaste text above to format it.`;
  const sentences = cleaned.replace(/\s+/g, " ").split(/(?<=[.!?])\s+/).filter(Boolean);
  if (kind === "email") return `SUBJECT: [Add subject]\n\n${sentences.join(" ")}\n\nNEXT STEP: [Add requested action]\n\nSIGN-OFF: [Your name]`;
  if (kind === "meeting" || kind === "agenda" || kind === "minutes") return `${kindLabel(kind).toUpperCase()}\n\n${sentences.map((s, i) => `${i + 1}. ${s}`).join("\n")}`;
  return sentences.join("\n\n");
}
