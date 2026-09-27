import { useMemo, useState } from "react";
import type { ToolMeta } from "@/types/tool";

type MetricValue = { label: string; value: string; note?: string };
type Calculation = { metrics: MetricValue[]; formula: string };

const money = (value: number) =>
  Number.isFinite(value)
    ? value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    : "—";
const num = (value: string) => Number(value) || 0;
const opFromId = (id: string) => id.replace(/-(calculator|generator|template|estimator|planner)$/, "");

function Field({
  label,
  value,
  onChange,
  prefix = "",
  step = "0.01",
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  prefix?: string;
  step?: string;
}) {
  return (
    <label className="block space-y-1">
      <span className="text-sm font-medium">{label}</span>
      <span className="flex items-center rounded-lg border bg-background px-3">
        {prefix ? <span className="text-muted-foreground">{prefix}</span> : null}
        <input
          className="w-full bg-transparent px-2 py-2 outline-none"
          type="number"
          step={step}
          value={value}
          onChange={(event) => onChange(event.target.value)}
        />
      </span>
    </label>
  );
}

function TextField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="block space-y-1">
      <span className="text-sm font-medium">{label}</span>
      <input
        className="w-full rounded-lg border bg-background px-3 py-2"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  );
}

function Metric({ label, value, note }: MetricValue) {
  return (
    <div className="rounded-xl border p-4">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-1 text-xl font-semibold">{value}</div>
      {note ? <div className="mt-1 text-xs text-muted-foreground">{note}</div> : null}
    </div>
  );
}

