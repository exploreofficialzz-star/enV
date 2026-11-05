import assert from "node:assert/strict";
import test from "node:test";
import { AI_MICRO_TOOL_OPERATION, generateAiMicroTool, isAiMicroToolId, operationForAiMicroTool } from "./micro-tools.ts";

test("AI micro-tools expose exactly the 13 category routes", () => {
  assert.equal(Object.keys(AI_MICRO_TOOL_OPERATION).length, 13);
  assert.equal(isAiMicroToolId("blog-outline-generator"), true);
  assert.equal(isAiMicroToolId("blog-outline-generator-extra"), false);
  assert.equal(operationForAiMicroTool("youtube-title-helper"), "yt-title");
  assert.equal(operationForAiMicroTool("title-generator"), undefined);
});

test("blog outline uses the audience, goal, editorial angle and supplied evidence", () => {
  const output = generateAiMicroTool("blog-outline", {
    topic: "Urban gardening", audience: "apartment renters", goal: "Help readers grow herbs",
    angle: "Low-cost methods that work in small spaces", keyPoints: "Use containers\nCheck sunlight", cta: "Start with one herb pot",
  });
  assert.match(output, /CONTENT BRIEF/);
  assert.match(output, /Low-cost methods that work in small spaces/);
  assert.match(output, /Use containers\nCheck sunlight/);
  assert.match(output, /Start with one herb pot/);
  assert.match(output, /do not present assumptions as evidence/);
});

test("CTA generator uses the requested action and never invents a benefit", () => {
  const output = generateAiMicroTool("cta", { topic: "Meal prep", audience: "busy students", action: "Download the planner", benefit: "plan meals in one place" });
  assert.match(output, /Download the planner to plan meals in one place/);
  const cautious = generateAiMicroTool("cta", { topic: "Meal prep" });
  assert.match(cautious, /Add a specific, supportable benefit/);
});

test("expand helper uses a supplied context and makes missing facts explicit", () => {
  const output = generateAiMicroTool("expand", { text: "A useful idea", audience: "new growers", context: "Small spaces make growing food feel difficult.", example: "A pot of basil beside a bright window.", nextStep: "Choose one herb to grow." });
  assert.match(output, /WHY IT MATTERS\nSmall spaces make growing food feel difficult/);
  assert.match(output, /WHO IT AFFECTS\nWrite for: new growers/);
  assert.match(output, /A pot of basil beside a bright window/);
  assert.match(output, /Choose one herb to grow/);
  assert.doesNotMatch(output, /explain why this matters/);
  assert.match(generateAiMicroTool("expand", { text: " " }), /Add the text or notes/);
});

test("FAQ uses answers supplied for each exact question and flags missing answers", () => {
  const output = generateAiMicroTool("faq", {
    topic: "Meal prep", audience: "students", points: "How long does it keep?\nCan I freeze it?",
    answers: "How long does it keep? | Refrigerated meals should be used within the safe storage window for their ingredients.",
  });
  assert.match(output, /A: Refrigerated meals should be used within the safe storage window/);
  assert.match(output, /Can I freeze it\?\nA: \[Add a verified answer before publishing\.\]/);
  assert.match(output, /NEEDS AN ANSWER/);
});

