export type CelebrationOccasion =
  | "birthday" | "anniversary" | "graduation" | "valentine" | "christmas" | "new-year"
  | "congratulations" | "thank-you" | "appreciation" | "farewell" | "achievement" | "party";
export type CelebrationExperience =
  | "page-generator" | "interactive-card" | "invitation-generator" | "countdown"
  | "memory-page" | "reveal-page" | "quiz-generator" | "surprise-page";

export type CelebrationInput = {
  occasion: CelebrationOccasion;
  experience: CelebrationExperience;
  title?: string;
  honoree?: string;
  host?: string;
  date?: string;
  timezone?: string;
  location?: string;
  message?: string;
  details?: string;
  rsvpUrl?: string;
  contactMethod?: string;
  rsvpBy?: string;
  dressCode?: string;
  schedule?: string;
  memories?: string;
  revealMessage?: string;
  quizQuestion?: string;
  quizOptions?: string;
  quizAnswer?: string;
  theme?: string;
  photos?: string[];
};

const OCCASIONS: CelebrationOccasion[] = [
  "birthday", "anniversary", "graduation", "valentine", "christmas", "new-year",
  "congratulations", "thank-you", "appreciation", "farewell", "achievement", "party",
];
const EXPERIENCES: CelebrationExperience[] = [
  "page-generator", "interactive-card", "invitation-generator", "countdown",
  "memory-page", "reveal-page", "quiz-generator", "surprise-page",
];
const NOT_CATALOGUED_TOOL_IDS = new Set([
  "birthday-countdown",
  "valentine-reveal-page",
  "appreciation-reveal-page",
]);
const OCCASION_LABELS: Record<CelebrationOccasion, string> = {
  birthday: "Birthday", anniversary: "Anniversary", graduation: "Graduation",
  valentine: "Valentine's Day", christmas: "Christmas", "new-year": "New Year",
  congratulations: "Congratulations", "thank-you": "Thank You", appreciation: "Appreciation",
  farewell: "Farewell", achievement: "Achievement", party: "Party",
};
const OCCASION_COPY: Record<CelebrationOccasion, string> = {
  birthday: "Another year, another reason to celebrate.",
  anniversary: "A meaningful milestone in a story worth celebrating.",
  graduation: "A milestone earned through effort, growth and persistence.",
  valentine: "A moment to celebrate care, connection and the people who matter.",
  christmas: "Wishing you a season filled with warmth and good company.",
  "new-year": "A fresh chapter, new possibilities and a reason to gather.",
  congratulations: "Recognising a milestone and the work that made it possible.",
  "thank-you": "A thoughtful moment to recognise someone's kindness and support.",
  appreciation: "Taking time to recognise the people who make a difference.",
  farewell: "Celebrating the memories made and the next chapter ahead.",
  achievement: "A milestone worth recognising and remembering.",
  party: "Good people, a shared moment and a reason to celebrate.",
};
const THEMES: Record<string, { accent: string; background: string; ink: string; soft: string }> = {
  rose: { accent: "#9f4564", background: "#fff6f8", ink: "#39232d", soft: "#f7e3eb" },
  gold: { accent: "#946b12", background: "#fffaf0", ink: "#332a18", soft: "#f5ebd0" },
  midnight: { accent: "#6579d9", background: "#10172a", ink: "#f4f5fb", soft: "#222d4c" },
  garden: { accent: "#35745a", background: "#f4fbf5", ink: "#1c3328", soft: "#dcefe1" },
  ocean: { accent: "#246d91", background: "#f1f9fc", ink: "#18313d", soft: "#d9edf5" },
  classic: { accent: "#4b5563", background: "#f8fafc", ink: "#202833", soft: "#e8edf2" },
};

const clean = (value?: string) => String(value ?? "").trim();
const nonEmptyLines = (value?: string) => String(value ?? "").split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
const slugify = (value: string) => value.toLowerCase().replace(/&/g, "and").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

