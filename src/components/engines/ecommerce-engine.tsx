import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CopyButton } from "@/components/tools/copy-button";
import { ErrorBanner } from "@/components/tools/error-banner";
import { downloadText } from "@/lib/utils";
import { buildEcommerceOutput, parseEcommerceToolId } from "./ecommerce-engine-utils";

export function EcommerceEngine({ toolId }: { toolId: string }) {
  const parsed = useMemo(() => { try { return { value: parseEcommerceToolId(toolId), error: null }; } catch (e) { return { value: null, error: e instanceof Error ? e.message : "Unsupported e-commerce tool." }; } }, [toolId]);
  const [name, setName] = useState("Sample Product"); const [cost, setCost] = useState("40"); const [price, setPrice] = useState("75");
  const [quantity, setQuantity] = useState("1"); const [tax, setTax] = useState("0"); const [discount, setDiscount] = useState("0");
  const [stock, setStock] = useState("50"); const [dailySales, setDailySales] = useState("5"); const [leadTime, setLeadTime] = useState("7");
  const [shipping, setShipping] = useState("0"); const [customer, setCustomer] = useState("Customer"); const [code, setCode] = useState("SKU-001");
  const values = { name, cost: Number(cost), price: Number(price), quantity: Number(quantity), tax: Number(tax), discount: Number(discount), stock: Number(stock), dailySales: Number(dailySales), leadTime: Number(leadTime), shipping: Number(shipping), customer, code };
  const result = useMemo(() => { if (!parsed.value) return ""; try { return buildEcommerceOutput(parsed.value.family, parsed.value.workflow, values); } catch { return ""; } }, [parsed.value, name, cost, price, quantity, tax, discount, stock, dailySales, leadTime, shipping, customer, code]);
  const error = useMemo(() => { if (!parsed.value) return parsed.error; try { buildEcommerceOutput(parsed.value.family, parsed.value.workflow, values); return null; } catch (e) { return e instanceof Error ? e.message : "Invalid e-commerce inputs."; } }, [parsed.value, parsed.error, name, cost, price, quantity, tax, discount, stock, dailySales, leadTime, shipping, customer, code]);
  const reset = () => { setName("Sample Product"); setCost("40"); setPrice("75"); setQuantity("1"); setTax("0"); setDiscount("0"); setStock("50"); setDailySales("5"); setLeadTime("7"); setShipping("0"); setCustomer("Customer"); setCode("SKU-001"); };
  const isMockup = parsed.value?.workflow === "mockup";
  return <div className="space-y-5"><p className="text-sm text-muted-foreground">Run this e-commerce workflow locally. No store account or external service is required.</p>
    <div className="grid gap-4 sm:grid-cols-2">
      <div><Label htmlFor="ec-name">Name</Label><Input id="ec-name" value={name} onChange={e=>setName(e.target.value)} /></div><div><Label htmlFor="ec-code">Reference / SKU</Label><Input id="ec-code" value={code} onChange={e=>setCode(e.target.value)} /></div>
      <div><Label htmlFor="ec-cost">Cost</Label><Input id="ec-cost" type="number" min="0" value={cost} onChange={e=>setCost(e.target.value)} /></div><div><Label htmlFor="ec-price">Price</Label><Input id="ec-price" type="number" min="0" value={price} onChange={e=>setPrice(e.target.value)} /></div>
      <div><Label htmlFor="ec-qty">Quantity</Label><Input id="ec-qty" type="number" min="0" value={quantity} onChange={e=>setQuantity(e.target.value)} /></div><div><Label htmlFor="ec-tax">Tax %</Label><Input id="ec-tax" type="number" min="0" max="100" value={tax} onChange={e=>setTax(e.target.value)} /></div>
      <div><Label htmlFor="ec-discount">Discount %</Label><Input id="ec-discount" type="number" min="0" max="100" value={discount} onChange={e=>setDiscount(e.target.value)} /></div><div><Label htmlFor="ec-shipping">Shipping</Label><Input id="ec-shipping" type="number" min="0" value={shipping} onChange={e=>setShipping(e.target.value)} /></div>
      <div><Label htmlFor="ec-stock">Stock</Label><Input id="ec-stock" type="number" min="0" value={stock} onChange={e=>setStock(e.target.value)} /></div><div><Label htmlFor="ec-sales">Daily sales</Label><Input id="ec-sales" type="number" min="0" value={dailySales} onChange={e=>setDailySales(e.target.value)} /></div>
      <div><Label htmlFor="ec-lead">Lead time (days)</Label><Input id="ec-lead" type="number" min="0" value={leadTime} onChange={e=>setLeadTime(e.target.value)} /></div><div><Label htmlFor="ec-customer">Customer</Label><Input id="ec-customer" value={customer} onChange={e=>setCustomer(e.target.value)} /></div>
    </div><ErrorBanner message={error} /><div className="flex flex-wrap gap-2"><CopyButton text={result}/><Button type="button" variant="outline" size="sm" disabled={!result} onClick={()=>downloadText(result,`env-${toolId}.txt`)}>Download</Button><Button type="button" variant="ghost" size="sm" onClick={reset}>Reset</Button></div>{result ? (isMockup ? <div className="space-y-3"><iframe title={`${toolId} preview`} sandbox="" srcDoc={result} className="h-[32rem] w-full rounded-xl border bg-white" /><details><summary className="cursor-pointer text-sm font-medium">View generated HTML</summary><pre className="mt-2 max-h-[24rem] overflow-auto whitespace-pre-wrap rounded-xl bg-ink p-4 font-mono text-xs leading-5 text-bg">{result}</pre></details></div> : <pre className="max-h-[34rem] overflow-auto whitespace-pre-wrap rounded-xl bg-ink p-4 font-mono text-xs leading-5 text-bg">{result}</pre>) : null}</div>;
}
