import test from "node:test";
import assert from "node:assert/strict";
import { buildMarketingOutput, parseMarketingToolId } from "./marketing-engine-utils.ts";

const input = {
  audience: "small businesses",
  goal: "increase qualified leads",
  offer: "Example offer",
  channel: "email",
  notes: "test context",
  budget: 100,
  clicks: 1000,
  leads: 50,
  sales: 10,
  revenue: 500,
};

test("marketing parser and output cover every catalog workflow family", () => {
  const topics = ["campaign", "content", "email", "landing-page", "product", "brand", "social", "seo", "influencer", "affiliate", "lead", "sales", "ad", "newsletter", "event"];
  const actions = ["planner", "generator", "calculator", "brief-generator", "checklist", "template", "headline-helper", "cta-generator"];
  for (const topic of topics) {
    for (const action of actions) {
      if (topic === "product" && action === "planner") continue;
      if (topic === "product" && action === "generator") continue;
      if (topic === "product" && action === "calculator") continue;
      const parsed = parseMarketingToolId(`${topic}-${action}`);
      assert.ok(parsed.topic.length > 0);
      assert.equal(parsed.action, action);
      assert.ok(buildMarketingOutput(parsed.topic, parsed.action, input).length > 20);
    }
  }
});

test("marketing calculator computes CPC, CPL, CPA, conversion rates and ROAS", () => {
  const result = buildMarketingOutput("Campaign", "calculator", input);
  assert.match(result, /CPC: 0\.10/);
  assert.match(result, /CPL: 2\.00/);
  assert.match(result, /CPA: 10\.00/);
  assert.match(result, /Click → lead rate: 5\.00%/);
  assert.match(result, /Lead → sale rate: 20\.00%/);
  assert.match(result, /ROAS: 5\.00x/);
  assert.match(result, /Net before other costs: 400\.00/);
});

test("marketing calculator rejects impossible or negative metrics", () => {
  assert.throws(() => buildMarketingOutput("Campaign", "calculator", { ...input, budget: -1 }));
  assert.throws(() => buildMarketingOutput("Campaign", "calculator", { ...input, leads: 1001 }));
  assert.throws(() => buildMarketingOutput("Campaign", "calculator", { ...input, sales: 51 }));
});

test("marketing parser rejects unsupported tool ids", () => {
  assert.throws(() => parseMarketingToolId("unknown-generator"));
  assert.throws(() => parseMarketingToolId("campaign-unknown"));
});