export function parseCelebrationToolId(toolId: string): { occasion: CelebrationOccasion; experience: CelebrationExperience } {
  const normalized = toolId.trim().toLowerCase();
  for (const occasion of OCCASIONS) {
    const prefix = slugify(occasion) + "-";
    if (!normalized.startsWith(prefix)) continue;
    const suffix = normalized.slice(prefix.length) as CelebrationExperience;
    if (EXPERIENCES.includes(suffix) && !NOT_CATALOGUED_TOOL_IDS.has(normalized)) {
      return { occasion, experience: suffix };
    }
  }
  throw new Error("This celebration tool is not supported.");
}

export function celebrationOccasionLabel(occasion: CelebrationOccasion): string {
  return OCCASION_LABELS[occasion];
}

export function getCelebrationEventInstant(value: string, timeZone: string): Date {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value.trim());
  if (!match) throw new Error("Enter a real date and time.");
  const [year, month, day, hour, minute] = match.slice(1).map(Number);
  const wall = Date.UTC(year, month - 1, day, hour, minute);
  const check = new Date(wall);
  if (check.getUTCFullYear() !== year || check.getUTCMonth() + 1 !== month || check.getUTCDate() !== day ||
      check.getUTCHours() !== hour || check.getUTCMinutes() !== minute) throw new Error("Enter a real date and time.");
  if (!timeZone.trim()) throw new Error("Choose a time zone.");
  let formatter: Intl.DateTimeFormat;
  try {
    formatter = new Intl.DateTimeFormat("en-GB", {
      timeZone, year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", hourCycle: "h23",
    });
  } catch {
    throw new Error("Choose a valid IANA time zone, such as Africa/Lagos or Europe/London.");
  }
  const offsets = new Set<number>();
  try {
    for (let hours = -48; hours <= 48; hours += 3) {
      const instant = wall + hours * 3600000;
      const parts = Object.fromEntries(formatter.formatToParts(new Date(instant))
        .filter((part) => part.type !== "literal").map((part) => [part.type, Number(part.value)]));
      const localAsUtc = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute);
      offsets.add(Math.round((localAsUtc - instant) / 60000));
    }
  } catch {
    throw new Error("Choose a valid IANA time zone, such as Africa/Lagos or Europe/London.");
  }
  const matches = [...offsets].map((offset) => wall - offset * 60000).filter((candidate) => {
    const parts = Object.fromEntries(formatter.formatToParts(new Date(candidate))
      .filter((part) => part.type !== "literal").map((part) => [part.type, Number(part.value)]));
    return parts.year === year && parts.month === month && parts.day === day && parts.hour === hour && parts.minute === minute;
  });
  if (matches.length === 0) throw new Error("That local time does not exist because the clocks change in this time zone. Choose another time.");
  if (matches.length > 1) throw new Error("That local time occurs twice because the clocks change in this time zone. Choose another time.");
  return new Date(matches[0]);
}

export function celebrationCountdown(input: CelebrationInput, now = Date.now()) {
  try {
    const target = getCelebrationEventInstant(clean(input.date), clean(input.timezone)).getTime();
    const remaining = target - now;
    if (remaining <= 0) return { complete: true, days: 0, hours: 0, minutes: 0, seconds: 0 };
    const seconds = Math.floor(remaining / 1000);
    return {
      complete: false,
      days: Math.floor(seconds / 86400),
      hours: Math.floor((seconds % 86400) / 3600),
      minutes: Math.floor((seconds % 3600) / 60),
      seconds: seconds % 60,
    };
  } catch {
    return null;
  }
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;",
  }[character] ?? character));
}
function safeHttpUrl(value: string): string {
  try {
    const parsed = new URL(value);
    const allowedProtocol = parsed.protocol === "https:" || parsed.protocol === "http:";
    return allowedProtocol && !parsed.username && !parsed.password ? parsed.toString() : "";
  } catch { return ""; }
}
function dateLabel(input: CelebrationInput): string {
  if (!clean(input.date)) return "";
  try {
    return new Intl.DateTimeFormat(undefined, {
      dateStyle: "full", timeStyle: "short", timeZone: clean(input.timezone) || undefined,
    }).format(getCelebrationEventInstant(clean(input.date), clean(input.timezone)));
  } catch { return clean(input.date); }
}
function photoMarkup(photos: string[]): string {
  return photos.filter((photo) => /^data:image\/(?:png|jpeg|webp|avif);base64,[A-Za-z0-9+/]+={0,2}$/i.test(photo) && photo.length <= 3500000)
    .slice(0, 8).map((photo, index) =>
      '<figure><img src="' + photo + '" alt="Celebration memory ' + (index + 1) + '" loading="lazy"><figcaption>Memory ' + (index + 1) + '</figcaption></figure>',
    ).join("");
}

