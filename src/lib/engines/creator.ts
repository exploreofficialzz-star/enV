export type CreatorField = {
  name: string;
  label: string;
  type?: "number" | "text" | "select" | "textarea" | "date";
  suffix?: string;
  options?: { value: string; label: string }[];
  defaultValue?: string | number;
  min?: number;
  max?: number;
  step?: number;
  hint?: string;
  placeholder?: string;
};

export const CREATOR_PLATFORMS: Record<string, { label: string; style: string; formats: string[]; pillars: string[]; size: string; audienceLabel: string }> = {
  youtube: {
    label: "YouTube", style: "searchable, specific, curiosity-led and useful beyond the first click",
    formats: ["tutorial", "case study", "comparison", "behind the scenes", "myth vs fact", "Shorts cut-down", "Q&A"],
    pillars: ["teach", "prove", "story", "community", "offer"],
    size: "Video thumbnail: 3840 × 2160 (16:9 recommended); Shorts thumbnail: 2160 × 3840 (9:16). Keep the focal point and text readable at phone size. YouTube currently recommends these large resolutions; upload limits vary by device.",
    audienceLabel: "subscribers / viewers",
  },
  tiktok: {
    label: "TikTok", style: "immediate, native-sounding, visually demonstrable and built around a strong opening beat",
    formats: ["quick demonstration", "storytime", "reply to a question", "before and after", "trend with original angle", "series episode", "live clip"],
    pillars: ["hook", "proof", "personality", "community", "conversion"],
    size: "Vertical video: 1080 × 1920 (9:16) is a practical working canvas. Profile and thumbnail placements can vary by surface; preview the crop in TikTok before publishing.",
    audienceLabel: "followers / viewers",
  },
  instagram: {
    label: "Instagram", style: "visual-first, saveable, shareable and recognisably on-brand",
    formats: ["Reel", "carousel", "single image", "Story sequence", "collaboration post", "FAQ", "before and after"],
    pillars: ["educate", "inspire", "relate", "social proof", "offer"],
    size: "Feed square: 1080 × 1080; portrait: 1080 × 1350; Story/Reel canvas: 1080 × 1920. Preview profile-grid and full-screen crops separately.",
    audienceLabel: "followers / reached accounts",
  },
  facebook: {
    label: "Facebook", style: "community-oriented, clear, conversational and easy to respond to or share",
    formats: ["native video", "Reel", "photo story", "community question", "event update", "link post", "Live replay"],
    pillars: ["community", "education", "story", "updates", "offer"],
    size: "Feed images: use a 1:1 or 4:5 crop for mobile-first posts; link previews are commonly 1200 × 630. Check the exact placement preview before publishing.",
    audienceLabel: "followers / reach",
  },
  x: {
    label: "X", style: "concise, timely, opinionated when appropriate and designed to invite a substantive reply",
    formats: ["single post", "thread", "quote with insight", "poll", "visual explainer", "launch update", "community prompt"],
    pillars: ["insight", "conversation", "build in public", "proof", "announcement"],
    size: "Landscape post image: 1600 × 900 is a practical 16:9 canvas; square 1080 × 1080 also works. Check current crop behaviour in the composer.",
    audienceLabel: "followers / impressions",
  },
  linkedin: {
    label: "LinkedIn", style: "professional, evidence-aware, experience-led and useful to a defined work audience",
    formats: ["document carousel", "practitioner lesson", "case study", "text insight", "poll", "short video", "project breakdown"],
    pillars: ["expertise", "experience", "evidence", "community", "business outcome"],
    size: "A 1200 × 627 landscape canvas is a useful link/post baseline; 1080 × 1080 square offers more mobile space. Recheck current placement crops before export.",
    audienceLabel: "followers / impressions",
  },
  twitch: {
    label: "Twitch", style: "live, community-led, schedule-aware and centred on interaction rather than passive views",
    formats: ["stream announcement", "clip highlight", "community challenge", "behind the scenes", "schedule update", "VOD chapter", "collab stream"],
    pillars: ["live show", "community", "highlights", "personality", "support"],
    size: "Video thumbnail: 1280 × 720 (16:9) is a useful canvas. Profile/banner placements have separate dimensions; verify them in the Twitch upload surface.",
    audienceLabel: "followers / average viewers",
  },
  spotify: {
    label: "Spotify", style: "artist-first, release-led and focused on converting listeners into intentional repeat fans",
    formats: ["single announcement", "release story", "lyric/story clip", "behind the track", "playlist pitch context", "tour update", "fan milestone"],
    pillars: ["release", "story", "fan relationship", "live", "catalog discovery"],
    size: "Album/single artwork: use a square high-resolution master (3000 × 3000 is a common delivery target). Follow your distributor's current file, text and rights rules.",
    audienceLabel: "listeners / followers",
  },
  "apple-music": {
    label: "Apple Music", style: "artist-first, release-led, visually consistent and aligned with a clear catalogue story",
    formats: ["release announcement", "artist story", "song meaning", "milestone", "radio/Shazam moment", "tour update", "catalog spotlight"],
    pillars: ["release", "story", "fan relationship", "live", "catalog discovery"],
    size: "Apple Music release artwork must be square. Apple recommends 3000 × 3000 pixels or larger and states a 1400 × 1400 minimum; use original, correctly licensed art and follow its artwork rules.",
    audienceLabel: "listeners / followers",
  },
  podcast: {
    label: "Podcast", style: "listener-first, clear about the episode promise and respectful of the show's recurring format",
    formats: ["full episode", "short clip", "guest quote", "listener question", "episode takeaway", "behind the episode", "season trailer"],
    pillars: ["episode value", "host voice", "guest expertise", "community", "show promise"],
    size: "Square show artwork: prepare a 3000 × 3000 pixel master where supported; Apple Podcasts RSS artwork accepts 1400–3000 pixels and prefers the largest. Episode art has separate guidance; keep it rights-cleared and legible.",
    audienceLabel: "listeners / downloads",
  },
};

const tones = [
  { value: "natural", label: "Natural" }, { value: "professional", label: "Professional" },
  { value: "playful", label: "Playful" }, { value: "bold", label: "Bold" },
  { value: "warm", label: "Warm" }, { value: "expert", label: "Expert / analytical" },
];
const goals = [
  { value: "grow", label: "Grow relevant audience" }, { value: "engage", label: "Start meaningful conversation" },
  { value: "educate", label: "Teach something useful" }, { value: "convert", label: "Drive a clear action" },
  { value: "release", label: "Promote a release / episode" }, { value: "community", label: "Strengthen community" },
];

export function creatorPlatformFromOp(op: string) {
  const key = Object.keys(CREATOR_PLATFORMS).find((platform) => op.startsWith(`${platform}-`));
  return key ?? "youtube";
}