test("feature-benefit pairs supplied outcomes with features and flags unsupported claims", () => {
  const output = generateAiMicroTool("feature-benefit", {
    audience: "teams", benefit: "Shared workspace\nFast search", outcomes: "Everyone works from the same project view",
  });
  assert.match(output, /Customer outcome: Everyone works from the same project view/);
  assert.match(output, /Feature: Fast search\nCustomer outcome: \[Add the specific result/);
  assert.match(output, /Evidence to support the claim/);
});

test("agenda time-boxes topics and preserves a closing review", () => {
  const output = generateAiMicroTool("agenda", { goal: "Choose a launch date", duration: "30", topics: "Progress\nDecision" });
  assert.match(output, /Planned duration: 30 minutes/);
  assert.match(output, /1\. Progress — 15 min\n2\. Decision — 15 min/);
  assert.match(output, /Confirm decisions, owners, deadlines/);
});

test("action items parse owner, action, due date and priority without inventing status", () => {
  const output = generateAiMicroTool("actions", { notes: "Sam | Draft launch brief | Friday | High\nLee | Review pricing | Monday | Medium" });
  assert.match(output, /Owner: Sam \| Action: Draft launch brief \| Due: Friday \| Priority: High/);
  assert.match(output, /Status has not been inferred/);
  const incomplete = generateAiMicroTool("actions", { notes: "Finish the landing page" });
  assert.match(incomplete, /\[Assign owner\]/);
  assert.match(incomplete, /\[Add due date\]/);
});

test("product-title generator uses the keyword, benefit and target customer", () => {
  const output = generateAiMicroTool("product-title", { topic: "Focus app", keyword: "Daily planner", benefit: "Plan a calmer day", audience: "remote teams" });
  assert.match(output, /Daily planner — Plan a calmer day/);
  assert.match(output, /The Daily planner guide for remote teams/);
});

test("pros-cons worksheet only treats supplied details as evidence", () => {
  const output = generateAiMicroTool("pros-cons", { option: "Launch now vs wait", upsides: "Reach early users", risks: "Support load may increase", criteria: "Weekly active use" });
  assert.match(output, /UPSIDE TO VERIFY\n• Reach early users/);
  assert.match(output, /RISKS \/ COSTS TO CHECK\n• Support load may increase/);
  assert.match(output, /DECISION CRITERIA\n• Weekly active use/);
  assert.match(output, /Separate measured results from assumptions/);
  assert.match(generateAiMicroTool("pros-cons", { option: "A or B" }), /\[Add known risks, costs or trade-offs\]/);
});

test("shorten helper honors a target and keeps sentence boundaries when available", () => {
  const source = "Our tool helps teams manage projects. It keeps deadlines visible. It stores files securely. It sends weekly reminders.";
  assert.equal(generateAiMicroTool("shorten", { text: source, count: "10" }), "Our tool helps teams manage projects. It keeps deadlines visible…");
  assert.equal(generateAiMicroTool("shorten", { text: "Café déjà vu", count: "60" }), "Café déjà vu");
  assert.match(generateAiMicroTool("shorten", { text: "   " }), /Add the text you want to shorten/);
});

test("TikTok caption helper uses a selected count and supplied hook and CTA", () => {
  const output = generateAiMicroTool("tt-caption", { topic: "Quiet mornings", audience: "students", hook: "One habit to try", cta: "Save this checklist", count: "2" });
  assert.equal(output.split("\n\n").length, 2);
  assert.match(output, /One habit to try: Quiet mornings\. Save this checklist/);
});

test("YouTube description builds optional chapters and links from supplied content", () => {
  const output = generateAiMicroTool("yt-desc", { topic: "Urban gardening", audience: "beginners", tone: "professional", points: "Tools\nPlanning", chapters: "0:00 Introduction\n1:20 Choose a container", links: "https://example.com/guide", cta: "Subscribe for the next lesson" });
  assert.match(output, /WHAT YOU'LL LEARN/);
  assert.match(output, /CHAPTERS\n0:00 Introduction\n1:20 Choose a container/);
  assert.match(output, /LINKS \/ RESOURCES\nhttps:\/\/example.com\/guide/);
  assert.match(output, /Subscribe for the next lesson/);
});

test("YouTube titles are capped at the official 100-character limit", () => {
  const output = generateAiMicroTool("yt-title", { topic: "Learning SQL", audience: "analysts", angle: "a practical guide to advanced reporting", keyword: "SQL reporting", count: "8" });
  const titles = output.split("\n\n").map((line) => line.replace(/^\d+\.\s/u, ""));
  assert.equal(titles.length, 8);
  assert.ok(titles.every((title) => title.length <= 100));
});