export function buildCelebrationText(input: CelebrationInput): string {
  const occasion = OCCASION_LABELS[input.occasion];
  const title = clean(input.title) || occasion + " celebration";
  const date = dateLabel(input);
  const sections = [
    title,
    occasion + " · " + input.experience.replace(/-/g, " "),
    clean(input.honoree) ? "For: " + clean(input.honoree) : "",
    clean(input.host) ? "Hosted by: " + clean(input.host) : "",
    date ? "When: " + date + (clean(input.timezone) ? " (" + clean(input.timezone) + ")" : "") : "",
    clean(input.location) ? "Where: " + clean(input.location) : "",
    "",
    clean(input.message) || OCCASION_COPY[input.occasion],
    clean(input.details),
    clean(input.schedule) ? "\nSchedule\n" + nonEmptyLines(input.schedule).map((item, index) => (index + 1) + ". " + item).join("\n") : "",
    clean(input.memories) ? "\nMemories\n" + clean(input.memories) : "",
    clean(input.dressCode) ? "Dress code: " + clean(input.dressCode) : "",
    clean(input.rsvpBy) ? "Please reply by: " + clean(input.rsvpBy) : "",
    clean(input.contactMethod) ? "RSVP contact: " + clean(input.contactMethod) : "",
    clean(input.rsvpUrl) ? "RSVP / details: " + clean(input.rsvpUrl) : "",
    clean(input.revealMessage) ? "\nThe reveal\n" + clean(input.revealMessage) : "",
    clean(input.quizQuestion) ? "\nQuiz\n" + clean(input.quizQuestion) + "\n" + nonEmptyLines(input.quizOptions).map((item) => "• " + item).join("\n") : "",
    input.photos?.length ? "Photos included: " + input.photos.length : "",
    "",
    "Created locally with enV. This file does not send invitations or collect guest responses.",
  ];
  return sections.filter((section, index) => section !== "" || index === 0).join("\n");
}

