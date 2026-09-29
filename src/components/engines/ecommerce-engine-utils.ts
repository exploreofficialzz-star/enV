export type EcommerceWorkflow = "generator" | "calculator" | "planner" | "template" | "helper" | "mockup";

const FAMILIES = new Set([
  "product", "order", "inventory", "shipping", "pricing", "discount", "coupon", "sku", "barcode", "catalog", "store", "customer", "return", "profit", "margin",
]);
const WORKFLOWS = new Set<EcommerceWorkflow>(["generator", "calculator", "planner", "template", "helper", "mockup"]);

export function parseEcommerceToolId(toolId: string): { family: string; workflow: EcommerceWorkflow } {
  const match = toolId.match(/^(product|order|inventory|shipping|pricing|discount|coupon|sku|barcode|catalog|store|customer|return|profit|margin)-(generator|calculator|planner|template|helper|mockup)$/);
  if (!match || !FAMILIES.has(match[1]) || !WORKFLOWS.has(match[2] as EcommerceWorkflow)) throw new Error(`Unsupported e-commerce tool: ${toolId}`);
  return { family: match[1], workflow: match[2] as EcommerceWorkflow };
}

const title = (value: string) => value.replace(/-/g, " ").replace(/\b\w/g, (m) => m.toUpperCase());
const money = (n: number) => n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const pct = (n: number) => `${n.toFixed(2)}%`;

