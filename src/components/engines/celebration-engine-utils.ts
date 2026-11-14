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
  rose: { accent: "#00B48A", background: "#321724", ink: "#F3D9DE", soft: "#4A2636" },
  gold: { accent: "#D9A441", background: "#141B3A", ink: "#F9F1D8", soft: "#293256" },
  midnight: { accent: "#B8F01E", background: "#0B1026", ink: "#BCD4F2", soft: "#1C2A4A" },
  garden: { accent: "#F04A24", background: "#1F4A3A", ink: "#FEFCF5", soft: "#2C614D" },
  ocean: { accent: "#F02391", background: "#014342", ink: "#FEFCF5", soft: "#155D5A" },
  classic: { accent: "#F05A42", background: "#172334", ink: "#F8F4EA", soft: "#26374B" },
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
      '<figure><img src="' + photo + '" alt="Celebration memory ' + (index + 1) + '" loading="lazy"></figure>',
    ).join("");
}

export function buildCelebrationText(input: CelebrationInput): string {
  const occasion = OCCASION_LABELS[input.occasion];
  const title = clean(input.title) || occasion + " celebration";
  const date = dateLabel(input);
  const sections = [
    title,
    clean(input.honoree) ? "For: " + clean(input.honoree) : "",
    clean(input.host) ? "Hosted by " + clean(input.host) : "",
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
  const eventInstant = clean(input.date) ? (() => {
    try { return getCelebrationEventInstant(clean(input.date), clean(input.timezone)).toISOString(); }
    catch { return ""; }
  })() : "";
  const photos = photoMarkup(input.photos ?? []);
  const options = nonEmptyLines(input.quizOptions).slice(0, 6);
  const experience = input.experience;
  const glyphs: Record<CelebrationOccasion, string> = {
    birthday: "✳", anniversary: "∞", graduation: "✦", valentine: "♥",
    christmas: "✶", "new-year": "✺", congratulations: "✦", "thank-you": "✧",
    appreciation: "✳", farewell: "〰", achievement: "✸", party: "✺",
  };
  const glyph = glyphs[input.occasion] ?? "✦";
  let content = "";
  if (experience === "interactive-card") {
    content = '<p class="eyebrow">' + escapeHtml(occasion) + '</p><h1>' + escapeHtml(title) + '</h1><p class="lead">' + escapeHtml(message) + '</p><button type="button" data-reveal aria-expanded="false">Open your card</button><div class="hidden reveal" data-reveal-content><p>' + escapeHtml(clean(input.revealMessage) || ("A special message for " + (honoree || "you") + ".")) + '</p></div>';
  } else if (experience === "invitation-generator") {
    content = '<p class="eyebrow">You are invited</p><h1>' + escapeHtml(title) + '</h1><p class="lead">' + escapeHtml(message) + '</p><dl>' +
      (date ? '<div><dt>When</dt><dd>' + escapeHtml(date) + '</dd></div>' : "") +
      (location ? '<div><dt>Where</dt><dd>' + escapeHtml(location) + '</dd></div>' : "") +
      (host ? '<div><dt>Hosted by</dt><dd>' + escapeHtml(host) + '</dd></div>' : "") +
      (honoree ? '<div><dt>Celebrating</dt><dd>' + escapeHtml(honoree) + '</dd></div>' : "") +
      (clean(input.contactMethod) ? '<div><dt>RSVP contact</dt><dd>' + escapeHtml(clean(input.contactMethod)) + '</dd></div>' : "") +
      (dressCode ? '<div><dt>Dress code</dt><dd>' + escapeHtml(dressCode) + '</dd></div>' : "") +
      (rsvpBy ? '<div><dt>Reply by</dt><dd>' + escapeHtml(rsvpBy) + '</dd></div>' : "") +
      '</dl>' + (rsvp ? '<a class="action" href="' + escapeHtml(rsvp) + '" rel="noopener noreferrer">Reply to invitation</a>' :
        (clean(input.contactMethod) ? '<p class="note">Reply to ' + escapeHtml(clean(input.contactMethod)) + '</p>' : ""));
  } else if (experience === "countdown") {
    content = '<p class="eyebrow">' + escapeHtml(occasion) + '</p><h1>' + escapeHtml(title) + '</h1><p class="lead">' + escapeHtml(message) + '</p><div class="countdown" data-countdown data-target="' + escapeHtml(eventInstant) + '"><div><strong data-days>—</strong><span>Days</span></div><div><strong data-hours>—</strong><span>Hours</span></div><div><strong data-minutes>—</strong><span>Minutes</span></div><div><strong data-seconds>—</strong><span>Seconds</span></div></div>' +
      (date ? '<p class="event-date">' + escapeHtml(date) + '</p>' : "");
  } else if (experience === "memory-page") {
    content = '<p class="eyebrow">A collection of memories</p><h1>' + escapeHtml(title) + '</h1><p class="lead">' + escapeHtml(message) + '</p>' +
      (clean(input.memories) ? '<p class="memory-copy">' + escapeHtml(clean(input.memories)) + '</p>' : "") +
      (photos ? '<div class="gallery">' + photos + '</div>' : "");
  } else if (experience === "reveal-page" || experience === "surprise-page") {
    content = '<p class="eyebrow">' + escapeHtml(occasion) + '</p><h1>' + escapeHtml(title) + '</h1><p class="lead">' + escapeHtml(message) + '</p><button type="button" data-reveal aria-expanded="false">' +
      (experience === "reveal-page" ? "Reveal the message" : "Open your surprise") +
      '</button><div class="hidden reveal" data-reveal-content><p>' + escapeHtml(clean(input.revealMessage) || details) + '</p></div>';
  } else if (experience === "quiz-generator") {
    content = '<p class="eyebrow">' + escapeHtml(occasion) + '</p><h1>' + escapeHtml(title) + '</h1><p class="lead">' + escapeHtml(message) + '</p><p class="question">' + escapeHtml(clean(input.quizQuestion)) + '</p><div class="choices" data-quiz>' +
      options.map((option) => '<button type="button" data-choice data-correct="' + (option.toLowerCase() === clean(input.quizAnswer).toLowerCase() ? "true" : "false") + '">' + escapeHtml(option) + '</button>').join("") +
      '</div><p class="note" data-feedback aria-live="polite"></p>';
  } else {
    content = '<p class="eyebrow">' + escapeHtml(occasion) + '</p><h1>' + escapeHtml(title) + '</h1><p class="lead">' + escapeHtml(message) + '</p>' +
      (honoree ? '<p class="recipient">For <strong>' + escapeHtml(honoree) + '</strong></p>' : "") +
      (host ? '<p class="host">Hosted by ' + escapeHtml(host) + '</p>' : "") +
      (date ? '<p class="event-date">' + escapeHtml(date) + '</p>' : "") +
      (location ? '<p class="event-location">' + escapeHtml(location) + '</p>' : "") +
      (details ? '<p class="extra-details">' + escapeHtml(details) + '</p>' : "") +
      (nonEmptyLines(input.schedule).length ? '<section class="schedule"><h2>Schedule</h2><ol>' + nonEmptyLines(input.schedule).map((item) => '<li>' + escapeHtml(item) + '</li>').join("") + '</ol></section>' : "") +
      (rsvp ? '<a class="action" href="' + escapeHtml(rsvp) + '" rel="noopener noreferrer">More details</a>' : "");
  }
  const script = '<script>(function(){' +
    'document.querySelectorAll("[data-reveal]").forEach(function(button){button.addEventListener("click",function(){var panel=button.parentElement.querySelector("[data-reveal-content]");if(panel){panel.classList.toggle("hidden");button.setAttribute("aria-expanded",String(!panel.classList.contains("hidden")));}});});' +
    'var quiz=document.querySelector("[data-quiz]");if(quiz){quiz.addEventListener("click",function(event){var button=event.target.closest("[data-choice]");if(!button)return;var feedback=document.querySelector("[data-feedback]");feedback.textContent=button.dataset.correct==="true"?"Correct.":"Try again.";});}' +
    'var timer=document.querySelector("[data-countdown]");if(timer){var target=Date.parse(timer.dataset.target);function update(){if(!Number.isFinite(target))return;var left=Math.max(0,target-Date.now());var seconds=Math.floor(left/1000);timer.querySelector("[data-days]").textContent=String(Math.floor(seconds/86400));timer.querySelector("[data-hours]").textContent=String(Math.floor((seconds%86400)/3600)).padStart(2,"0");timer.querySelector("[data-minutes]").textContent=String(Math.floor((seconds%3600)/60)).padStart(2,"0");timer.querySelector("[data-seconds]").textContent=String(seconds%60).padStart(2,"0");}update();setInterval(update,1000);}' +
    '})();</script>';
  const css = '*,*::before,*::after{box-sizing:border-box}html{min-height:100%;background:' + theme.background + '}body{position:relative;isolation:isolate;overflow-wrap:anywhere;min-height:100vh;margin:0;padding:clamp(14px,4vw,42px);background:radial-gradient(ellipse at 14% 10%,' + theme.accent + '26,transparent 42%),' + theme.background + ';color:' + theme.ink + ';font:16px/1.6 Georgia,"Times New Roman",serif}body:before{position:fixed;z-index:-1;inset:0;content:"";pointer-events:none;opacity:.16;background-image:repeating-linear-gradient(0deg,transparent 0 3px,rgba(255,255,255,.08) 3px 4px),repeating-linear-gradient(90deg,transparent 0 5px,rgba(0,0,0,.04) 5px 6px);mix-blend-mode:soft-light}.poster{position:relative;display:grid;grid-template-columns:minmax(230px,.92fr) minmax(0,1.08fr);align-items:center;gap:clamp(22px,5vw,64px);max-width:1040px;min-height:min(760px,calc(100vh - 56px));margin:auto;padding:clamp(24px,5vw,64px);overflow:hidden;border:1px solid ' + theme.accent + '55;border-radius:clamp(18px,3vw,34px);background:linear-gradient(138deg,' + theme.background + ',' + theme.background + 'f2);box-shadow:0 28px 90px rgba(0,0,0,.2),inset 0 1px rgba(255,255,255,.12)}.poster-art{position:relative;display:grid;min-width:0;min-height:440px;place-items:center;overflow:visible;isolation:isolate}.poster-art:before{position:absolute;inset:7% -18% 5% -18%;content:"";border:1px solid ' + theme.accent + '66;border-radius:48% 52% 60% 40%;transform:rotate(-24deg);box-shadow:0 0 0 18px ' + theme.accent + '0d,0 0 0 38px ' + theme.accent + '0a}.art-orbit{position:absolute;width:92%;aspect-ratio:1;border-radius:50%;background:radial-gradient(circle at 32% 24%,rgba(255,255,255,.6),transparent 19%),radial-gradient(circle at 50% 50%,' + theme.accent + ',' + theme.accent + 'bb 62%,transparent 64%);filter:drop-shadow(0 25px 45px rgba(0,0,0,.28));transform:rotate(-17deg)}.art-ribbon{position:absolute;left:-22%;right:-25%;top:39%;height:24%;border-radius:50%;background:linear-gradient(180deg,rgba(255,255,255,.8),' + theme.accent + ' 22%,' + theme.accent + ' 58%,' + theme.accent + 'aa);box-shadow:0 18px 36px rgba(0,0,0,.25),inset 0 2px 8px rgba(255,255,255,.5);transform:rotate(-32deg);opacity:.95}.art-mark{position:relative;z-index:1;color:' + theme.ink + ';font-family:Georgia,"Times New Roman",serif;font-size:clamp(9rem,22vw,17rem);line-height:1;font-weight:400;text-shadow:0 5px 0 ' + theme.accent + '45,0 24px 34px rgba(0,0,0,.25);transform:rotate(-9deg)}.poster-copy{position:relative;z-index:2;min-width:0}.eyebrow{margin:0 0 18px;color:' + theme.accent + ';font:700 .72rem/1.2 system-ui,sans-serif;letter-spacing:.22em;text-transform:uppercase}.poster h1{max-width:14ch;margin:0 0 20px;color:' + theme.ink + ';font:500 clamp(2.7rem,6.2vw,5.8rem)/.98 Georgia,"Times New Roman",serif;letter-spacing:-.055em;text-wrap:balance;overflow-wrap:anywhere}.lead{max-width:38rem;margin:0 0 26px;color:' + theme.ink + ';font:400 clamp(1rem,1.55vw,1.3rem)/1.65 system-ui,-apple-system,"Segoe UI",sans-serif;opacity:.86}.poster p{overflow-wrap:anywhere}.recipient,.host,.event-date,.event-location,.extra-details{margin:10px 0;font:500 .95rem/1.55 system-ui,sans-serif}.poster button,.poster .action{display:inline-flex;min-height:48px;align-items:center;justify-content:center;gap:8px;margin-top:22px;border:0;border-radius:999px;padding:12px 22px;background:' + theme.accent + ';color:#fff;text-decoration:none;font:700 .9rem/1 system-ui,sans-serif;box-shadow:0 10px 24px ' + theme.accent + '40;cursor:pointer;transition:transform .18s ease,box-shadow .18s ease}.poster button:hover,.poster .action:hover{transform:translateY(-2px);box-shadow:0 14px 28px ' + theme.accent + '55}.poster button:focus-visible,.poster a:focus-visible{outline:3px solid ' + theme.accent + ';outline-offset:4px}.poster dl{display:grid;gap:9px;margin:24px 0}.poster dl div{display:grid;grid-template-columns:92px minmax(0,1fr);gap:12px;padding:11px 0;border-bottom:1px solid ' + theme.ink + '28}.poster dt{color:' + theme.accent + ';font:700 .68rem/1.5 system-ui,sans-serif;letter-spacing:.13em;text-transform:uppercase}.poster dd{margin:0;color:' + theme.ink + ';font:500 .94rem/1.5 system-ui,sans-serif}.reveal{margin-top:18px;padding:20px 22px;border:1px solid ' + theme.accent + '55;border-radius:16px;background:' + theme.accent + '18;font:400 1.05rem/1.7 Georgia,serif}.hidden{display:none}.countdown{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:9px;margin:30px 0}.countdown div{padding:16px 6px;border:1px solid ' + theme.accent + '55;border-radius:14px;background:' + theme.accent + '18;text-align:center}.countdown strong{display:block;color:' + theme.accent + ';font:600 clamp(1.8rem,4vw,3rem)/1.1 system-ui,sans-serif;font-variant-numeric:tabular-nums}.countdown span{font:700 .64rem/1.3 system-ui,sans-serif;letter-spacing:.1em;text-transform:uppercase}.memory-copy{margin:22px 0;font:400 1.05rem/1.8 Georgia,serif;white-space:pre-wrap}.gallery{display:grid;grid-template-columns:repeat(auto-fit,minmax(120px,1fr));gap:12px;margin-top:24px}.gallery figure{margin:0}.gallery img{display:block;width:100%;aspect-ratio:1;object-fit:cover;border-radius:14px;border:1px solid rgba(255,255,255,.3)}.choices{display:grid;gap:10px;margin-top:22px}.choices button{width:100%;justify-content:flex-start;margin:0;border:1px solid ' + theme.accent + '55;background:' + theme.accent + '18;color:' + theme.ink + ';box-shadow:none;text-align:left}.note{min-height:1.4em;margin:14px 0 0;color:' + theme.accent + ';font:700 .82rem/1.4 system-ui,sans-serif}.schedule{margin-top:28px}.schedule h2{margin:0 0 12px;font:700 .72rem/1.3 system-ui,sans-serif;letter-spacing:.16em;text-transform:uppercase;color:' + theme.accent + '}.schedule ol{margin:0;padding:0;list-style:none;counter-reset:program}.schedule li{counter-increment:program;display:grid;grid-template-columns:36px minmax(0,1fr);gap:10px;padding:10px 0;border-bottom:1px solid ' + theme.ink + '28;font:500 .95rem/1.5 system-ui,sans-serif}.schedule li:before{content:counter(program,decimal-leading-zero);color:' + theme.accent + ';font:700 .7rem/1.8 system-ui,sans-serif;letter-spacing:.08em}.brand{grid-column:1/-1;display:flex;justify-content:flex-end;margin-top:24px;color:' + theme.ink + ';font:800 .72rem/1 system-ui,sans-serif;letter-spacing:.26em;text-transform:uppercase;opacity:.7}.brand:before{content:"";width:28px;height:1px;margin:auto 12px auto 0;background:' + theme.accent + '}@media(max-width:720px){body{padding:10px}.poster{display:flex;min-height:auto;flex-direction:column;align-items:stretch;gap:12px;padding:clamp(20px,6vw,34px);border-radius:20px}.poster-art{width:100%;min-height:clamp(170px,42vw,260px);height:clamp(170px,42vw,260px);flex:none;margin:-10px 0 2px}.art-orbit{width:68%}.art-mark{font-size:clamp(7rem,30vw,12rem)}.art-ribbon{top:42%;height:24%}.poster-copy{width:100%}.poster h1{font-size:clamp(2.6rem,12vw,4.6rem)}.brand{margin-top:30px}}@media(max-width:390px){.countdown{gap:5px}.countdown div{padding:12px 3px}.poster dl div{grid-template-columns:76px minmax(0,1fr)}}@media(prefers-reduced-motion:reduce){.poster button,.poster .action{transition:none}.poster button:hover,.poster .action:hover{transform:none}}';
  return '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><meta name="color-scheme" content="light dark"><title>' +
    escapeHtml(title) + '</title><style>' + css + '</style></head><body><main class="poster" data-experience="' + experience + '">' +
    '<div class="poster-art" aria-hidden="true"><span class="art-orbit"></span><span class="art-ribbon"></span><span class="art-mark">' + glyph + '</span></div>' +
    '<section class="poster-copy">' + content + '</section><footer class="brand">enV</footer></main>' + script + '</body></html>';
}export function buildCelebration(input: CelebrationInput) {
  return { text: buildCelebrationText(input), html: buildCelebrationHtml(input), checks: celebrationQualityChecks(input) };
}