export function creatorKindFromOp(op: string) {
  const key = Object.keys(CREATOR_PLATFORMS).find((platform) => op.startsWith(`${platform}-`));
  return key ? op.slice(key.length + 1) : op;
}

function field(name: string, label: string, type: CreatorField["type"] = "text", extra: Partial<CreatorField> = {}): CreatorField {
  return { name, label, type, ...extra };
}

function localDate(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function creatorFieldsFor(op: string): CreatorField[] {
  const platformKey = creatorPlatformFromOp(op);
  const platform = CREATOR_PLATFORMS[platformKey]!;
  const kind = creatorKindFromOp(op);
  const creatorKinds = ["caption-generator", "title-generator", "description-generator", "hashtag-generator", "bio-generator"];

  if (kind === "revenue-calculator" && (platformKey === "spotify" || platformKey === "apple-music")) return [
    field("historyStreams", platformKey === "apple-music" ? "Plays / royalty units in a past statement period" : "Streams in a past statement period", "number", { defaultValue: 10000, min: 1, hint: "Use the count from a real distributor / royalty statement for the same reporting period as the payout." }),
    field("historyPayout", "Your actual payout for that period", "number", { defaultValue: "", min: 0, step: 0.01, hint: "Enter the amount paid or accrued to you, in your chosen currency." }),
    field("forecastStreams", platformKey === "apple-music" ? "Forecast plays / royalty units" : "Forecast streams", "number", { defaultValue: 50000, min: 0 }),
    field("rightsShare", "Your share of the forecast payout", "number", { defaultValue: 100, min: 0, max: 100, suffix: "%" }),
    field("distributionFee", "Additional distributor / team fee", "number", { defaultValue: 0, min: 0, max: 100, suffix: "%" }),
    field("currency", "Currency label", "text", { defaultValue: "USD", hint: "Display label only; no currency conversion is performed." }),
  ];
  if (kind === "revenue-calculator") return [
    field("volume", platformKey === "youtube" ? "Monetized views" : "Eligible views / impressions", "number", { defaultValue: 100000, min: 0 }),
    field("rate", "Your observed RPM per 1,000", "number", { defaultValue: 2, min: 0, step: 0.01, hint: "Prefer your own recent dashboard RPM. This is an assumption, not a platform rate." }),
    field("other", "Other income in this period", "number", { defaultValue: 0, min: 0, step: 0.01 }),
    field("fee", "Management / partner share", "number", { defaultValue: 0, min: 0, max: 100, suffix: "%" }),
    field("currency", "Currency label", "text", { defaultValue: "USD", hint: "Display label only. The tool does not convert currencies." }),
  ];
  if (kind === "engagement-calculator") {
    if (platformKey === "spotify") return [
      field("listeners", "Unique listeners", "number", { defaultValue: 1000, min: 1 }),
      field("streams", "Total streams", "number", { defaultValue: 2500, min: 0 }),
      field("saves", "Saves", "number", { defaultValue: 150, min: 0 }),
      field("playlistAdds", "Playlist additions", "number", { defaultValue: 40, min: 0 }),
    ];
    if (platformKey === "apple-music") return [
      field("listeners", "Average daily listeners / unique listeners for the period", "number", { defaultValue: 1000, min: 1 }),
      field("plays", "Plays", "number", { defaultValue: 2500, min: 0 }),
      field("shazams", "Shazam count", "number", { defaultValue: 50, min: 0 }),
      field("radioSpins", "Radio spins", "number", { defaultValue: 10, min: 0 }),
      field("purchases", "Song purchases", "number", { defaultValue: 0, min: 0 }),
    ];
    if (platformKey === "podcast") return [
      field("listeners", "Unique listeners / devices", "number", { defaultValue: 1000, min: 1 }),
      field("downloads", "Episode downloads (host analytics)", "number", { defaultValue: 1500, min: 0 }),
      field("engagedListeners", "Engaged listeners (where available)", "number", { defaultValue: 0, min: 0, hint: "Use your podcast host's definition; Apple Podcasts counts listeners who hear at least 20 minutes or 40% of an episode." }),
      field("followers", "Show followers", "number", { defaultValue: 500, min: 0 }),
      field("completion", "Average episode consumption / completion", "number", { defaultValue: 65, min: 0, suffix: "%", hint: "Copy from your host. Average consumption can exceed 100% when listeners replay an episode." }),
    ];
    if (platformKey === "youtube") return [
      field("views", "Views", "number", { defaultValue: 10000, min: 1 }),
      field("likes", "Likes", "number", { defaultValue: 800, min: 0 }),
      field("comments", "Comments", "number", { defaultValue: 80, min: 0 }),
      field("shares", "Shares", "number", { defaultValue: 30, min: 0 }),
      field("impressions", "Thumbnail impressions (optional)", "number", { defaultValue: 0, min: 0 }),
      field("clicks", "Views from those impressions (optional)", "number", { defaultValue: 0, min: 0 }),
      field("avgViewPct", "Average percentage viewed (optional)", "number", { defaultValue: 0, min: 0, suffix: "%", hint: "Can exceed 100% when viewers replay or loop content." }),
    ];
    if (platformKey === "twitch") return [
      field("avgViewers", "Average concurrent viewers", "number", { defaultValue: 50, min: 1 }),
      field("chatters", "Unique chat participants", "number", { defaultValue: 20, min: 0 }),
      field("chatMessages", "Chat messages", "number", { defaultValue: 150, min: 0 }),
      field("follows", "New follows during stream", "number", { defaultValue: 10, min: 0 }),
    ];
    return [
      field("likes", "Likes / reactions", "number", { defaultValue: 1000, min: 0 }),
      field("comments", "Comments / replies", "number", { defaultValue: 100, min: 0 }),
      field("shares", "Shares / reposts", "number", { defaultValue: 50, min: 0 }),
      field("saves", "Saves (where available)", "number", { defaultValue: 50, min: 0 }),
      field("reach", "Reach / impressions / views", "number", { defaultValue: 10000, min: 1, hint: "Use the denominator that matches the metric exported by this platform." }),
      field("followers", "Followers (context only)", "number", { defaultValue: 10000, min: 0 }),
    ];
  }
  if (kind === "growth-calculator") return [
    field("start", platformKey === "spotify" || platformKey === "apple-music" ? "Starting listeners / followers" : `Starting ${platform.audienceLabel}`, "number", { defaultValue: 1000, min: 0 }),
    field("end", `Ending ${platform.audienceLabel}`, "number", { defaultValue: 1500, min: 0 }),
    field("periods", "Number of periods", "number", { defaultValue: 1, min: 1 }),
    field("period", "Period unit", "select", { defaultValue: "month", options: [{ value: "day", label: "Days" }, { value: "week", label: "Weeks" }, { value: "month", label: "Months" }, { value: "quarter", label: "Quarters" }] }),
  ];
  if (kind === "content-planner") return [
    field("brand", "Brand / creator name", "text", { defaultValue: "Your brand" }),
    field("topic", "Niche / release / show topic", "text", { defaultValue: platformKey === "spotify" || platformKey === "apple-music" ? "New music release" : platformKey === "podcast" ? "New podcast episode" : "AI tools for creators" }),
    field("audience", "Who is it for?", "text", { defaultValue: "people who want practical, reliable ideas" }),
    field("goal", "Primary goal", "select", { defaultValue: "grow", options: goals }),
    field("count", "Ideas to create", "number", { defaultValue: 10, min: 3, max: 30 }),
    field("pillar", "Content pillar to emphasise", "select", { defaultValue: "balanced", options: [{ value: "balanced", label: "Balanced mix" }, ...platform.pillars.map((p) => ({ value: p, label: p[0]!.toUpperCase() + p.slice(1) }))] }),
  ];
  if (kind === "content-calendar") return [
    field("brand", "Brand / creator name", "text", { defaultValue: "Your brand" }),
    field("topic", "Campaign / niche / release", "text", { defaultValue: platformKey === "spotify" || platformKey === "apple-music" ? "New release campaign" : platformKey === "podcast" ? "New episode campaign" : "Creator education" }),
    field("goal", "Campaign goal", "select", { defaultValue: "grow", options: goals }),
    field("startDate", "Start date", "date", { defaultValue: localDate(new Date()) }),
    field("count", "Number of posts", "number", { defaultValue: 12, min: 1, max: 30 }),
    field("days", "Posting days (e.g. Mon, Wed, Fri)", "text", { defaultValue: "Mon, Wed, Fri" }),
    field("formatMix", "Format mix", "text", { defaultValue: platform.formats.slice(0, 4).join(", "), hint: "Use comma-separated formats. enV rotates these through the plan." }),
  ];
  if (creatorKinds.includes(kind)) return [
    field("brand", "Brand / creator / artist name", "text", { defaultValue: "Your brand" }),
    field("topic", "Topic / release / episode", "text", { defaultValue: platformKey === "spotify" || platformKey === "apple-music" ? "New music release" : platformKey === "podcast" ? "Latest episode" : "AI tools for creators" }),
    field("audience", "Specific target audience", "text", { defaultValue: "people who want practical, reliable ideas" }),
    field("goal", "Intent", "select", { defaultValue: platformKey === "spotify" || platformKey === "apple-music" || platformKey === "podcast" ? "release" : "educate", options: goals }),
    field("tone", "Voice / tone", "select", { defaultValue: "natural", options: tones }),
    field("proof", "Proof, personal angle or key detail", "text", { defaultValue: "one specific lesson or real example", hint: "A concrete detail helps the output avoid generic filler." }),
    field("cta", "Call to action", "text", { defaultValue: "Save this and share your experience" }),
    field("keywords", "Keywords (comma-separated)", "text", { defaultValue: "creator workflow, practical tips" }),
    field("count", "Number of variants", "number", { defaultValue: 5, min: 1, max: 10 }),
  ];
  if (kind === "posting-time-helper") return [
    field("timezone", "Audience time zone (IANA)", "text", { defaultValue: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC" }),
    field("audienceWindows", "Active windows from native analytics", "textarea", { defaultValue: "", placeholder: "Mon 18:00 = 42\nWed 20:00 = 37\nSat 11:00 = 29", hint: "One per line: Day HH:mm = activity score (e.g. followers online or relative audience activity). This tool does not invent a best time." }),
    field("goal", "What are you optimising for?", "select", { defaultValue: "engage", options: [{ value: "engage", label: "Replies / engagement" }, { value: "reach", label: "Reach / discovery" }, { value: "release", label: "Release / episode launch" }, { value: "clicks", label: "Link clicks / conversion" }] }),
  ];
  if (kind === "thumbnail-size-helper") return [
    field("asset", "Asset type", "select", { defaultValue: platformKey === "spotify" || platformKey === "apple-music" || platformKey === "podcast" ? "cover" : platformKey === "tiktok" ? "vertical" : "thumbnail", options: [{ value: "thumbnail", label: "Video thumbnail" }, { value: "vertical", label: "Short-form / vertical cover" }, { value: "cover", label: "Album / show cover" }, { value: "feed", label: "Feed image" }, { value: "banner", label: "Profile / channel banner" }] }),
  ];
  return [field("value", "Value", "text", { defaultValue: "100" })];
}

function safeCount(value: string | undefined, fallback: number, max: number) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.min(max, Math.max(1, Math.floor(n))) : fallback;
}
function number(value: string | undefined, label: string, fallback = 0) {
  const raw = (value ?? "").trim();
  const n = raw === "" ? fallback : Number(raw.replace(/,/g, ""));
  if (!Number.isFinite(n)) throw new Error(`${label} must be a valid number.`);
  return n;
}
function nonnegative(value: string | undefined, label: string, fallback = 0) {
  const n = number(value, label, fallback);
  if (n < 0) throw new Error(`${label} cannot be negative.`);
  return n;
}
function positive(value: string | undefined, label: string, fallback = 1) {
  const n = number(value, label, fallback);
  if (n <= 0) throw new Error(`${label} must be greater than zero.`);
  return n;
}
function bounded(value: string | undefined, label: string, min: number, max: number, fallback = min) {
  const n = number(value, label, fallback);
  if (n < min || n > max) throw new Error(`${label} must be between ${min} and ${max}.`);
  return n;
}
function clean(s: string | undefined, fallback: string) { return (s ?? "").trim() || fallback; }
function commas(n: number) { return n.toLocaleString(undefined, { maximumFractionDigits: 2 }); }
function percent(n: number) { return `${n.toFixed(2)}%`; }
function slug(s: string) { return s.toLowerCase().replace(/[^a-z0-9]+/g, "").slice(0, 24) || "creator"; }
function humanize(value: string) { return value.replace(/-/g, " ").replace(/\b\w/g, (x) => x.toUpperCase()); }

const hooks: ((topic: string, proof?: string, audience?: string) => string)[] = [
  (topic: string, proof = "one practical detail") => `The part of ${topic} most people overlook: ${proof}.`,
  (topic: string) => `Before you spend more time on ${topic}, check this.`,
  (topic: string) => `A practical way to make progress with ${topic} this week.`,
  (topic: string, _proof = "one practical detail", audience = "your audience") => `For ${audience}: one useful lesson about ${topic}.`,
  (topic: string) => `I wish I had understood this earlier about ${topic}.`,
  (topic: string, proof = "one practical detail") => `A small change in ${topic} can make a real difference: ${proof}.`,
  (topic: string) => `Let's make ${topic} easier to understand.`,
  (topic: string, _proof = "one practical detail", audience = "your audience") => `What should ${audience} know before trying ${topic}?`,
];

function goalSentence(goal: string) {
  return ({ grow: "help the right people discover the work", engage: "invite a specific, thoughtful response", educate: "teach one practical takeaway", convert: "make the next action clear without pressure", release: "give people a reason to listen or watch", community: "make the audience feel part of the journey" } as Record<string, string>)[goal] ?? "deliver a useful next step";
}

function composeVariants(kind: string, op: string, v: Record<string, string>) {
  const platformKey = creatorPlatformFromOp(op);
  const platform = CREATOR_PLATFORMS[platformKey]!;
  const brand = clean(v.brand, "The creator");
  const topic = clean(v.topic, "your topic");
  const audience = clean(v.audience, "your audience");
  const tone = v.tone || "natural";
  const goal = v.goal || "educate";
  const proof = clean(v.proof, "one clear example");
  const cta = clean(v.cta, "Share your experience");
  const count = safeCount(v.count, 5, 10);
  const titleHooks = hooks.map((h) => h(topic, proof, audience));
  const styles = ["clear and direct", "question-led", "outcome-led", "story-led", "contrarian but fair", "step-by-step", "community-led", "curiosity-led", "proof-led", "series-led"];
  const ctaByGoal = goal === "release" ? ["Listen to the full release", "Save the track and send it to someone", "Tell us which line stayed with you"]
    : goal === "convert" ? [cta, "See the details and decide if it fits", "Send a message with your question"]
      : goal === "engage" || goal === "community" ? ["What would you add?", "Share your experience below", cta]
        : ["Save this for later", "Share it with someone who needs it", cta];
  const hashtagSet = [...new Set((v.keywords || topic).split(/[\s,;]+/).filter(Boolean).map((x) => `#${slug(x)}`))];
  const platformTag = `#${slug(platformKey)}`;
  const output: string[] = [];

  for (let i = 0; i < count; i++) {
    const hook = titleHooks[i % titleHooks.length]!;
    const style = styles[i % styles.length]!;
    if (kind === "title-generator") {
      const title = [
        `${topic}: ${proof}`,
        `What ${audience} should know about ${topic}`,
        `A practical guide to ${topic}`,
        `${topic} — what worked, what did not, and why`,
        `The overlooked lesson in ${topic}`,
        `${topic}, explained with a real example`,
        `How ${brand} approaches ${topic}`,
        `Before you try ${topic}: start here`,
      ][i % 8]!;
      output.push(`${i + 1}. ${title}`);
    } else if (kind === "caption-generator") {
      const lead = tone === "bold" ? `Let's be honest: ${topic} deserves more than vague advice.`
        : tone === "professional" || tone === "expert" ? `A useful distinction about ${topic}: ${proof}.`
          : tone === "playful" ? `A quick creator note about ${topic} 👇`
            : tone === "warm" ? `Sharing something I have been learning about ${topic}.`
              : hook;
      output.push(`${i + 1}. ${lead}\n\n${proof}. This is for ${audience}; the practical takeaway is to focus on one next step and test it in your own context.\n\n${ctaByGoal[i % ctaByGoal.length]}`);
    } else if (kind === "description-generator") {
      output.push(`${i + 1}. ${topic} | ${style}\n\n${brand} shares a focused ${platform.label} resource for ${audience}. In this piece, we cover ${proof}, explain why it matters, and give you a practical next step to apply.\n\nYou will take away:\n• The key idea behind ${topic}\n• A real-world detail to pay attention to\n• One action you can test\n\n${ctaByGoal[i % ctaByGoal.length]}`);
    } else if (kind === "hashtag-generator") {
      const platformExtras: Record<string, string[]> = {
        youtube: ["#YouTubeCreator", "#VideoCreator", "#LearnOnYouTube"], tiktok: ["#TikTokCreator", "#LearnOnTikTok", "#CreatorTips"],
        instagram: ["#InstagramCreator", "#ReelsTips", "#InstagramCommunity"], facebook: ["#FacebookCreator", "#CommunityBuilding"],
        x: ["#BuildInPublic", "#CreatorCommunity"], linkedin: ["#LinkedInCreators", "#ProfessionalGrowth"],
        twitch: ["#TwitchStreamer", "#TwitchCommunity", "#LiveStreaming"], spotify: ["#IndependentArtist", "#NewMusic", "#SpotifyForArtists"],
        "apple-music": ["#IndependentArtist", "#NewMusic", "#AppleMusic"], podcast: ["#Podcast", "#PodcastCreator", "#PodcastEpisode"],
      };
      const tags = [...new Set([...hashtagSet, ...platformExtras[platformKey]!, platformTag])].slice(0, 12);
      output.push(`${i + 1}. ${tags.join(" ")}\n\nUse only tags that accurately describe this post. A hashtag set is not a reach guarantee; remove anything irrelevant and check current platform conventions.`);
    } else {
      const role = platformKey === "spotify" || platformKey === "apple-music" ? "independent recording artist" : platformKey === "podcast" ? "podcast host" : "creator";
      output.push(`${i + 1}. ${brand} | ${role}\n\n${tone === "professional" || tone === "expert" ? `Sharing practical insight on ${topic} for ${audience}.` : `I create around ${topic}, with useful ideas and honest lessons for ${audience}.`}\n\nFocus: ${proof}.\nNew work and updates: ${goalSentence(goal)}.`);
    }
  }
  return output.join("\n\n---\n\n");
}

type PlanTheme = [title: string, concept: string, cta: string];

const PLATFORM_THEMES: Record<string, PlanTheme[]> = {
  youtube: [
    ["Search-led tutorial", "Answer one specific search question about {topic}; show the steps on screen and preview the outcome early.", "Ask which step needs a deeper walkthrough"],
    ["Retention reset", "Open with the result, then build a clear sequence of stakes, demonstration and payoff around {topic}.", "Invite viewers to watch the related next video"],
    ["Thumbnail promise test", "Create two honest thumbnail/title concepts for the same {topic}; make the promise specific and fulfil it in the video.", "Ask which promise is clearer before publishing"],
    ["Series bridge", "Turn {topic} into a connected episode and explain what viewers should watch or learn next.", "Point to the next episode in the series"],
    ["Shorts cut-down", "Extract one complete, useful moment from {topic}; make the short understandable without the long video.", "Direct viewers to the full explanation when useful"],
  ],
  tiktok: [
    ["First-second hook", "Show the surprising result or problem in the opening beat of a native vertical video about {topic}.", "Ask viewers to comment with the next question"],
    ["Reply video", "Turn a real audience question about {topic} into a concise video reply; show the question and demonstrate the answer.", "Invite one follow-up question"],
    ["Repeatable series", "Create a recognisable recurring episode around one small part of {topic}; label the series and episode clearly.", "Follow for the next instalment"],
    ["Process proof", "Show the real process behind {topic}, including one mistake or limitation rather than presenting a polished claim only.", "Ask what part viewers want to see next"],
    ["Trend adaptation", "Use a relevant current format only when it genuinely fits {topic}; add an original demonstration or point of view.", "Invite viewers to share their own version"],
  ],
  instagram: [
    ["Save-worthy carousel", "Turn {topic} into a concise carousel: promise, steps, worked example, caveat and recap.", "Save the carousel for later"],
    ["Reel with a clear payoff", "Demonstrate one visually clear result about {topic}; add readable captions and a concrete ending.", "Share it with someone who needs the tip"],
    ["Story conversation", "Use a short Story sequence to frame {topic}, ask a poll or question, then share the answer with context.", "Reply to the Story with a question"],
    ["Collaboration angle", "Pair two complementary perspectives on {topic} in a joint post or Reel; agree on audience and value first.", "Tag the collaborator and invite discussion"],
    ["Profile conversion check", "Create a post that explains who the account helps, what it publishes and the next useful step.", "Visit the profile and choose the relevant next step"],
  ],
  facebook: [
    ["Community discussion", "Frame {topic} as a practical question for a relevant group or community; give enough context to invite useful replies.", "Share a specific experience in the comments"],
    ["Native video explainer", "Publish a self-contained native video about {topic} with a clear opening, captions and a community prompt.", "Share the question with your community"],
    ["Event or Live follow-up", "Turn a Live, event or community session about {topic} into a recap with key moments and next steps.", "Register or follow the next session"],
    ["Local relevance", "Explain how {topic} affects a defined local audience; distinguish confirmed facts from personal opinion.", "Tag a relevant community member"],
    ["Link context", "When sharing an external resource about {topic}, explain why it matters and what readers should look for before the link.", "Open the source and add your takeaway"],
  ],
  x: [
    ["Insight thread", "Break {topic} into a short thread: strong opening claim, supporting points, evidence, nuance and conclusion.", "Reply with the counterexample or question"],
    ["Build-in-public update", "Share a specific decision, experiment or result about {topic}; include what changed and what remains unknown.", "Ask what you should test next"],
    ["Live conversation prompt", "Start a timely, narrow discussion about {topic} that people can answer from direct experience.", "Quote-post a useful response with credit"],
    ["Poll with context", "Use a poll to learn how people approach {topic}; explain what the options mean and what the result cannot prove.", "Explain your vote in a reply"],
    ["Visual explainer", "Use one chart, screenshot or visual to make a single point about {topic}; cite the underlying source where relevant.", "Bookmark the source or add a question"],
  ],
  linkedin: [
    ["Practitioner case study", "Explain a real work problem about {topic}, the constraints, the action taken and what the evidence did or did not show.", "Share a comparable professional experience"],
    ["Document carousel", "Build a concise document post about {topic}: problem, framework, worked example, limitation and summary.", "Save the framework for a future project"],
    ["Founder or career lesson", "Tell a specific professional story about {topic}; focus on the decision and lesson, not a motivational slogan.", "Ask how others handled the same decision"],
    ["Evidence-led point of view", "Take a clear position on {topic}, support it with a credible example and fairly acknowledge an important trade-off.", "Add a different perspective with evidence"],
    ["Useful professional resource", "Curate one resource about {topic}; state who it helps, what it covers and where its limits are.", "Share another resource that complements it"],
  ],
  twitch: [
    ["Interactive stream segment", "Design a live segment about {topic} with a clear audience choice, repeatable structure and visible payoff.", "Vote in chat on the next segment"],
    ["Community challenge", "Set a fair, time-boxed challenge around {topic}; explain the rules, progress milestones and how viewers can participate.", "Join the next challenge"],
    ["Clip-worthy moment", "Plan a segment with a self-contained reveal, skill demonstration or funny payoff that makes sense as a short clip.", "Clip the moment and suggest a title"],
    ["Stream schedule promise", "Announce the next stream with its exact topic, time zone, format and what viewers can take part in.", "Set a reminder and join live"],
    ["VOD chapter recap", "Turn a long VOD about {topic} into clear chapters or highlights so viewers can jump to the moment they need.", "Watch the chapter that answers your question"],
  ],
  spotify: [
    ["Track story", "Tell the real story behind the song {topic}: what inspired it, one lyrical detail and the feeling you hope listeners notice.", "Listen and share the line that stayed with you"],
    ["Release runway", "Plan a release sequence with a teaser, pre-save where available, release-day story and post-release listener follow-up.", "Follow the artist and save the release"],
    ["Fan conversion", "Use an audience-facing clip to explain why a listener might save, follow or return to the artist's catalogue after hearing {topic}.", "Save the track and follow for new music"],
    ["Live version or acoustic take", "Create a live, acoustic or alternate performance of {topic} that reveals something different from the studio recording.", "Tell us which version you prefer"],
    ["Catalogue connection", "Connect {topic} to an earlier song, feature or collaboration; give new listeners a clear listening path.", "Explore the related track next"],
  ],
  "apple-music": [
    ["Artist story", "Build a short artist-led story around {topic} and keep release metadata, artwork and credits consistent across the campaign.", "Listen to the release and follow the artist"],
    ["Shazam discovery moment", "Create a concise behind-the-song clip around {topic}; use Shazam or listener discovery data as a signal, not proof of long-term fandom.", "Identify the song and save it"],
    ["Release asset checklist", "Prepare approved square artwork, consistent artist naming, credits and delivery details for {topic} before release day.", "Check the release in the artist dashboard"],
    ["Listener geography", "Use a verified listener-location insight to plan relevant local content or live activity around {topic}; avoid assuming every listener is a fan.", "Tell us which city should hear it live"],
    ["Catalogue spotlight", "Introduce one older release related to {topic} and explain the connection for someone discovering the artist today.", "Explore the catalogue and add a favourite"],
  ],
  podcast: [
    ["Episode promise", "Write one clear listener promise for {topic}; make the episode title, opening and show notes deliver that same promise.", "Follow the show for the next episode"],
    ["Guest amplification", "Create a guest-ready share pack for {topic}: quote, vertical clip, episode link and a short personal message the guest can adapt.", "Share the episode with someone in the field"],
    ["Listener question", "Build an episode or short segment around one real listener question about {topic}; state where the answer has limits.", "Send the next question to the show"],
    ["Clip with context", "Cut a self-contained clip from {topic}; include enough context to avoid misrepresenting the full conversation.", "Listen to the full episode for the nuance"],
    ["Show notes and chapters", "Prepare useful show notes for {topic}: guest and source links, key takeaways, clear chapters and corrections if needed.", "Open the show notes and explore the sources"],
  ],
};

function contentPlan(op: string, v: Record<string, string>, calendar: boolean, now = new Date()) {
  const platformKey = creatorPlatformFromOp(op);
  const platform = CREATOR_PLATFORMS[platformKey]!;
  const topic = clean(v.topic, "your topic");
  const brand = clean(v.brand, "Your brand");
  const goal = goalSentence(v.goal || "grow");
  const count = safeCount(v.count, calendar ? 12 : 10, 30);
  const formats = clean(v.formatMix, platform.formats.join(", ")).split(",").map((x) => x.trim()).filter(Boolean);
  const selectedPillar = v.pillar || "balanced";
  const pillars = selectedPillar === "balanced" || !platform.pillars.includes(selectedPillar) ? platform.pillars : [selectedPillar];
  const baseThemes: PlanTheme[] = [
    ["Teach", `A step-by-step explanation of one useful part of {topic}.`, "Save this as a reference"],
    ["Proof", `Show a result, process, demo or evidence connected to {topic}; explain the context, not just the claim.`, "Ask a specific question about the process"],
    ["Story", `Tell the real reason {brand} cares about {topic}; keep the story specific and honest.`, "Invite the audience to share a similar experience"],
    ["Myth", `Address a common misconception about {topic} and explain the more accurate picture.`, "Ask which misconception people encounter most"],
    ["FAQ", `Answer one question ${platform.audienceLabel} repeatedly ask about {topic}.`, "Collect the next question"],
    ["Behind the scenes", `Show one decision, tool or challenge behind {topic}.`, "Invite the audience behind the next step"],
    ["Comparison", `Compare two reasonable approaches to {topic}; identify where each works.`, "Ask which context the audience is working in"],
    ["Checklist", `Create a short checklist for getting started with {topic}.`, "Encourage a save or share"],
    ["Community", `Feature a thoughtful audience response or contributor perspective about {topic}.`, "Invite the community to contribute"],
    ["Offer", `Explain who your {topic} resource is for, who it is not for, and the next step.`, "Use a low-friction invitation"],
    ["Update", `Share a meaningful update, lesson or change related to {topic}.`, "Ask what the next update should cover"],
    ["Recap", `Summarise the most useful lessons from the {topic} series so far.`, "Point to the next episode or resource"],
  ];
  const themes = [...(PLATFORM_THEMES[platformKey] ?? []), ...baseThemes].map(([title, concept, cta]) => [
    title,
    concept.replaceAll("{topic}", topic).replaceAll("{brand}", brand),
    cta,
  ] as PlanTheme);
  if (!calendar) {
    return `CREATOR CONTENT PLAN — ${platform.label}\nBrand: ${brand}\nTopic: ${topic}\nGoal: ${goal}\n\n${Array.from({ length: count }, (_, i) => {
      const theme = themes[i % themes.length]!;
      const pillar = pillars[i % pillars.length]!;
      const format = formats[i % formats.length] ?? platform.formats[i % platform.formats.length]!;
      return `${i + 1}. ${theme[0]} / ${pillar}\nFormat: ${format}\nConcept: ${theme[1]}\nOpening angle: ${hooks[i % hooks.length]!(topic, theme[1]!)}\nCTA: ${theme[2]}`;
    }).join("\n\n")}`;
  }
  const daysRaw = clean(v.days, "Mon, Wed, Fri").split(/[\s,;]+/).filter(Boolean);
  const dayAliases: Record<string, number> = { sun: 0, sunday: 0, mon: 1, monday: 1, tue: 2, tues: 2, tuesday: 2, wed: 3, wednesday: 3, thu: 4, thur: 4, thurs: 4, thursday: 4, fri: 5, friday: 5, sat: 6, saturday: 6 };
  const mappedDays = daysRaw.map((x) => dayAliases[x.toLowerCase().replace(/[^a-z]/g, "")]);
  if (mappedDays.some((x) => x === undefined)) throw new Error("One or more posting days are invalid. Enter a valid posting day: Mon, Tue, Wed, Thu, Fri, Sat or Sun.");
  const chosenDays = [...new Set(mappedDays as number[])].sort((a, b) => a - b);
  if (!chosenDays.length) throw new Error("Enter at least one valid posting day: Mon, Tue, Wed, Thu, Fri, Sat or Sun.");
  const dateInput = v.startDate || localDate(now);
  const dateParts = dateInput.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!dateParts) throw new Error("Choose a valid calendar start date.");
  const startDate = new Date(Number(dateParts[1]), Number(dateParts[2]) - 1, Number(dateParts[3]), 12);
  if (startDate.getFullYear() !== Number(dateParts[1]) || startDate.getMonth() !== Number(dateParts[2]) - 1 || startDate.getDate() !== Number(dateParts[3])) {
    throw new Error("Choose a valid calendar start date.");
  }
  const items: string[] = [];
  let date = new Date(startDate);
  let scheduled = 0;
  let safety = 0;
  while (scheduled < count && safety < 370) {
    if (chosenDays.includes(date.getDay())) {
      const i = scheduled;
      const theme = themes[i % themes.length]!;
      const format = formats[i % formats.length] ?? platform.formats[i % platform.formats.length]!;
      items.push(`${i + 1}. ${date.toLocaleDateString(undefined, { weekday: "short", year: "numeric", month: "short", day: "numeric" })}\n${theme[0]} · ${format}\n${theme[1]}\nCTA: ${theme[2]}`);
      scheduled++;
    }
    date.setDate(date.getDate() + 1);
    safety++;
  }
  return `CONTENT CALENDAR — ${platform.label}\nBrand: ${brand}\nCampaign: ${topic}\nGoal: ${goal}\nStart: ${startDate.toLocaleDateString()}\nPosting days: ${chosenDays.map((d) => ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][d]).join(", ")}\n\n${items.join("\n\n")}\n\nPlanning note: this is a proposed publishing plan, not an auto-publishing connection. Check each platform's current format support and audience analytics before scheduling.`;
}

function postingTime(v: Record<string, string>, platform: string) {
  const timezone = clean(v.timezone, "UTC");
  const raw = (v.audienceWindows || "").trim();
  if (!raw) return `${platform.toUpperCase()} POSTING-TIME WORKFLOW\nAudience time zone: ${timezone}\n\nNo audience activity data was entered, so enV will not invent a universal best time.\n\n1. Open the platform's native analytics and choose the same recent date range (ideally several weeks).\n2. Record when your audience is active, using the audience's local time zone.\n3. Test two or three distinct windows with comparable formats and topics.\n4. Compare reach, qualified views, saves, replies, click-throughs or listens—not just impressions.\n5. Keep the winning window only when the improvement repeats across multiple posts.\n\nEnter activity windows in the format: Mon 18:00 = 42. The score can be followers online or a consistent relative activity measure.`;
  const lines = raw.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const parsed = lines.map((line) => {
    const match = line.match(/^(Sun(?:day)?|Mon(?:day)?|Tue(?:s(?:day)?)?|Wed(?:nesday)?|Thu(?:rs?(?:day)?)?|Fri(?:day)?|Sat(?:urday)?)\s+(\d{1,2}:\d{2})\s*(?:=|:|,|\s)\s*(\d+(?:\.\d+)?)$/i);
    if (!match) throw new Error(`Invalid activity window: "${line}". Use Day HH:mm = score.`);
    const [day, time, score] = [match[1]!, match[2]!, Number(match[3])];
    const [hour, minute] = time.split(":").map(Number);
    if (hour! > 23 || minute! > 59) throw new Error(`Invalid time in activity window: "${line}".`);
    return { day: day.slice(0, 3), time: `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`, score };
  });
  if (!parsed.length) throw new Error("No valid activity windows found. Use one line per window, such as: Mon 18:00 = 42.");
  const uniqueWindows = new Set(parsed.map((x) => `${x.day}-${x.time}`));
  if (uniqueWindows.size !== parsed.length) throw new Error("Remove duplicate day/time windows before ranking your audience activity.");
  const sorted = [...parsed].sort((a, b) => b.score - a.score);
  const top = sorted.slice(0, Math.min(3, sorted.length));
  return `${platform.toUpperCase()} AUDIENCE-BASED POSTING WINDOWS\nAudience time zone: ${timezone}\nOptimisation goal: ${humanize(v.goal || "engage")}\n\nBest observed windows from your input:\n${top.map((x, i) => `${i + 1}. ${x.day} ${x.time} — activity score ${commas(x.score)}`).join("\n")}\n\nMethod: ranked only from the activity data you supplied. This is not an enV prediction or a guaranteed best time. Test the top windows against comparable posts and review outcome metrics in native analytics.`;
}

function engagement(op: string, v: Record<string, string>) {
  const platformKey = creatorPlatformFromOp(op);
  const label = CREATOR_PLATFORMS[platformKey]!.label;
  if (platformKey === "spotify") {
    const listeners = positive(v.listeners, "Unique listeners", 1);
    const streams = nonnegative(v.streams, "Streams"); const saves = nonnegative(v.saves, "Saves"); const adds = nonnegative(v.playlistAdds, "Playlist additions");
    return `SPOTIFY LISTENER ENGAGEMENT\nStreams per listener: ${(streams / listeners).toFixed(2)}\nSave rate: ${percent(saves / listeners * 100)}\nPlaylist-add rate: ${percent(adds / listeners * 100)}\n\nRead this with your native artist analytics: monthly active, previously active and programmed listeners, playlist sources, geography and release timing add context. These are descriptive ratios, not a universal quality score.`;
  }
  if (platformKey === "apple-music") {
    const listeners = positive(v.listeners, "Listeners", 1);
    const plays = nonnegative(v.plays, "Plays"); const shazams = nonnegative(v.shazams, "Shazam count");
    const radioSpins = nonnegative(v.radioSpins, "Radio spins"); const purchases = nonnegative(v.purchases, "Song purchases");
    return `APPLE MUSIC ARTIST SIGNALS\nPlays per listener: ${(plays / listeners).toFixed(2)}\nShazam events per listener: ${(shazams / listeners).toFixed(3)}\nRadio spins: ${commas(radioSpins)}\nSong purchases per listener: ${percent(purchases / listeners * 100)}\n\nApple Music for Artists reports plays, listeners, Shazam count, radio spins and purchases. Compare the same reporting window and use listener geography and song-level trends for context. These signals are not a universal quality score.`;
  }
  if (platformKey === "podcast") {
    const listeners = positive(v.listeners, "Unique listeners", 1);
    const downloads = nonnegative(v.downloads, "Episode downloads"); const engaged = nonnegative(v.engagedListeners, "Engaged listeners");
    const followers = nonnegative(v.followers, "Show followers"); const completion = nonnegative(v.completion, "Average consumption / completion");
    if (engaged > listeners) throw new Error("Engaged listeners cannot exceed unique listeners for the same reporting window.");
    return `PODCAST AUDIENCE HEALTH\nDownloads per unique listener: ${(downloads / listeners).toFixed(2)}\nEngaged-listener rate: ${percent(engaged / listeners * 100)}\nFollower-to-listener ratio: ${percent(followers / listeners * 100)}\nAverage episode consumption / completion: ${percent(completion)}\n\nCompare episodes over the same measurement window. Hosting providers define downloads, listeners and engagement differently. Apple Podcasts defines engaged listeners as people who hear at least 20 minutes or 40% of an episode, and average consumption can exceed 100% when listeners replay an episode.`;
  }
  if (platformKey === "twitch") {
    const viewers = positive(v.avgViewers, "Average concurrent viewers", 1);
    const chatters = nonnegative(v.chatters, "Unique chatters"); const messages = nonnegative(v.chatMessages, "Chat messages"); const follows = nonnegative(v.follows, "New follows");
    return `TWITCH LIVE ENGAGEMENT\nChat participation rate: ${percent(chatters / viewers * 100)}\nMessages per unique chatter: ${chatters ? (messages / chatters).toFixed(2) : "N/A"}\nFollows per average concurrent viewer: ${percent(follows / viewers * 100)}\n\nThese are stream-session ratios, not a platform-wide Twitch benchmark. Compare streams with similar lengths, categories and audience sizes.`;
  }
  if (platformKey === "youtube") {
    const views = positive(v.views, "Views", 1); const interactions = nonnegative(v.likes, "Likes") + nonnegative(v.comments, "Comments") + nonnegative(v.shares, "Shares");
    const impressions = nonnegative(v.impressions, "Impressions"); const clicks = nonnegative(v.clicks, "Impression views"); const viewed = nonnegative(v.avgViewPct, "Average percentage viewed");
    const parts = [`Interaction rate by views: ${percent(interactions / views * 100)}`];
    if (impressions > 0) {
      if (clicks > impressions) throw new Error("Views from impressions cannot exceed thumbnail impressions.");
      parts.push(`Thumbnail impressions click-through rate: ${percent(clicks / impressions * 100)}`);
    }
    if (viewed > 0) parts.push(`Average percentage viewed: ${percent(viewed)}`);
    return `YOUTUBE VIDEO PERFORMANCE\n${parts.join("\n")}\n\nRead the funnel together: impressions and click-through indicate packaging appeal; watch time and average view duration show viewing depth; comments, shares and returning viewers add context. Do not optimise CTR alone.`;
  }
  const reach = positive(v.reach, "Reach / impressions / views", 1);
  const interactions = nonnegative(v.likes, "Likes") + nonnegative(v.comments, "Comments") + nonnegative(v.shares, "Shares") + nonnegative(v.saves, "Saves");
  const followers = nonnegative(v.followers, "Followers");
  return `${label.toUpperCase()} ENGAGEMENT\nTotal interactions: ${commas(interactions)}\nInteraction rate by reach / impressions / views: ${percent(interactions / reach * 100)}${followers > 0 ? `\nInteraction-to-follower ratio (context only): ${percent(interactions / followers * 100)}` : ""}\n\nUse the denominator shown in the same native analytics report. Reach, impressions, video views and followers are not interchangeable; compare like with like over the same period.`;
}

function growth(op: string, v: Record<string, string>) {
  const platform = CREATOR_PLATFORMS[creatorPlatformFromOp(op)]!.label;
  const start = number(v.start, "Starting audience"); const end = number(v.end, "Ending audience");
  const periods = Math.max(1, number(v.periods, "Periods", 1));
  if (start < 0 || end < 0) throw new Error("Audience values cannot be negative.");
  if (start === 0 && end === 0) throw new Error("Enter a non-zero starting or ending audience.");
  const net = end - start; const total = start ? (net / start) * 100 : null;
  const cagr = start > 0 ? (Math.pow(end / start, 1 / periods) - 1) * 100 : null;
  const unit = v.period || "month";
  return `${platform.toUpperCase()} AUDIENCE GROWTH\nStarting audience: ${commas(start)}\nEnding audience: ${commas(end)}\nNet change: ${net >= 0 ? "+" : ""}${commas(net)}\nTotal change: ${total === null ? "Not defined from a zero start" : percent(total)}\nAverage net change per ${unit}: ${commas(net / periods)}${cagr === null ? "" : `\nCompound growth per ${unit}: ${percent(cagr)}`}\n\nKeep the measurement window, audience definition and platform source consistent. A monthly listener, follower, subscriber and view are different units.`;
}

function revenue(op: string, v: Record<string, string>) {
  const platformKey = creatorPlatformFromOp(op); const platform = CREATOR_PLATFORMS[platformKey]!.label;
  if (platformKey === "spotify" || platformKey === "apple-music") {
    const historicalStreams = positive(v.historyStreams, "Historical streams", 1);
    const historyPayout = nonnegative(v.historyPayout, "Actual historical payout");
    const forecastStreams = nonnegative(v.forecastStreams, "Forecast streams");
    const rightsShare = bounded(v.rightsShare, "Rights share", 0, 100, 100);
    const fee = bounded(v.distributionFee, "Fee", 0, 100, 0);
    const effective = historyPayout / historicalStreams;
    const gross = effective * forecastStreams;
    const net = gross * rightsShare / 100 * (1 - fee / 100);
    const currency = clean(v.currency, "Currency");
    const unit = platformKey === "apple-music" ? "play / royalty unit" : "stream";
    return `${platform.toUpperCase()} HISTORICAL-RATE SCENARIO\nHistorical payout per ${unit} (your statement): ${currency} ${effective.toFixed(6)}\nForecast ${platformKey === "apple-music" ? "plays / royalty units" : "streams"}: ${commas(forecastStreams)}\nForecast payout at the same historical effective rate: ${currency} ${gross.toFixed(2)}\nYour rights share: ${percent(rightsShare)}\nAdditional fee: ${percent(fee)}\nIllustrative amount after entered shares/fee: ${currency} ${net.toFixed(2)}\n\nImportant: this is a scenario based on your own statement, not an official platform rate or payout promise. Spotify says royalties are based on streamshare, not a fixed per-stream rate. Apple directs artists to their distributor for financial and royalty questions. Territories, subscription mix, monthly streamshare, rights ownership and distributor agreements can change actual results. No currency conversion is performed.`;
  }
  const volume = nonnegative(v.volume, "Eligible views / volume"); const rpm = nonnegative(v.rate, "Observed RPM"); const other = nonnegative(v.other, "Other income");
  const fee = bounded(v.fee, "Partner share", 0, 100, 0);
  const rateIncome = volume / 1000 * rpm; const gross = rateIncome + other; const net = gross * (1 - fee / 100); const currency = clean(v.currency, "USD");
  return `${platform.toUpperCase()} CREATOR REVENUE SCENARIO\nEligible volume: ${commas(volume)}\nObserved / assumed RPM per 1,000: ${currency} ${rpm.toFixed(4)}\nRate-based income: ${currency} ${rateIncome.toFixed(2)}\nOther income: ${currency} ${other.toFixed(2)}\nEstimated gross: ${currency} ${gross.toFixed(2)}\nPartner / management share: ${percent(fee)}\nIllustrative amount after share: ${currency} ${net.toFixed(2)}\n\nUse your own monetised-volume and dashboard RPM for the same period. Eligibility, geography, ad fill, content format, revenue sources and platform programme rules affect actual earnings. This is not a payout guarantee and does not convert currencies.`;
}

export function runCreatorTool(op: string, values: Record<string, string>, now = new Date()): string {
  const platformKey = creatorPlatformFromOp(op); const platform = CREATOR_PLATFORMS[platformKey]!;
  const kind = creatorKindFromOp(op);
  if (kind === "thumbnail-size-helper") {
    const asset = values.asset || "thumbnail";
    return `${platform.label.toUpperCase()} ASSET EXPORT GUIDE\n${asset === "cover" ? platform.size : asset === "vertical" && platformKey === "youtube" ? "YouTube Shorts thumbnail: 2160 × 3840 (9:16 recommended); note that custom Shorts thumbnails are currently managed in YouTube Studio on computer and eligibility/features can vary." : asset === "banner" ? `${platform.label} profile / channel banner: use the exact banner template from the platform's current upload UI; account for mobile crop and safe areas.` : asset === "feed" ? `${platform.label} feed image: prepare a high-resolution master and check the current placement crop in the native composer.` : platform.size}\n\nPre-export checklist\n• Keep a clean master file and export a separate copy for each placement.\n• Check crop, legibility and safe areas at phone size.\n• Use only artwork, photos, fonts and logos you have rights to use.\n• Confirm current file type, size limit and account eligibility in the platform's own publishing UI.\n• Do not add claims, dates, logos or text that the platform/distributor prohibits.`;
  }
  if (kind === "engagement-calculator") return engagement(op, values);
  if (kind === "growth-calculator") return growth(op, values);
  if (kind === "revenue-calculator") return revenue(op, values);
  if (kind === "content-planner") return contentPlan(op, values, false, now);
  if (kind === "content-calendar") return contentPlan(op, values, true, now);
  if (kind === "posting-time-helper") return postingTime(values, platformKey);
  if (["caption-generator", "title-generator", "description-generator", "hashtag-generator", "bio-generator"].includes(kind)) return composeVariants(kind, op, values);
  throw new Error(`The ${platform.label} ${humanize(kind)} tool is not connected to a working workflow yet.`);
}