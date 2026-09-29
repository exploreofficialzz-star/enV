import test from "node:test";
import assert from "node:assert/strict";
import { buildEcommerceOutput, parseEcommerceToolId } from "./ecommerce-engine-utils.ts";

test("ecommerce parser covers every supported workflow", () => {
  for (const family of ["product","order","inventory","shipping","pricing","discount","coupon","sku","barcode","catalog","store","customer","return","profit","margin"]) {
    for (const workflow of ["generator","calculator","planner","template","helper","mockup"] as const) {
      const parsed = parseEcommerceToolId(`${family}-${workflow}`);
      assert.equal(parsed.family, family);
      assert.equal(parsed.workflow, workflow);
      assert.ok(buildEcommerceOutput(family, workflow, { name:"Test", cost:40, price:75, quantity:2, tax:7.5, discount:10, stock:50, dailySales:5, leadTime:7, shipping:8, customer:"A", code:"SKU-001" }).length > 10);
    }
  }
});

test("ecommerce calculators reject invalid values", () => {
  assert.throws(() => buildEcommerceOutput("order", "calculator", { name:"", cost:0, price:10, quantity:1, tax:101, discount:0, stock:1, dailySales:1, leadTime:1, shipping:0, customer:"", code:"" }));
  assert.throws(() => buildEcommerceOutput("product", "calculator", { name:"", cost:-1, price:10, quantity:1, tax:0, discount:0, stock:1, dailySales:1, leadTime:1, shipping:0, customer:"", code:"" }));
});

test("inventory reorder point is calculated from demand and lead time", () => {
  const result = buildEcommerceOutput("inventory", "calculator", { name:"", cost:0, price:10, quantity:1, tax:0, discount:0, stock:20, dailySales:6, leadTime:5, shipping:0, customer:"", code:"" });
  assert.match(result, /Reorder point: 30/);
});


test("ecommerce mockups produce safe, renderable HTML", () => {
  const result = buildEcommerceOutput("product", "mockup", { name:"<Demo>", cost:40, price:75, quantity:2, tax:7.5, discount:10, stock:50, dailySales:5, leadTime:7, shipping:8, customer:"A & B", code:"SKU-001" });
  assert.match(result, /^<!doctype html>/i);
  assert.match(result, /&lt;Demo&gt;/);
  assert.match(result, /viewport/);
  assert.match(result, /SKU-001/);
});

test("ecommerce mockups reject unsupported workflows", () => {
  assert.throws(() => parseEcommerceToolId("product-mockup-extra"));
});