export function celebrationQualityChecks(input: CelebrationInput): string[] {
  const checks: string[] = [];
  if (!clean(input.title)) checks.push("Add a title that guests or the recipient will recognise.");
  if (!clean(input.honoree) && input.experience !== "countdown") checks.push("Add the person or group being celebrated.");
  if (clean(input.date)) {
    try { getCelebrationEventInstant(clean(input.date), clean(input.timezone)); }
    catch (error) { checks.push(error instanceof Error ? error.message : "Check the date and time."); }
  } else if (["invitation-generator", "countdown"].includes(input.experience)) {
    checks.push("Add the date and time.");
  }
  if (clean(input.date) && !clean(input.timezone)) checks.push("Add the IANA time zone so the displayed local time is clear.");
  if (clean(input.rsvpUrl) && !safeHttpUrl(clean(input.rsvpUrl))) checks.push("Use a complete http or https RSVP link.");
  if (input.experience === "invitation-generator" && !clean(input.rsvpUrl) && !clean(input.contactMethod)) checks.push("Add an RSVP link or a contact method guests can use to reply.");
  if (input.experience === "invitation-generator" && !clean(input.rsvpBy)) checks.push("Add an RSVP deadline, or state that replies are open.");
  if (input.experience === "countdown" && !clean(input.date)) checks.push("Choose the event date and time to calculate the countdown.");
  if (input.experience === "quiz-generator") {
    const options = nonEmptyLines(input.quizOptions);
    if (!clean(input.quizQuestion)) checks.push("Add the question.");
    if (options.length < 2 || options.length > 6) checks.push("Add between 2 and 6 answer choices.");
    if (!clean(input.quizAnswer)) checks.push("Choose the correct answer so the quiz can grade responses.");
    if (clean(input.quizAnswer) && !options.some((option) => option.toLowerCase() === clean(input.quizAnswer).toLowerCase())) {
      checks.push("The correct answer must match one of the answer choices.");
    }
  }
  if (input.experience === "memory-page" && !clean(input.memories) && !(input.photos?.length)) {
    checks.push("Add a memory note or at least one photo.");
  }
  if (input.experience === "reveal-page" && !clean(input.revealMessage)) checks.push("Add the message that will be revealed.");
  if (input.experience === "surprise-page" && !clean(input.revealMessage)) checks.push("Add the surprise guests will discover.");
  return [...new Set(checks)];
}

