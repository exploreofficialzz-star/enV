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


test("inventory reorder point includes separately configured safety stock", () => {
  const result = buildEcommerceOutput("inventory", "calculator", {
    name:"", cost:0, price:10, quantity:1, tax:0, discount:0, stock:20, dailySales:6, leadTime:5, shipping:0, customer:"", code:"",
    safetyStock:4,
  });
  assert.match(result, /Reorder point: 34/);
  assert.match(result, /Safety stock: 4/);
});

test("profit calculator accounts for packaging, payment fees and advertising", () => {
  const result = buildEcommerceOutput("profit", "calculator", {
    name:"", cost:40, price:100, quantity:2, tax:0, discount:0, stock:0, dailySales:0, leadTime:0, shipping:0, customer:"", code:"",
    packaging:2, feePercent:3, advertising:10,
  });
  assert.match(result, /Payment \/ platform fees: 6/);
  assert.match(result, /Contribution profit: 100/);
  assert.match(result, /Contribution margin: 50/);
});

test("pricing calculator derives break-even and target-margin prices", () => {
  const result = buildEcommerceOutput("pricing", "calculator", {
    name:"", cost:40, price:75, quantity:1, tax:0, discount:0, stock:0, dailySales:0, leadTime:0, shipping:0, customer:"", code:"",
    packaging:2, feePercent:3, targetMargin:30,
  });
  assert.match(result, /Break-even selling price:/);
  assert.match(result, /Target selling price:/);
  assert.match(result, /Target margin: 30/);
});

test("discount calculator warns when fees and packaging turn a promotion into a loss", () => {
  const result = buildEcommerceOutput("discount", "calculator", {
    name:"", cost:80, price:100, quantity:1, tax:0, discount:20, stock:0, dailySales:0, leadTime:0, shipping:0, customer:"", code:"",
    packaging:5, feePercent:5,
  });
  assert.match(result, /creates a unit loss/);
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