export function BusinessEngine({ tool }: { tool: ToolMeta }) {
  const op = opFromId(tool.id);
  const [a, setA] = useState("1000");
  const [b, setB] = useState("600");
  const [c, setC] = useState("50");
  const [d, setD] = useState("10");
  const [e, setE] = useState("12");
  const [tax, setTax] = useState("0");
  const [discount, setDiscount] = useState("0");
  const [company, setCompany] = useState("Your Business");
  const [client, setClient] = useState("Client");
  const [desc, setDesc] = useState("Professional service");
  const [qty, setQty] = useState("1");
  const [price, setPrice] = useState("100");
  const [invoiceNo, setInvoiceNo] = useState("INV-001");
  const [seed, setSeed] = useState("technology");
  const [audience, setAudience] = useState("customers");
  const [attendees, setAttendees] = useState("Team");
  const [meetingGoal, setMeetingGoal] = useState("Weekly planning");
  const [name, setName] = useState("Alex Morgan");
  const [role, setRole] = useState("Founder");
  const [email, setEmail] = useState("hello@example.com");
  const [copyMessage, setCopyMessage] = useState("");

  const A = num(a);
  const B = num(b);
  const C = num(c);
  const D = num(d);
  const E = num(e);
  const T = num(tax);
  const Disc = num(discount);
  const Q = num(qty);
  const P = num(price);
  const title = op.replaceAll("-", " ").replace(/\b\w/g, (match) => match.toUpperCase());
  const contentMode = [
    "business-name",
    "company-name",
    "brand-name",
    "product-name",
    "slogan",
    "sku",
    "agenda",
    "minutes",
    "email-signature",
  ].includes(op);
  const isDocument = ["invoice", "receipt", "quotation", "estimate", "purchase-order", "payslip"].some(
    (kind) => op.startsWith(kind),
  );

  const calculation = useMemo<Calculation>(() => {
    switch (op) {
      case "roi":
        return {
          metrics: [
            { label: "ROI", value: `${B ? (((A - B) / B) * 100).toFixed(2) : "0.00"}%` },
            { label: "Return", value: money(A - B) },
          ],
          formula: "ROI = (Return − Investment) ÷ Investment × 100",
        };
      case "break-even": {
        const unitMargin = A - C;
        const possible = unitMargin > 0;
        return {
          metrics: [
            { label: "Break-even units", value: possible ? Math.ceil(B / unitMargin).toLocaleString() : "—" },
            { label: "Break-even revenue", value: possible ? money((B / unitMargin) * A) : "—" },
          ],
          formula: "Units = Fixed costs ÷ (Price − Variable cost)",
        };
      }
      case "commission":
        return {
          metrics: [
            { label: "Commission", value: money((A * B) / 100) },
            { label: "After commission", value: money(A - (A * B) / 100) },
          ],
          formula: "Commission = Sales × Rate",
        };
      case "pricing":
      case "markup":
        return {
          metrics: [
            { label: "Selling price", value: money(A * (1 + B / 100)) },
            { label: "Profit", value: money((A * B) / 100) },
          ],
          formula: "Selling price = Cost × (1 + markup)",
        };
      case "cash-flow":
        return {
          metrics: [
            { label: "Net cash flow", value: money(A - B) },
            { label: "Ending cash", value: money(C + A - B) },
          ],
          formula: "Net cash flow = Inflows − Outflows",
        };
      case "salary":
        return {
          metrics: [
            { label: "Gross annual", value: money(A) },
            { label: "Monthly", value: money(A / 12) },
            { label: "Weekly", value: money(A / 52) },
            { label: "Hourly (40h)", value: money(A / 2080) },
          ],
          formula: "Annual salary divided by standard periods",
        };
      case "customer-lifetime-value":
        return {
          metrics: [
            { label: "LTV", value: money(A * B * C) },
            { label: "LTV:CAC", value: D ? `${((A * B * C) / D).toFixed(2)}×` : "—" },
          ],
          formula: "LTV = Average order value × purchase frequency × customer lifespan",
        };
      case "customer-acquisition-cost":
        return {
          metrics: [
            { label: "CAC", value: B ? money(A / B) : "—" },
            { label: "LTV:CAC", value: D ? `${(D / (B ? A / B : 1)).toFixed(2)}×` : "—" },
          ],
          formula: "CAC = Acquisition spend ÷ new customers",
        };
      case "recurring-revenue":
        return {
          metrics: [
            { label: "MRR", value: money(A) },
            { label: "ARR", value: money(A * 12) },
            { label: "Annual growth", value: `${B.toFixed(2)}%` },
          ],
          formula: "ARR = MRR × 12",
        };
      case "expense":
        return {
          metrics: [
            { label: "Total expense", value: money(A + B + C + D + E) },
            { label: "Average", value: money((A + B + C + D + E) / 5) },
          ],
          formula: "Total = sum of expense lines",
        };
      case "inventory":
        return {
          metrics: [
            { label: "Inventory value", value: money(A * B) },
            { label: "Reorder quantity", value: money(C) },
          ],
          formula: "Inventory value = Units × Unit cost",
        };
      case "discount":
        return {
          metrics: [
            { label: "Discount", value: money((A * B) / 100) },
            { label: "Final price", value: money(A - (A * B) / 100) },
          ],
          formula: "Final = Original × (1 − Discount)",
        };
      case "margin":
      case "profit":
        return {
          metrics: [
            { label: "Profit", value: money(A - B) },
            { label: "Margin", value: `${A ? (((A - B) / A) * 100).toFixed(2) : "0.00"}%` },
          ],
          formula: "Margin = Profit ÷ Revenue × 100",
        };
      default:
        return {
          metrics: [
            { label: "Primary value", value: money(A) },
            { label: "Secondary value", value: money(B) },
            { label: "Difference", value: money(A - B) },
          ],
          formula: "Enter the values above to model the business scenario.",
        };
    }
  }, [op, A, B, C, D, E]);

  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopyMessage("Copied");
    } catch {
      setCopyMessage("Clipboard access is unavailable; select and copy the output instead.");
    }
  };

  if (contentMode) {
    const variants =
      op === "sku"
        ? Array.from({ length: 8 }, (_, index) => `${seed.slice(0, 3).toUpperCase()}-${String(index + 1).padStart(3, "0")}`)
        : op === "slogan"
          ? [
              `${seed}: Built for ${audience}.`,
              `Make ${seed} simpler.`,
              `Better ${seed}, without the busywork.`,
              `Built around what ${audience} need.`,
            ]
          : ["business-name", "company-name", "brand-name"].includes(op)
            ? [`${seed} Labs`, `Nova ${seed}`, `${seed} Works`, `Bright ${seed}`, `${seed} Studio`, `Northstar ${seed}`]
            : op === "product-name"
              ? [`${seed} Pro`, `Nova ${seed}`, `${seed} Flow`, `${seed} Plus`, `Smart ${seed}`]
              : op === "agenda"
                ? [
                    "1. Welcome & objectives",
                    `2. ${meetingGoal}`,
                    "3. Progress updates",
                    "4. Decisions & blockers",
                    "5. Owners and next steps",
                    "6. Recap & close",
                  ]
                : op === "minutes"
                  ? [
                      `Meeting: ${meetingGoal}`,
                      `Attendees: ${attendees}`,
                      "Decisions:\n- ",
                      "Action items:\n- Owner — Task — Due date",
                      "Next meeting: ",
                    ]
                  : [`${name} | ${role}`, email, company, "Phone: __________________", "Website: __________________"];
    const output = variants.join("\n");

    return (
      <div className="space-y-5">
        <div className="grid gap-3 md:grid-cols-2">
          {op === "sku" || op === "slogan" || op.includes("name") ? (
            <TextField label="Seed / topic" value={seed} onChange={setSeed} />
          ) : null}
          {op === "slogan" ? <TextField label="Audience / context" value={audience} onChange={setAudience} /> : null}
          {op === "agenda" || op === "minutes" ? (
            <TextField label="Meeting goal" value={meetingGoal} onChange={setMeetingGoal} />
          ) : null}
          {op === "minutes" ? <TextField label="Attendees" value={attendees} onChange={setAttendees} /> : null}
          {op === "email-signature" ? (
            <>
              <TextField label="Name" value={name} onChange={setName} />
              <TextField label="Role" value={role} onChange={setRole} />
              <TextField label="Email" value={email} onChange={setEmail} />
              <TextField label="Company" value={company} onChange={setCompany} />
            </>
          ) : null}
        </div>
        <div className="rounded-2xl border p-5">
          <div className="mb-3 text-sm font-medium">Generated {title}</div>
          <pre className="whitespace-pre-wrap text-sm leading-6">{output}</pre>
        </div>
        <button
          type="button"
          onClick={() => void copy(output)}
          className="rounded-lg bg-primary px-4 py-2 text-primary-foreground"
        >
          Copy output
        </button>
        {copyMessage ? <div className="text-xs text-muted-foreground" role="status">{copyMessage}</div> : null}
        <div className="text-xs text-muted-foreground">
          Generated locally from your inputs. Review names and claims before using them commercially.
        </div>
      </div>
    );
  }

  const print = () => window.print();
  if (isDocument) {
    const subtotal = Q * P;
    const discounted = subtotal * (1 - Disc / 100);
    const total = discounted * (1 + T / 100);
    return (
      <div className="space-y-5">
        <div className="grid gap-3 md:grid-cols-2">
          <TextField label="Business name" value={company} onChange={setCompany} />
          <TextField label="Client / recipient" value={client} onChange={setClient} />
          <TextField label="Document number" value={invoiceNo} onChange={setInvoiceNo} />
          <Field label="Tax %" value={tax} onChange={setTax} />
        </div>
        <TextField label="Description" value={desc} onChange={setDesc} />
        <div className="grid gap-3 md:grid-cols-3">
          <Field label="Quantity" value={qty} onChange={setQty} step="1" />
          <Field label="Unit price" value={price} onChange={setPrice} />
          <Field label="Discount %" value={discount} onChange={setDiscount} />
        </div>
        <div className="rounded-2xl border bg-muted/20 p-6" id="business-document">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-2xl font-bold">{title}</h2>
              <p className="text-muted-foreground">{company}</p>
            </div>
            <div className="text-right text-sm">
              <div>{invoiceNo}</div>
              <div>{new Date().toLocaleDateString()}</div>
            </div>
          </div>
          <div className="my-6"><b>Bill to:</b> {client}</div>
          <div className="grid grid-cols-[1fr_auto_auto] gap-3 border-b pb-2 font-medium">
            <span>Description</span><span>Qty</span><span>Total</span>
          </div>
          <div className="grid grid-cols-[1fr_auto_auto] gap-3 py-3">
            <span>{desc}</span><span>{Q}</span><span>{money(subtotal)}</span>
          </div>
          <div className="ml-auto max-w-xs space-y-2 border-t pt-3 text-sm">
            <div className="flex justify-between"><span>Subtotal</span><b>{money(subtotal)}</b></div>
            <div className="flex justify-between"><span>Discount</span><b>-{money(subtotal * Disc / 100)}</b></div>
            <div className="flex justify-between"><span>Tax</span><b>{money(discounted * T / 100)}</b></div>
            <div className="flex justify-between text-lg"><span>Total</span><b>{money(total)}</b></div>
          </div>
        </div>
        <button type="button" onClick={print} className="rounded-lg bg-primary px-4 py-2 text-primary-foreground">
          Print / Save as PDF
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
        <Field label="Revenue / amount" value={a} onChange={setA} />
        <Field label="Cost / investment" value={b} onChange={setB} />
        <Field label="Rate / variable cost" value={c} onChange={setC} />
        <Field label="Additional value" value={d} onChange={setD} />
        <Field label="Additional value" value={e} onChange={setE} />
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {calculation.metrics.map((metric) => <Metric key={metric.label} {...metric} />)}
      </div>
      <div className="rounded-xl border p-4">
        <div className="text-sm font-medium">Formula / method</div>
        <div className="mt-1 text-sm text-muted-foreground">{calculation.formula}</div>
      </div>
      <div className="text-xs text-muted-foreground">
        Business estimates are illustrative and depend on the assumptions you enter. They are not accounting, tax, legal, or investment advice.
      </div>
    </div>
  );
}