export function buildCelebrationHtml(input: CelebrationInput): string {
  const occasion = OCCASION_LABELS[input.occasion];
  const theme = THEMES[clean(input.theme)] ?? THEMES.classic;
  const title = clean(input.title) || occasion + " celebration";
  const honoree = clean(input.honoree);
  const host = clean(input.host);
  const message = clean(input.message) || OCCASION_COPY[input.occasion];
  const details = clean(input.details);
  const date = dateLabel(input);
  const location = clean(input.location);
  const rsvp = safeHttpUrl(clean(input.rsvpUrl));
  const rsvpBy = clean(input.rsvpBy);
  const dressCode = clean(input.dressCode);
  const eventInstant = clean(input.date) ? (() => { try { return getCelebrationEventInstant(clean(input.date), clean(input.timezone)).toISOString(); } catch { return ""; } })() : "";
  const photos = photoMarkup(input.photos ?? []);
  const options = nonEmptyLines(input.quizOptions).slice(0, 6);
  const experience = input.experience;
  let content = "";
  if (experience === "interactive-card") {
    content = '<section class="card"><p class="eyebrow">' + occasion + '</p><h1>' + escapeHtml(title) + '</h1><p>' + escapeHtml(message) + '</p><button type="button" data-reveal>Open your card</button><div class="hidden reveal" data-reveal-content><p>' + escapeHtml(clean(input.revealMessage) || ("A special message for " + (honoree || "you") + ".")) + '</p></div></section>';
  } else if (experience === "invitation-generator") {
    content = '<p class="eyebrow">You are invited</p><h1>' + escapeHtml(title) + '</h1><p class="lead">' + escapeHtml(message) + '</p><dl>' +
      (date ? '<div><dt>When</dt><dd>' + escapeHtml(date) + '</dd></div>' : "") +
      (location ? '<div><dt>Where</dt><dd>' + escapeHtml(location) + '</dd></div>' : "") +
      (host ? '<div><dt>Hosted by</dt><dd>' + escapeHtml(host) + '</dd></div>' : "") +
      (honoree ? '<div><dt>Celebrating</dt><dd>' + escapeHtml(honoree) + '</dd></div>' : "") +
      (clean(input.contactMethod) ? '<div><dt>RSVP contact</dt><dd>' + escapeHtml(clean(input.contactMethod)) + '</dd></div>' : "") +
      (dressCode ? '<div><dt>Dress code</dt><dd>' + escapeHtml(dressCode) + '</dd></div>' : "") +
      (rsvpBy ? '<div><dt>Reply by</dt><dd>' + escapeHtml(rsvpBy) + '</dd></div>' : "") +
      '</dl>' + (rsvp ? '<a class="action" href="' + escapeHtml(rsvp) + '" rel="noopener noreferrer">Reply to invitation</a>' : '<p class="note">Contact the host to reply.</p>');
  } else if (experience === "countdown") {
    content = '<p class="eyebrow">' + occasion + '</p><h1>' + escapeHtml(title) + '</h1><p class="lead">' + escapeHtml(message) + '</p><div class="countdown" data-countdown data-target="' + escapeHtml(eventInstant) + '"><div><strong data-days>—</strong><span>Days</span></div><div><strong data-hours>—</strong><span>Hours</span></div><div><strong data-minutes>—</strong><span>Minutes</span></div><div><strong data-seconds>—</strong><span>Seconds</span></div></div><p class="note">' + escapeHtml(date) + '</p>';
  } else if (experience === "memory-page") {
    content = '<p class="eyebrow">A collection of memories</p><h1>' + escapeHtml(title) + '</h1><p class="lead">' + escapeHtml(message) + '</p><p>' + escapeHtml(clean(input.memories)) + '</p><div class="gallery">' + photos + '</div>';
  } else if (experience === "reveal-page" || experience === "surprise-page") {
    content = '<p class="eyebrow">' + (experience === "reveal-page" ? "A moment to reveal" : "A little surprise") + '</p><h1>' + escapeHtml(title) + '</h1><p class="lead">' + escapeHtml(message) + '</p><button type="button" data-reveal>' + (experience === "reveal-page" ? "Reveal the message" : "Open your surprise") + '</button><div class="hidden reveal" data-reveal-content><p>' + escapeHtml(clean(input.revealMessage) || details) + '</p></div>';
  } else if (experience === "quiz-generator") {
    content = '<p class="eyebrow">A celebration quiz</p><h1>' + escapeHtml(title) + '</h1><p class="lead">' + escapeHtml(message) + '</p><p class="question">' + escapeHtml(clean(input.quizQuestion)) + '</p><div class="choices" data-quiz>' +
      options.map((option) => '<button type="button" data-choice data-correct="' + (option.toLowerCase() === clean(input.quizAnswer).toLowerCase() ? "true" : "false") + '">' + escapeHtml(option) + '</button>').join("") +
      '</div><p class="note" data-feedback aria-live="polite">Choose an answer.</p>';
  } else {
    content = '<p class="eyebrow">' + occasion + '</p><h1>' + escapeHtml(title) + '</h1><p class="lead">' + escapeHtml(message) + '</p>' +
      (host ? '<p>Hosted by: ' + escapeHtml(host) + '</p>' : "") +
      (honoree ? '<p>For <strong>' + escapeHtml(honoree) + '</strong></p>' : "") +
      (date ? '<p><strong>When:</strong> ' + escapeHtml(date) + '</p>' : "") +
      (location ? '<p><strong>Where:</strong> ' + escapeHtml(location) + '</p>' : "") +
      (details ? '<p>' + escapeHtml(details) + '</p>' : "") +
      (nonEmptyLines(input.schedule).length ? '<section class="schedule"><h2>Schedule</h2><ol>' + nonEmptyLines(input.schedule).map((item) => '<li>' + escapeHtml(item) + '</li>').join("") + '</ol></section>' : "") +
      (rsvp ? '<a class="action" href="' + escapeHtml(rsvp) + '" rel="noopener noreferrer">More details</a>' : "");
  }
  const script = '<script>(function(){' +
    'document.querySelectorAll("[data-reveal]").forEach(function(button){button.addEventListener("click",function(){var panel=button.parentElement.querySelector("[data-reveal-content]");if(panel){panel.classList.toggle("hidden");button.setAttribute("aria-expanded",String(!panel.classList.contains("hidden")));}});});' +
    'var quiz=document.querySelector("[data-quiz]");if(quiz){quiz.addEventListener("click",function(event){var button=event.target.closest("[data-choice]");if(!button)return;var feedback=document.querySelector("[data-feedback]");feedback.textContent=button.dataset.correct==="true"?"That is right!":"Not quite. Try another answer.";});}' +
    'var timer=document.querySelector("[data-countdown]");if(timer){var target=Date.parse(timer.dataset.target);function update(){if(!Number.isFinite(target)){return;}var left=Math.max(0,target-Date.now());var seconds=Math.floor(left/1000);timer.querySelector("[data-days]").textContent=String(Math.floor(seconds/86400));timer.querySelector("[data-hours]").textContent=String(Math.floor((seconds%86400)/3600)).padStart(2,"0");timer.querySelector("[data-minutes]").textContent=String(Math.floor((seconds%3600)/60)).padStart(2,"0");timer.querySelector("[data-seconds]").textContent=String(seconds%60).padStart(2,"0");}update();setInterval(update,1000);}' +
    '})();</script>';
  const css = '*,*::before,*::after{box-sizing:border-box}body{overflow-wrap:anywhere;margin:0;background:' + theme.background + ';color:' + theme.ink + ';font:16px/1.6 system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;padding:24px}.wrap{max-width:760px;margin:6vh auto;background:' + theme.background + ';border:1px solid ' + theme.soft + ';border-radius:24px;padding:clamp(22px,6vw,56px);box-shadow:0 18px 55px rgba(20,30,45,.10)}.eyebrow{font-size:.8rem;letter-spacing:.12em;text-transform:uppercase;color:' + theme.accent + ';font-weight:700}h1{font-size:clamp(2rem,7vw,3.7rem);line-height:1.08;margin:.4em 0;overflow-wrap:anywhere}p{white-space:pre-wrap}.lead{font-size:1.2rem}.action,button{display:inline-block;border:0;border-radius:999px;padding:12px 20px;background:' + theme.accent + ';color:#fff;text-decoration:none;font:inherit;font-weight:650;cursor:pointer}button:focus-visible,a:focus-visible{outline:3px solid ' + theme.accent + ';outline-offset:3px}dl{display:grid;gap:10px}dl div{padding:12px 14px;background:' + theme.soft + ';border-radius:12px}dt{font-size:.8rem;opacity:.72}dd{margin:0;font-weight:600}.hidden{display:none}.reveal{padding:18px;margin-top:18px;border-radius:14px;background:' + theme.soft + '}.countdown{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px;margin:28px 0}.countdown div{text-align:center;background:' + theme.soft + ';border-radius:14px;padding:14px 6px}.countdown strong{display:block;font-size:clamp(1.6rem,6vw,2.6rem);line-height:1.2}.countdown span{font-size:.75rem}.gallery{display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:12px}.gallery figure{margin:0}.gallery img{width:100%;aspect-ratio:1;object-fit:cover;border-radius:14px}.gallery figcaption{font-size:.8rem}.choices{display:grid;gap:10px}.choices button{text-align:left;border-radius:12px}.note{opacity:.72;font-size:.9rem}@media(max-width:420px){body{padding:10px}.wrap{margin:2vh auto;border-radius:16px}.countdown{gap:5px}.countdown div{padding:10px 3px}}@media(prefers-reduced-motion:no-preference){.wrap{animation:enter .35s ease-out}@keyframes enter{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}}';
  return '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light dark"><title>' +
    escapeHtml(title) + '</title><style>' + css + '</style></head><body><main class="wrap" data-experience="' + experience + '">' +
    content + '<p class="note">Made with enV · This page is a local export. Guest responses are not collected.</p></main>' + script + '</body></html>';
}

export function buildCelebration(input: CelebrationInput) {
  return { text: buildCelebrationText(input), html: buildCelebrationHtml(input), checks: celebrationQualityChecks(input) };
}
