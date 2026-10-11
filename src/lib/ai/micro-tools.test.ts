import assert from "node:assert/strict";
import test from "node:test";
import { AI_MICRO_TOOL_OPERATION, generateAiMicroTool, isAiMicroToolId, operationForAiMicroTool } from "./micro-tools.ts";

test("AI micro-tools expose exactly the 13 previously Web-only routes", () => {
  assert.equal(Object.keys(AI_MICRO_TOOL_OPERATION).length, 13);
  assert.equal(isAiMicroToolId("blog-outline-generator"), true);
  assert.equal(isAiMicroToolId("blog-outline-generator-extra"), false);
  assert.equal(operationForAiMicroTool("youtube-title-helper"), "yt-title");
  assert.equal(operationForAiMicroTool("title-generator"), undefined);
});

test("blog outline preserves the Web wording and multiline user inputs", () => {
  assert.equal(generateAiMicroTool("blog-outline", { topic: "Gardening", audience: "new growers", goal: "Build confidence" }), "Title: Gardening\nAudience: new growers\nGoal: Build confidence\n\nOutline\n1. Introduction — the problem and why it matters\n2. What Gardening means\n3. The key ideas new growers should understand\n4. Practical steps or examples\n5. Common mistakes to avoid\n6. Checklist / next steps\n7. Conclusion and CTA");
});

test("call-to-action tool emits the five deterministic options", () => {
  assert.equal(generateAiMicroTool("cta", { topic: "Meal prep" }), "1. Get started with Meal prep\n\n2. Try Meal prep today\n\n3. See how Meal prep can help\n\n4. Learn more about Meal prep\n\n5. Start creating with Meal prep");
});

test("expand helper preserves the existing suffix and blank fallback", () => {
  assert.equal(generateAiMicroTool("expand", { text: "A useful idea" }), "A useful idea.\n\nKey context: explain why this matters, who it affects, and what should happen next. Add one practical example and finish with a clear next step.");
  assert.match(generateAiMicroTool("expand", { text: "   " }), /^Your notes\./);
});

test("FAQ generator splits and trims newline/comma-separated points", () => {
  assert.equal(generateAiMicroTool("faq", { topic: "Meal prep", audience: "students", points: "Storage\n, Cost, " }), "Q: Storage about Meal prep?\nA: Explain storage in a concise, factual way for students.\n\nQ: Cost about Meal prep?\nA: Explain cost in a concise, factual way for students.");
});

test("feature-benefit generator creates a pair for every comma or newline item", () => {
  assert.equal(generateAiMicroTool("feature-benefit", { audience: "teams", benefit: "Shared workspace,Fast search\nVersion history" }), "Feature: Shared workspace\nBenefit: Helps teams get a clearer result with less friction.\n\nFeature: Fast search\nBenefit: Helps teams get a clearer result with less friction.\n\nFeature: Version history\nBenefit: Helps teams get a clearer result with less friction.");
});

test("agenda generator numbers topics and preserves the close-out reminder", () => {
  assert.equal(generateAiMicroTool("agenda", { goal: "Choose a launch date", topics: "Progress\nBlockers, Decision" }), "Meeting goal: Choose a launch date\n\nAgenda\n1. Progress\n2. Blockers\n3. Decision\n\nClose with owners, deadlines, and unresolved questions.");
});

test("meeting action items retain blank lines only as separators and number the owners", () => {
  assert.equal(generateAiMicroTool("actions", { notes: "Sam — draft\n\nLee — review" }), "Action items\n1. Sam — draft\n2. Lee — review\n\nBefore sharing, confirm each owner and deadline.");
});

test("product title generator uses the benefit and returns its five title formats", () => {
  assert.equal(generateAiMicroTool("product-title", { topic: "Focus app", benefit: "Plan a calmer day" }), "1. Focus app — Plan a calmer day\n\n2. Focus app: Plan a calmer day\n\n3. The Focus app Starter Guide\n\n4. Focus app Made Simple\n\n5. Focus app Toolkit");
});

test("pros-cons worksheet is explicit that outcomes need verification", () => {
  const output = generateAiMicroTool("pros-cons", { topic: "Pilot a new workflow", option: "Launch now vs wait" });
  assert.match(output, /^Decision worksheet: Launch now vs wait/);
  assert.match(output, /Potential upside: Pilot a new workflow may help achieve the stated goal\./);
  assert.match(output, /What is the smallest useful test\?/);
  assert.match(output, /What would make you stop or change direction\?/);
});

test("shorten helper cuts only after 28 whitespace-separated words and preserves Unicode", () => {
  const words = Array.from({ length: 29 }, (_, index) => `word${index + 1}`).join(" ");
  assert.equal(generateAiMicroTool("shorten", { text: words }), `${Array.from({ length: 28 }, (_, index) => `word${index + 1}`).join(" ")}…`);
  assert.equal(generateAiMicroTool("shorten", { text: "Café déjà vu" }), "Café déjà vu");
});

test("TikTok caption helper honors the selected variant count", () => {
  assert.equal(generateAiMicroTool("tt-caption", { topic: "Quiet mornings", audience: "students", count: "2" }), "1. Quiet mornings made simple. Save this for later.\n\n2. If you're into Quiet mornings, this one is for you.");
});

test("YouTube description uses topic, audience, tone and parsed key points", () => {
  assert.equal(generateAiMicroTool("yt-desc", { topic: "Urban gardening", audience: "beginners", tone: "professional", points: "Tools\nPlanning,Harvest" }), "Urban gardening\n\nIn this video, we break down Urban gardening for beginners in a clear and professional way.\n\nWhat you'll cover:\n• Tools\n• Planning\n• Harvest\n\nIf you found this useful, save it for later and share it with someone working on the same goal.");
});

test("YouTube title helper limits variants and falls back safely for invalid counts", () => {
  assert.equal(generateAiMicroTool("yt-title", { topic: "Learning SQL", audience: "analysts", count: "2" }), "1. Learning SQL: What analysts Should Know\n\n2. How to Get Better Results With Learning SQL");
  assert.equal(generateAiMicroTool("yt-title", { topic: "SQL", audience: "learners", count: "not-a-number" }).split("\n\n").length, 5);
});