export function buildEcommerceOutput(family: string, workflow: EcommerceWorkflow, input: {
  name: string; cost: number; price: number; quantity: number; tax: number; discount: number; stock: number; dailySales: number; leadTime: number; shipping: number; customer: string; code: string;
}): string {
  if (!FAMILIES.has(family) || !WORKFLOWS.has(workflow)) throw new Error("Unsupported e-commerce operation.");
  if (![input.cost, input.price, input.quantity, input.tax, input.discount, input.stock, input.dailySales, input.leadTime, input.shipping].every(Number.isFinite)) throw new Error("Enter valid numeric values.");
  if (input.quantity < 0 || input.stock < 0 || input.dailySales < 0 || input.leadTime < 0 || input.shipping < 0 || input.cost < 0 || input.price < 0) throw new Error("Numeric values cannot be negative.");
  if (input.tax < 0 || input.discount < 0 || input.tax > 100 || input.discount > 100) throw new Error("Tax and discount must be between 0 and 100.");

  const label = title(family);
  if (workflow === "calculator") {
    const subtotal = input.price * input.quantity;
    const discountAmount = subtotal * input.discount / 100;
    const taxed = subtotal - discountAmount;
    const taxAmount = taxed * input.tax / 100;
    const total = taxed + taxAmount + input.shipping;
    const profit = (input.price - input.cost) * input.quantity - discountAmount;
    const margin = input.price > 0 ? ((input.price - input.cost) / input.price) * 100 : 0;
    const reorderPoint = input.dailySales * input.leadTime;
    const roi = input.cost > 0 ? ((input.price - input.cost) / input.cost) * 100 : 0;
    const rows = family === "order" ? [`Subtotal: ${money(subtotal)}`, `Discount: ${money(discountAmount)}`, `Tax: ${money(taxAmount)}`, `Shipping: ${money(input.shipping)}`, `Order total: ${money(total)}`]
      : family === "inventory" ? [`Current stock: ${input.stock}`, `Daily sales: ${input.dailySales}`, `Lead time: ${input.leadTime} days`, `Reorder point: ${Math.ceil(reorderPoint)}`]
      : family === "discount" || family === "coupon" ? [`Original price: ${money(input.price)}`, `Discount: ${pct(input.discount)}`, `Savings: ${money(input.price * input.discount / 100)}`, `Sale price: ${money(input.price * (1 - input.discount / 100))}`]
      : family === "profit" || family === "margin" ? [`Unit profit: ${money(input.price - input.cost)}`, `Total profit: ${money(profit)}`, `Gross margin: ${pct(margin)}`, `ROI on cost: ${pct(roi)}`]
      : family === "shipping" ? [`Item value: ${money(subtotal)}`, `Shipping: ${money(input.shipping)}`, `Delivered total: ${money(subtotal + input.shipping)}`]
      : [`Cost: ${money(input.cost)}`, `Price: ${money(input.price)}`, `Quantity: ${input.quantity}`, `Unit profit: ${money(input.price - input.cost)}`, `Margin: ${pct(margin)}`, `ROI: ${pct(roi)}`];
    return `${label} Calculator\n\n${rows.join("\n")}`;
  }

  if (workflow === "mockup") {
    const safe = (value: string) => value.replace(/[&<>"']/g, (ch) => ({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;", "'":"&#39;"}[ch] || ch));
    const displayName = safe(input.name.trim() || label);
    const ref = safe(input.code.trim() || `${family.toUpperCase()}-001`);
    const customer = safe(input.customer.trim() || "Customer");
    const accent = family === "discount" || family === "coupon" ? "Save today" : family === "return" ? "Easy returns" : family === "shipping" ? "Fast fulfillment" : "Shop now";
    const details = family === "inventory" ? `<p>In stock: <strong>${input.stock}</strong> · Daily sales: <strong>${input.dailySales}</strong></p>`
      : family === "order" || family === "return" ? `<p>Reference: <strong>${ref}</strong> · Customer: <strong>${customer}</strong></p>`
      : `<p>Reference: <strong>${ref}</strong> · ${accent}</p>`;
    const price = money(input.price * (1 - input.discount / 100));
    return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${displayName} Mockup</title><style>
body{margin:0;font-family:system-ui,-apple-system,sans-serif;background:#f4f4f5;color:#18181b;padding:24px}.card{max-width:760px;margin:auto;background:white;border:1px solid #e4e4e7;border-radius:24px;overflow:hidden;box-shadow:0 12px 35px #0001}.hero{padding:40px;background:linear-gradient(135deg,#18181b,#3f3f46);color:white}.badge{display:inline-block;padding:6px 10px;border-radius:999px;background:#ffffff22;font-size:12px}.body{padding:32px}.price{font-size:32px;font-weight:800;margin:16px 0}.cta{display:inline-block;padding:12px 18px;border-radius:12px;background:#18181b;color:white;text-decoration:none}.meta{color:#52525b;line-height:1.7}</style></head><body><article class="card"><section class="hero"><span class="badge">${safe(label)} Mockup</span><h1>${displayName}</h1><p>${safe(accent)}</p></section><section class="body"><div class="price">${price}</div><div class="meta">${details}<p>Quantity: <strong>${input.quantity}</strong> · Shipping: <strong>${money(input.shipping)}</strong></p></div><a class="cta" href="#">Continue</a></section></article></body></html>`;
  }

  if (workflow === "generator") {
    const name = input.name.trim() || label;
    const code = input.code.trim() || `${family.toUpperCase()}-${Date.now().toString(36).toUpperCase()}`;
    if (family === "sku" || family === "barcode") return `${label} Generator\n\nName: ${name}\nCode: ${code}\nFormat: ${family === "barcode" ? "CODE-128 compatible value" : "Human-readable SKU"}`;
    if (family === "product") return `Product Record\n\nName: ${name}\nSKU: ${code}\nPrice: ${money(input.price)}\nCost: ${money(input.cost)}\nStock: ${input.stock}\nCustomer-facing summary: ${name} — quality-focused product with clear pricing and fulfillment details.`;
    return `${label} Generator\n\n${name}\nReference: ${code}\nQuantity: ${input.quantity}\nPrice: ${money(input.price)}\nCustomer: ${input.customer || "Customer"}`;
  }

  if (workflow === "planner") {
    const steps = family === "inventory" ? ["Review current stock", "Estimate average daily sales", "Set reorder point", "Select reorder quantity", "Schedule stock review"]
      : family === "shipping" ? ["Confirm order contents", "Package safely", "Choose service", "Record tracking reference", "Confirm delivery"]
      : family === "return" ? ["Receive return request", "Verify order and eligibility", "Inspect returned item", "Approve refund or replacement", "Close the case"]
      : family === "store" ? ["Define product catalog", "Set pricing and policies", "Configure fulfillment", "Test checkout flow", "Review customer support"]
      : ["Define objective", "Gather product/order data", "Choose assumptions", "Execute the workflow", "Review results and update the record"];
    return `${label} Plan\n\n${steps.map((step, i) => `${i + 1}. ${step}`).join("\n")}`;
  }

  if (workflow === "template") {
    return `${label} Template\n\nName: ${input.name || ""}\nReference: ${input.code || ""}\nQuantity: ${input.quantity}\nPrice: ${money(input.price)}\nCost: ${money(input.cost)}\nStatus: [pending / active / complete]\nNotes:\n\nNext action:`;
  }

  const tips: Record<string, string[]> = {
    product: ["Use a clear product name.", "Show price, availability, and key benefits.", "Keep SKU and inventory identifiers consistent."],
    order: ["Confirm quantities before fulfillment.", "Apply discounts before tax when your policy requires it.", "Keep a unique order reference."],
    inventory: ["Track daily sales and lead time.", "Set a reorder point before stock reaches zero.", "Review slow-moving inventory regularly."],
    shipping: ["Confirm destination and package details.", "Record tracking information.", "Communicate delivery expectations clearly."],
    pricing: ["Separate cost, markup, and margin.", "Account for shipping and payment costs.", "Review prices as costs change."],
    discount: ["State the original and discounted price clearly.", "Check that discounts do not create an unintended loss.", "Set an expiration policy where appropriate."],
    coupon: ["Define eligibility and expiry.", "Prevent stacking unless intended.", "Test the final checkout total."],
    sku: ["Use a consistent SKU pattern.", "Keep SKUs unique.", "Avoid embedding volatile information in identifiers."],
    barcode: ["Use a supported barcode value format.", "Keep identifiers unique.", "Verify the generated code with a scanner before production use."],
    catalog: ["Use consistent product attributes.", "Keep prices and stock synchronized.", "Use descriptive product metadata."],
    store: ["Test navigation and checkout.", "Make policies easy to find.", "Provide clear contact and fulfillment information."],
    customer: ["Keep customer data minimal and accurate.", "Document support interactions.", "Respect applicable privacy requirements."],
    return: ["Publish eligibility rules clearly.", "Record the original order.", "Document refund or replacement decisions."],
    profit: ["Separate revenue from profit.", "Include variable costs in your analysis.", "Review profitability by product or order."],
    margin: ["Margin is based on selling price; markup is based on cost.", "Track gross margin consistently.", "Include relevant costs before making pricing decisions."],
  };
  return `${label} Helper\n\n${(tips[family] || tips.product).map((x) => `• ${x}`).join("\n")}`;
}
