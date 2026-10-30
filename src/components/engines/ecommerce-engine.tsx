import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CopyButton } from "@/components/tools/copy-button";
import { ErrorBanner } from "@/components/tools/error-banner";
import { downloadText } from "@/lib/utils";
import { buildEcommerceOutput, parseEcommerceToolId } from "./ecommerce-engine-utils";

export function EcommerceEngine({ toolId }: { toolId: string }) {
  const parsed = useMemo(() => {
    try { return { value: parseEcommerceToolId(toolId), error: null }; }
    catch (error) { return { value: null, error: error instanceof Error ? error.message : "Unsupported E-commerce tool." }; }
  }, [toolId]);

  const [name, setName] = useState("Sample Product");
  const [code, setCode] = useState("SKU-001");
  const [cost, setCost] = useState("40");
  const [price, setPrice] = useState("75");
  const [quantity, setQuantity] = useState("1");
  const [tax, setTax] = useState("0");
  const [discount, setDiscount] = useState("0");
  const [stock, setStock] = useState("50");
  const [dailySales, setDailySales] = useState("5");
  const [leadTime, setLeadTime] = useState("7");
  const [shipping, setShipping] = useState("0");
  const [customer, setCustomer] = useState("Customer");
  const [packaging, setPackaging] = useState("0");
  const [feePercent, setFeePercent] = useState("0");
  const [advertising, setAdvertising] = useState("0");
  const [targetMargin, setTargetMargin] = useState("30");
  const [safetyStock, setSafetyStock] = useState("0");
  const [weight, setWeight] = useState("1");
  const [distance, setDistance] = useState("10");

  const values = {
    name, code, customer,
    cost: Number(cost), price: Number(price), quantity: Number(quantity), tax: Number(tax),
    discount: Number(discount), stock: Number(stock), dailySales: Number(dailySales),
    leadTime: Number(leadTime), shipping: Number(shipping), packaging: Number(packaging),
    feePercent: Number(feePercent), advertising: Number(advertising), targetMargin: Number(targetMargin),
    safetyStock: Number(safetyStock), weight: Number(weight), distance: Number(distance),
  };

  const dependencies = [
    parsed.value, parsed.error, name, code, customer, cost, price, quantity, tax, discount,
    stock, dailySales, leadTime, shipping, packaging, feePercent, advertising, targetMargin,
    safetyStock, weight, distance,
  ];
  const result = useMemo(() => {
    if (!parsed.value) return "";
    try { return buildEcommerceOutput(parsed.value.family, parsed.value.workflow, values); }
    catch { return ""; }
  }, dependencies);
  const error = useMemo(() => {
    if (!parsed.value) return parsed.error;
    try { buildEcommerceOutput(parsed.value.family, parsed.value.workflow, values); return null; }
    catch (cause) { return cause instanceof Error ? cause.message : "Invalid E-commerce inputs."; }
  }, dependencies);

  const reset = () => {
    setName("Sample Product"); setCode("SKU-001"); setCustomer("Customer");
    setCost("40"); setPrice("75"); setQuantity("1"); setTax("0"); setDiscount("0");
    setStock("50"); setDailySales("5"); setLeadTime("7"); setShipping("0");
    setPackaging("0"); setFeePercent("0"); setAdvertising("0"); setTargetMargin("30");
    setSafetyStock("0"); setWeight("1"); setDistance("10");
  };
  const isMockup = parsed.value?.workflow === "mockup";

  const field = (id: string, label: string, value: string, setValue: (next: string) => void, max?: number) => (
    <div>
      <Label htmlFor={id}>{label}</Label>
      <Input id={id} type="number" min="0" max={max} value={value} onChange={(event) => setValue(event.target.value)} />
    </div>
  );

  return (
    <div className="space-y-5">
      <p className="text-sm text-muted-foreground">Run this E-commerce workflow locally. No store or carrier account is connected to this calculation.</p>
      <div className="grid gap-4 sm:grid-cols-2">
        <div><Label htmlFor="ec-name">Name</Label><Input id="ec-name" value={name} onChange={(event) => setName(event.target.value)} /></div>
        <div><Label htmlFor="ec-code">Reference / SKU</Label><Input id="ec-code" value={code} onChange={(event) => setCode(event.target.value)} /></div>
        {field("ec-cost", "Unit cost", cost, setCost)}
        {field("ec-price", "Selling price", price, setPrice)}
        {field("ec-qty", "Quantity", quantity, setQuantity)}
        {field("ec-tax", "Tax %", tax, setTax, 100)}
        {field("ec-discount", "Discount %", discount, setDiscount, 100)}
        {field("ec-shipping", "Shipping charged", shipping, setShipping)}
        {field("ec-stock", "Current stock", stock, setStock)}
        {field("ec-sales", "Average daily sales", dailySales, setDailySales)}
        {field("ec-lead", "Supplier lead time (days)", leadTime, setLeadTime)}
        <div><Label htmlFor="ec-customer">Customer / supplier</Label><Input id="ec-customer" value={customer} onChange={(event) => setCustomer(event.target.value)} /></div>
      </div>

      <details className="rounded-lg border border-border p-3">
        <summary className="cursor-pointer text-sm font-medium">Advanced costs, stock and shipping</summary>
        <p className="mt-2 text-xs text-muted-foreground">Use these fields for contribution profit, safer reorder points and shipping estimates. Carrier rates are not fetched here.</p>
        <div className="mt-3 grid gap-4 sm:grid-cols-2">
          {field("ec-packaging", "Packaging / handling per unit", packaging, setPackaging)}
          {field("ec-fee", "Payment / platform fee %", feePercent, setFeePercent, 100)}
          {field("ec-advertising", "Advertising cost for this calculation", advertising, setAdvertising)}
          {field("ec-target-margin", "Target contribution margin %", targetMargin, setTargetMargin, 100)}
          {field("ec-safety-stock", "Safety stock (units)", safetyStock, setSafetyStock)}
          {field("ec-weight", "Package weight (kg)", weight, setWeight)}
          {field("ec-distance", "Delivery distance (km)", distance, setDistance)}
        </div>
      </details>

      <ErrorBanner message={error} />
      <div className="flex flex-wrap gap-2">
        <CopyButton text={result} />
        <Button type="button" variant="outline" size="sm" disabled={!result} onClick={() => downloadText(result, `env-${toolId}.txt`)}>Download</Button>
        <Button type="button" variant="ghost" size="sm" onClick={reset}>Reset</Button>
      </div>
      {result ? (isMockup
        ? <div className="space-y-3"><iframe title={`${toolId} preview`} sandbox="" srcDoc={result} className="h-[32rem] w-full rounded-xl border bg-white" /><details><summary className="cursor-pointer text-sm font-medium">View generated HTML</summary><pre className="mt-2 max-h-[24rem] overflow-auto whitespace-pre-wrap rounded-xl bg-ink p-4 font-mono text-xs leading-5 text-bg">{result}</pre></details></div>
        : <pre className="max-h-[34rem] overflow-auto whitespace-pre-wrap rounded-xl bg-ink p-4 font-mono text-xs leading-5 text-bg">{result}</pre>) : null}
    </div>
  );
}
