import assert from "node:assert/strict";
import { test } from "node:test";
import { tools } from "@/data/catalog";
import { BUSINESS_STUDIO_DEFAULT_MODES, BUSINESS_STUDIO_ENTRY_ANCHORS, businessStudioAnchorSlug, businessStudioDefaultMode, businessStudioForOperation, businessStudioModeAllowed, businessStudioRouteForTool } from "./business-studios-catalog.ts";

test("every legacy Business catalog URL maps to a Studio and existing mode", () => {
  const businessTools = tools.filter((tool) => tool.category === "business");
  assert.equal(businessTools.length, 104);
  const routes = businessTools.map(businessStudioRouteForTool);
  assert.ok(routes.every(Boolean), "all business tools must map without deletion or dead mode");
  for (const [index, tool] of businessTools.entries()) {
    const route = routes[index]!;
    assert.ok(route.href.startsWith(`/tools/business/${route.studio}-studio?mode=`));
    assert.equal(businessStudioForOperation(route.mode), route.studio, tool.slug);
    assert.ok(businessStudioModeAllowed(`${route.studio}-studio`, route.mode), tool.slug);
  }
});

test("Studio anchors and default modes are stable", () => {
  assert.deepEqual(BUSINESS_STUDIO_ENTRY_ANCHORS, { document: "invoice-generator", finance: "break-even-estimator", naming: "business-name-generator", ops: "meeting-agenda-generator" });
  assert.deepEqual(BUSINESS_STUDIO_DEFAULT_MODES, { document: "invoice", finance: "break-even", naming: "business-name", ops: "meeting-agenda" });
  for (const [slug, anchor] of Object.entries({ "document-studio": "invoice-generator", "finance-studio": "break-even-estimator", "naming-studio": "business-name-generator", "ops-studio": "meeting-agenda-generator" })) assert.equal(businessStudioAnchorSlug(slug), anchor);
  assert.equal(businessStudioDefaultMode("finance-studio"), "break-even");
});

test("required document, finance, naming and ops slugs remain in the correct Studio", () => {
  const bySlug = new Map(tools.map((tool) => [tool.slug, tool]));
  const expected: Record<string, [string, string]> = {
    "invoice-generator": ["document", "invoice"],
    "receipt-generator": ["document", "receipt"],
    "quotation-generator": ["document", "quotation"],
    "estimate-generator": ["document", "estimate"],
    "purchase-order-generator": ["document", "purchase-order"],
    "commission-calculator": ["finance", "commission"],
    "customer-acquisition-cost-calculator": ["finance", "customer-acquisition-cost"],
    "customer-lifetime-value-calculator": ["finance", "customer-lifetime-value"],
    "business-name-generator": ["naming", "business-name"],
    "sku-generator": ["naming", "sku"],
    "slogan-generator": ["naming", "slogan"],
    "meeting-agenda-generator": ["ops", "meeting-agenda"],
    "meeting-minutes-generator": ["ops", "meeting-minutes"],
    "email-signature-generator": ["ops", "email-signature"],
    "payslip-calculator": ["ops", "payslip"],
  };
  for (const [slug, [studio, mode]] of Object.entries(expected)) {
    const tool = bySlug.get(slug);
    assert.ok(tool, `legacy tool still exists: ${slug}`);
    const route = businessStudioRouteForTool(tool);
    assert.equal(route?.studio, studio, slug);
    assert.equal(route?.mode, mode, slug);
  }
});
