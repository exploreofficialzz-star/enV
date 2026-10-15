import { useMemo, useState } from "react";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import type { ToolMeta } from "@/types/tool";
import { calculateBreakEven, calculateCashFlow, calculateCommission, calculateCustomerAcquisition, calculateDiscount, calculateDocumentTotals, calculateExpenses, calculateInventory, calculateLifetimeValue, calculatePricing, calculateProfitMargin, calculateRecurringRevenue, calculateRoi, calculateSalary, classifyLtvCac, generateBusinessNames, generateSlogans, generateSkus, type BusinessNameStyle } from "@/lib/engines/business-studios";

type MetricValue = { label: string; value: string; note?: string };
type Calculation = { metrics: MetricValue[]; formula: string };

const money = (value: number) =>
  Number.isFinite(value)
    ? value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    : "—";
const num = (value: string) => { const parsed = Number(value); return Number.isFinite(parsed) ? parsed : 0; };
const htmlEscapes: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "\'": "&#39;" };
const escapeHtml = (value: string) => value.replace(/[&<>"']/g, (character) => htmlEscapes[character] ?? character);
const safeHttpUrl = (value: string) => { try { const parsed = new URL(value); return parsed.protocol === "http:" || parsed.protocol === "https:" ? parsed.href : ""; } catch { return ""; } };
const opFromId = (id: string) => id.replace(/-(calculator|generator|template|estimator|planner)$/, "");

/** Generate a real, locally-created PDF; no invoice content is uploaded. */
async function downloadBusinessPdf(title: string, content: string[], filename: string, logoDataUrl = "") {
  const pdf = await PDFDocument.create();
  pdf.setTitle(title);
  pdf.setCreator("enV Business Studios");
  pdf.setSubject("Locally generated business document");
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const pageSize: [number, number] = [595.28, 841.89];
  const margin = 42;
  const fontSize = 10;
  const lineHeight = 15;
  let page = pdf.addPage(pageSize);
  let y = pageSize[1] - margin;
  const addPage = () => { page = pdf.addPage(pageSize); y = pageSize[1] - margin; };
  const drawLine = (line: string, isHeading = false) => {
    const activeFont = isHeading ? bold : font;
    const size = isHeading ? 15 : fontSize;
    // Standard PDF fonts use WinAnsi; replace unsupported typographic punctuation safely.
    const safe = line.replace(/[–—−]/g, "-").replace(/[×]/g, "x").replace(/[•·]/g, "-").replace(/[’‘]/g, "'").replace(/[“”]/g, '"').replace(/[^\x09\x0A\x0D\x20-\xFF]/g, "?");
    const words = safe.split(/\s+/);
    let current = "";
    const lines: string[] = [];
    for (const word of words) {
      const candidate = current ? `${current} ${word}` : word;
      if (activeFont.widthOfTextAtSize(candidate, size) > pageSize[0] - margin * 2 && current) { lines.push(current); current = word; }
      else current = candidate;
    }
    if (current || !lines.length) lines.push(current);
    for (const wrapped of lines) {
      if (y < margin + lineHeight) addPage();
      page.drawText(wrapped, { x: margin, y, size, font: activeFont, color: rgb(0.12, 0.14, 0.18) });
      y -= isHeading ? lineHeight + 5 : lineHeight;
    }
  };
  if (logoDataUrl.startsWith("data:image/png;base64,")) {
    try { const image = await pdf.embedPng(Uint8Array.from(atob(logoDataUrl.split(",")[1]), c => c.charCodeAt(0))); const scale = Math.min(110 / image.width, 42 / image.height, 1); page.drawImage(image, { x: margin, y: y - image.height * scale, width: image.width * scale, height: image.height * scale }); y -= image.height * scale + 10; } catch { /* invalid optional logo should not block document export */ }
  } else if (logoDataUrl.startsWith("data:image/jpeg;base64,") || logoDataUrl.startsWith("data:image/jpg;base64,")) {
    try { const image = await pdf.embedJpg(Uint8Array.from(atob(logoDataUrl.split(",")[1]), c => c.charCodeAt(0))); const scale = Math.min(110 / image.width, 42 / image.height, 1); page.drawImage(image, { x: margin, y: y - image.height * scale, width: image.width * scale, height: image.height * scale }); y -= image.height * scale + 10; } catch { /* invalid optional logo should not block document export */ }
  }
  content.forEach((line, index) => drawLine(line, index === 0));
  const bytes = await pdf.save();
  const blob = new Blob([bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer], { type: "application/pdf" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename.endsWith(".pdf") ? filename : `${filename}.pdf`;
  anchor.style.display = "none";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
const safeFilename = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "business-document";
const BusinessPrintStyles = () => <style>{`@media print { body * { visibility: hidden !important; } #business-document, #business-document *, #business-payslip, #business-payslip *, #business-calculation-results, #business-calculation-results *, #business-content-output, #business-content-output * { visibility: visible !important; } #business-document, #business-payslip, #business-calculation-results, #business-content-output { position: absolute !important; left: 0 !important; top: 0 !important; width: 100% !important; border: 0 !important; background: #fff !important; color: #111 !important; box-shadow: none !important; } }`}</style>;

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

type AgendaDraftRow = { topic: string; minutes: string };
type ActionDraftRow = { owner: string; task: string; due: string };

function parseAgendaDraftRows(raw: string): AgendaDraftRow[] {
  const rows = raw.split(/\r?\n/).map((line) => {
    const [topic = "", minutes = "5"] = line.split("|");
    return { topic: topic.trim(), minutes: minutes.trim() || "5" };
  });
  return rows.length ? rows : [{ topic: "", minutes: "5" }];
}

function parseActionDraftRows(raw: string): ActionDraftRow[] {
  const rows = raw.split(/\r?\n/).map((line) => {
    const parts = line.split("|");
    return { owner: (parts[0] ?? "").trim(), task: (parts[1] ?? "").trim(), due: (parts[2] ?? "").trim() };
  });
  return rows.length ? rows : [{ owner: "", task: "", due: "" }];
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

const BUSINESS_OPERATIONS = new Set([
  "roi", "break-even", "commission", "pricing", "markup", "cash-flow", "salary",
  "customer-lifetime-value", "customer-acquisition-cost", "recurring-revenue", "expense",
  "inventory", "discount", "margin", "profit", "business-name", "company-name",
  "brand-name", "product-name", "slogan", "sku", "agenda", "minutes", "meeting-agenda",
  "meeting-minutes", "email-signature", "invoice", "receipt", "quotation", "estimate",
  "purchase-order", "payslip",
]);

const BUSINESS_STUDIO_TABS = [
  { id: "document", slug: "document-studio", title: "Document Studio", modes: [["Invoice", "invoice"], ["Receipt", "receipt"], ["Quotation", "quotation"], ["Estimate", "estimate"], ["Purchase order", "purchase-order"]] },
  { id: "finance", slug: "finance-studio", title: "Finance Metrics Studio", modes: [["Break-even", "break-even"], ["Cash flow", "cash-flow"], ["Commission", "commission"], ["CAC", "customer-acquisition-cost"], ["LTV", "customer-lifetime-value"], ["ROI", "roi"], ["Pricing", "pricing"], ["Markup", "markup"], ["Recurring revenue", "recurring-revenue"], ["Expense", "expense"], ["Inventory", "inventory"], ["Discount", "discount"], ["Margin", "margin"], ["Profit", "profit"], ["Salary", "salary"]] },
  { id: "naming", slug: "naming-studio", title: "Naming Studio", modes: [["Business", "business-name"], ["Company", "company-name"], ["Brand", "brand-name"], ["Product", "product-name"], ["Slogan", "slogan"], ["SKU", "sku"]] },
  { id: "ops", slug: "ops-studio", title: "Ops Studio", modes: [["Agenda", "meeting-agenda"], ["Minutes", "meeting-minutes"], ["Signature", "email-signature"], ["Payslip demo", "payslip"]] },
] as const;

function BusinessStudioTabs({ op, onLoadExample }: { op: string; onLoadExample: () => void }) {
  const studio = BUSINESS_STUDIO_TABS.find((candidate) => candidate.modes.some(([, mode]) => mode === op || (mode === "meeting-agenda" && op === "agenda") || (mode === "meeting-minutes" && op === "minutes")));
  if (!studio) return null;
  return <div className="mb-4 space-y-3">
    <div className="flex flex-wrap gap-2" aria-label={`${studio.title} modes`}>
      {studio.modes.map(([label, mode]) => <a key={mode} href={`/tools/business/${studio.slug}?mode=${mode}`} aria-current={mode === op || (mode === "meeting-agenda" && op === "agenda") || (mode === "meeting-minutes" && op === "minutes") ? "page" : undefined} className={`inline-flex min-h-10 items-center rounded-lg border px-3 py-2 text-sm ${mode === op || (mode === "meeting-agenda" && op === "agenda") || (mode === "meeting-minutes" && op === "minutes") ? "border-primary bg-primary/10 font-semibold" : "hover:bg-muted/40"}`}>{label}</a>)}
    </div>
    <div><button type="button" className="inline-flex min-h-10 items-center rounded-lg border px-3 py-2 text-sm" onClick={onLoadExample}>Load example</button></div>
  </div>;
}

export function BusinessEngine({ tool, initialMode }: { tool: ToolMeta; initialMode?: string }) {
  const requestedMode = initialMode && BUSINESS_OPERATIONS.has(initialMode) ? initialMode : undefined;
  const op = requestedMode ?? opFromId(tool.id);
  const [a, setA] = useState("1000");
  const [b, setB] = useState("600");
  const [c, setC] = useState("50");
  const [d, setD] = useState("0");
  const [e, setE] = useState("12");
  const [tax, setTax] = useState("0");
  const [discount, setDiscount] = useState("0");
  const [targetProfit, setTargetProfit] = useState("0");
  const [monthlyContribution, setMonthlyContribution] = useState("0");
  const [meetingTitle, setMeetingTitle] = useState("Q4 sales review");
  const [meetingDateTime, setMeetingDateTime] = useState("");
  const [meetingLocation, setMeetingLocation] = useState("");
  const [prepNotes, setPrepNotes] = useState("");
  const [discussionNotes, setDiscussionNotes] = useState("");
  const [decisions, setDecisions] = useState("");
  const [actionItems, setActionItems] = useState("");
  const [nextMeeting, setNextMeeting] = useState("");
  const [company, setCompany] = useState("Your Business");
  const [client, setClient] = useState("Client");
  const [lineItems, setLineItems] = useState<Array<{ description: string; quantity: string; unitPrice: string }>>([{ description: "Professional service", quantity: "1", unitPrice: "100" }]);
  const [currency, setCurrency] = useState("USD");
  const [logoDataUrl, setLogoDataUrl] = useState("");
  const [invoiceNo, setInvoiceNo] = useState("INV-001");
  const [documentDate, setDocumentDate] = useState(new Date().toLocaleDateString());
  const [seed, setSeed] = useState("technology");
  const [audience, setAudience] = useState("customers");
  const [nameStyle, setNameStyle] = useState<BusinessNameStyle>("descriptive");
  const [maxNameLength, setMaxNameLength] = useState("32");
  const [nameBlacklist, setNameBlacklist] = useState("");
  const [generationOffset, setGenerationOffset] = useState(0);
  const [ltvModel, setLtvModel] = useState<"simple" | "saas">("simple");
  const [grossMarginPct, setGrossMarginPct] = useState("80");
  const [monthlyChurnPct, setMonthlyChurnPct] = useState("5");
  const [attendees, setAttendees] = useState("Team");
  const [meetingGoal, setMeetingGoal] = useState("Weekly planning");
  const [agendaItems, setAgendaItems] = useState("Welcome and objectives | 5\nProgress updates | 10\nDecisions and blockers | 15\nActions and next steps | 5");
  const [name, setName] = useState("Alex Morgan");
  const [role, setRole] = useState("Founder");
  const [email, setEmail] = useState("hello@example.com");
  const [phone, setPhone] = useState("");
  const [website, setWebsite] = useState("");
  const [socialLink, setSocialLink] = useState("");
  const [copyMessage, setCopyMessage] = useState("");

  const A = num(a);
  const B = num(b);
  const C = num(c);
  const D = num(d);
  const E = num(e);
  const T = num(tax);
  const Disc = num(discount);
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
    "meeting-agenda",
    "meeting-minutes",
    "email-signature",
  ].includes(op);
  const isDocument = ["invoice", "receipt", "quotation", "estimate", "purchase-order"].some(
    (kind) => op.startsWith(kind),
  );

  const calculation = useMemo<Calculation>(() => {
    switch (op) {
      case "roi": {
        const result = calculateRoi(A, B);
        return { metrics: [
          { label: "ROI", value: result.roiPct == null ? "—" : `${result.roiPct.toFixed(2)}%`, note: result.valid ? "Net return divided by initial investment" : "Enter a positive initial investment" },
          { label: "Net return", value: money(result.netReturn) },
        ], formula: "ROI = (Value received − Initial investment) ÷ Initial investment × 100. ROI is undefined when initial investment is zero." };
      }
      case "break-even": {
        const result = calculateBreakEven({ fixedCosts: B, pricePerUnit: A, variableCostPerUnit: C, targetProfit: num(targetProfit) });
        return { metrics: [
          { label: "Break-even units", value: result.breakEvenUnits == null ? "Not possible" : result.breakEvenUnits.toLocaleString(), note: result.possible ? "Rounded up to a whole unit" : "Selling price must exceed non-negative variable cost" },
          { label: "Break-even revenue", value: result.breakEvenRevenue == null ? "—" : money(result.breakEvenRevenue), note: "Revenue at the rounded-up whole-unit break-even point" },
          { label: "Contribution margin ratio", value: result.contributionMarginPct == null ? "—" : `${result.contributionMarginPct.toFixed(2)}%`, note: "Contribution per unit ÷ selling price" },
          { label: "Units for target profit", value: result.targetUnits == null ? "—" : result.targetUnits.toLocaleString(), note: result.targetProfit > 0 ? `Target profit: ${money(result.targetProfit)}` : "Set a target profit to model a goal" },
          { label: "Contribution margin / unit", value: result.possible ? money(result.contribution) : "—" },
        ], formula: "Break-even units = Fixed costs ÷ (Selling price/unit − Variable cost/unit). Target-profit units = (fixed costs + target profit) ÷ contribution/unit. Costs and prices are non-negative; units are rounded up." };
      }
      case "commission": {
        const result = calculateCommission(A, B);
        return { metrics: [ { label: "Commission", value: money(result.commission) }, { label: "After commission", value: money(result.afterCommission) } ], formula: "Commission = non-negative sales × rate. Rate is bounded to 0–100% so the commission cannot exceed sales." };
      }
      case "pricing":
      case "markup": {
        const result = calculatePricing(A, B);
        return { metrics: [ { label: "Selling price", value: money(result.sellingPrice) }, { label: "Profit", value: money(result.profit) } ], formula: "Selling price = non-negative unit cost × (1 + non-negative markup rate). Markup is applied to cost, not equivalent to margin." };
      }
      case "cash-flow": {
        const result = calculateCashFlow(C, A, B);
        return { metrics: [ { label: "Net cash flow", value: money(result.netCashFlow) }, { label: "Ending cash", value: money(result.endingCash) } ], formula: "Net cash flow = non-negative inflows − non-negative outflows. Ending cash = opening cash + net cash flow." };
      }
      case "salary": {
        const result = calculateSalary(A);
        return { metrics: [ { label: "Gross annual", value: money(result.annual) }, { label: "Monthly", value: money(result.monthly) }, { label: "Weekly", value: money(result.weekly) }, { label: "Hourly (40h), before tax", value: money(result.hourlyAt40Hours) } ], formula: "Gross annual salary ÷ 12 months, 52 weeks, or 2,080 hours. This is a conversion, not a take-home-pay estimate." };
      }
      case "customer-lifetime-value": {
        const ltvResult = calculateLifetimeValue({
          model: ltvModel,
          averageOrderValue: A,
          purchasesPerPeriod: B,
          lifespanPeriods: C,
          arpu: A,
          grossMarginPct: num(grossMarginPct),
          monthlyChurnPct: num(monthlyChurnPct),
          monthlyContribution: num(monthlyContribution),
        });
        const ltv = ltvResult.ltv;
        const ltvValid = ltvModel !== "saas" || num(monthlyChurnPct) > 0;
        const ratio = D > 0 && ltvValid ? ltv / D : 0;
        const contribution = ltvModel === "saas" ? ltvResult.monthlyContribution : num(monthlyContribution);
        const payback = contribution > 0 && D > 0 ? D / contribution : 0;
        const health = !ltvValid ? "Set monthly churn above 0% before interpreting LTV:CAC" : D <= 0 ? "Add CAC to evaluate acquisition efficiency" : ratio < 1 ? "Below 1×: value does not cover acquisition cost" : ratio < 3 ? "1–3×: weak; review unit economics" : ratio <= 5 ? "3–5×: commonly used as a planning band" : ">5×: strong ratio; validate retention and margin assumptions";
        return {
          metrics: [
            { label: ltvModel === "saas" ? "Estimated gross-profit lifetime value" : "Customer lifetime value", value: ltvModel === "saas" && !ltvValid ? "Not finite" : money(ltv), note: ltvResult.warning },
            { label: "LTV:CAC", value: D > 0 && ltvValid ? `${ratio.toFixed(2)}×` : "—", note: health },
            { label: "CAC payback", value: payback > 0 ? `${payback.toFixed(1)} months` : "—", note: payback > 0 ? "CAC ÷ monthly gross-profit contribution per customer" : "Add positive monthly contribution and CAC" },
          ],
          formula: `${ltvResult.method}. CAC payback months = CAC ÷ monthly contribution. Ratios are directional heuristics, not universal performance guarantees.`,
        };
      }
      case "customer-acquisition-cost": {
        const result = calculateCustomerAcquisition({ spend: A, newCustomers: B, lifetimeValue: D, monthlyContribution: num(monthlyContribution) });
        const cac = result.cac ?? 0;
        const ratio = result.ratio ?? 0;
        const band = result.band;
        const health = D <= 0 || cac <= 0 ? "Add valid positive LTV and CAC inputs" : band === "below-1" ? "Below 1×: LTV does not cover acquisition cost" : band === "1-to-3" ? "1–3×: weak; review acquisition efficiency" : band === "3-to-5" ? "3–5×: commonly used as a planning band" : ">5×: strong ratio; check growth and retention assumptions";
        const payback = result.paybackMonths ?? 0;
        return {
          metrics: [
            { label: "Customer acquisition cost (CAC)", value: cac > 0 ? money(cac) : "—", note: "Acquisition spend ÷ new customers" },
            { label: "LTV:CAC ratio", value: ratio > 0 ? `${ratio.toFixed(2)}×` : "—", note: health },
            { label: "CAC payback", value: payback > 0 ? `${payback.toFixed(1)} months` : "—", note: payback > 0 ? "CAC ÷ monthly contribution per new customer" : "Enter positive monthly contribution to estimate payback" },
          ],
          formula: "CAC = acquisition spend ÷ new customers. LTV:CAC = lifetime value ÷ CAC. Payback months = CAC ÷ monthly contribution per new customer. Ratio bands are directional planning heuristics, not universal benchmarks.",
        };
      }
      case "recurring-revenue": {
        const result = calculateRecurringRevenue(A, B);
        return {
          metrics: [
            { label: "Monthly recurring revenue (MRR)", value: money(result.monthly) },
            { label: "Annual recurring revenue (ARR)", value: money(result.annual) },
            { label: "Annual growth rate", value: `${result.annualGrowthPct.toFixed(2)}%`, note: "Can be negative when revenue contracts" },
          ],
          formula: "ARR = non-negative MRR × 12. Growth rate is an assumption supplied by the user; it is not an automatically forecast CAGR.",
        };
      }
      case "expense": {
        const result = calculateExpenses([A, B, C, D, E]);
        return {
          metrics: [
            { label: "Total expense", value: money(result.total) },
            { label: "Average across five lines", value: money(result.average) },
          ],
          formula: "Total = sum of five non-negative expense lines. Negative entries are treated as zero.",
        };
      }
      case "inventory": {
        const result = calculateInventory(A, B, C);
        return { metrics: [ { label: "Inventory value", value: money(result.inventoryValue), note: "Units × unit cost; excludes shrinkage and accounting valuation adjustments" }, { label: "Reorder quantity", value: money(result.reorderQuantity) } ], formula: "Inventory value = non-negative units in stock × non-negative unit cost." };
      }
      case "discount": {
        const result = calculateDiscount(A, B);
        return { metrics: [ { label: "Discount", value: money(result.discount), note: `Rate bounded to ${result.ratePct}%` }, { label: "Final price", value: money(result.finalPrice) } ], formula: "Discount amount = non-negative original price × discount rate. Rate is bounded to 0–100%; final price cannot be negative." };
      }
      case "margin":
      case "profit": {
        const result = calculateProfitMargin(A, B);
        return { metrics: [ { label: "Profit / loss", value: money(result.profit) }, { label: "Margin", value: result.marginPct == null ? "—" : `${result.marginPct.toFixed(2)}%`, note: "Undefined when revenue is zero" } ], formula: "Profit = revenue − non-negative costs. Margin = profit ÷ revenue × 100; not defined when revenue is zero." };
      }
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
  }, [op, A, B, C, D, E, targetProfit, monthlyContribution, ltvModel, grossMarginPct, monthlyChurnPct]);

  const websiteHref = safeHttpUrl(website);
  const socialHref = safeHttpUrl(socialLink);
  const signatureHtml = `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="font-family:Arial,Helvetica,sans-serif;font-size:13px;line-height:1.5;color:#222"><tr><td style="padding:0 12px 0 0;vertical-align:top"><strong style="font-size:15px">${escapeHtml(name)}</strong><br>${escapeHtml(role)}<br>${escapeHtml(company)}</td><td style="border-left:2px solid #888;padding:0 0 0 12px;vertical-align:top">${escapeHtml(email)}${phone ? `<br>${escapeHtml(phone)}` : ""}${website ? `<br>${websiteHref ? `<a href="${escapeHtml(websiteHref)}" style="color:inherit">${escapeHtml(website)}</a>` : escapeHtml(website)}` : ""}${socialLink ? `<br>${socialHref ? `<a href="${escapeHtml(socialHref)}" style="color:inherit">Profile</a>` : "Profile: " + escapeHtml(socialLink)}` : ""}</td></tr></table>`;

  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopyMessage("Copied");
    } catch {
      setCopyMessage("Clipboard access is unavailable; select and copy the output instead.");
    }
  };

  const loadExample = () => {
    setCopyMessage("");
    setGenerationOffset(0);
    switch (op) {
      case "invoice": case "receipt": case "quotation": case "estimate": case "purchase-order":
        setCompany("Acme Solar Co."); setClient("Example Customer"); setInvoiceNo(op === "invoice" ? "INV-EXAMPLE-001" : "DOC-EXAMPLE-001"); setDocumentDate("2026-10-15"); setCurrency("USD"); setTax("7.5"); setDiscount("5"); setLogoDataUrl("");
        setLineItems([{ description: "Solar panel", quantity: "3", unitPrice: "250" }, { description: "Installation", quantity: "1", unitPrice: "100" }]); break;
      case "business-name": case "company-name": case "brand-name": case "product-name":
        setSeed("solar energy"); setNameStyle("descriptive"); setMaxNameLength("32"); setNameBlacklist(""); break;
      case "slogan": setSeed("solar energy"); setAudience("homeowners"); break;
      case "sku": setSeed("TEC"); break;
      case "agenda": case "meeting-agenda": case "minutes": case "meeting-minutes":
        setMeetingTitle("Solar launch review"); setMeetingDateTime("2026-10-20 10:00"); setMeetingLocation("Video conference"); setMeetingGoal("Decide launch readiness and owners"); setAttendees("Product lead; Operations lead; Marketing lead"); setPrepNotes("Review launch metrics and open blockers."); setAgendaItems("Metrics review | 10\nDecision log | 20\nActions and owners | 10"); setDiscussionNotes("Launch readiness, support coverage, unresolved blockers."); setDecisions("Approve launch after support checklist passes."); setActionItems("Operations lead | Finalize support checklist | 2026-10-19\nMarketing lead | Confirm launch copy | 2026-10-19"); setNextMeeting("2026-10-21 10:00"); break;
      case "email-signature": setName("Jordan Example"); setRole("Operations Lead"); setEmail("jordan@example.com"); setCompany("Acme Solar Co."); setPhone("+1 555 0100"); setWebsite("https://example.com"); setSocialLink("https://www.linkedin.com/"); break;
      case "payslip": setCompany("Example Company"); setClient("Example Employee"); setInvoiceNo("Example pay period"); setA("5000"); setB("500"); setC("100"); break;
      case "break-even": setA("50"); setB("10000"); setC("30"); setTargetProfit("5000"); break;
      case "commission": setA("50000"); setB("8"); break;
      case "customer-acquisition-cost": setA("5000"); setB("100"); setD("250"); setMonthlyContribution("10"); break;
      case "customer-lifetime-value": setLtvModel("saas"); setA("50"); setB("12"); setC("24"); setD("100"); setGrossMarginPct("80"); setMonthlyChurnPct("5"); setMonthlyContribution("0"); break;
      case "cash-flow": setA("800"); setB("900"); setC("1000"); break;
      case "roi": setA("150"); setB("100"); break;
      case "salary": setA("52000"); break;
      case "pricing": case "markup": setA("100"); setB("25"); break;
      case "margin": case "profit": setA("100"); setB("70"); break;
      case "discount": setA("100"); setB("15"); break;
      case "recurring-revenue": setA("10000"); setB("20"); break;
      case "expense": setA("100"); setB("200"); setC("300"); setD("40"); setE("20"); break;
      case "inventory": setA("12"); setB("25"); setC("5"); break;
      default: setA("1000"); setB("600"); setC("50"); setD("0"); setE("12");
    }
  };

  if (contentMode) {
    const isNameMode = ["business-name", "company-name", "brand-name", "product-name"].includes(op);
    const agendaDraftRows = parseAgendaDraftRows(agendaItems);
    const parsedAgendaItems = agendaDraftRows.map((item) => ({ topic: item.topic, minutes: Number(item.minutes) })).filter((item) => item.topic && Number.isFinite(item.minutes) && item.minutes > 0 && item.minutes <= 480);
    const actionDraftRows = parseActionDraftRows(actionItems).filter((item) => item.owner || item.task || item.due);
    const variants =
      op === "sku"
        ? generateSkus(seed, generationOffset * 24, 24)
        : op === "slogan"
          ? generateSlogans(seed, audience, generationOffset, 24)
          : isNameMode
            ? generateBusinessNames({ seed, style: nameStyle, maxLength: num(maxNameLength) || 32, blacklist: nameBlacklist, offset: generationOffset, count: 32 })
            : (op === "agenda" || op === "meeting-agenda")
              ? [
                  "MEETING AGENDA",
                  `Title: ${meetingTitle || meetingGoal}`,
                  `Date/time: ${meetingDateTime || "Not set"}`,
                  `Location/link: ${meetingLocation || "Not set"}`,
                  `Goal: ${meetingGoal}`,
                  `Attendees: ${attendees}`,
                  "",
                  "Timed agenda items:",
                  ...(parsedAgendaItems.length ? parsedAgendaItems.map((item, index) => `${index + 1}. ${item.topic} (${item.minutes} min)`) : ["No valid agenda items. Add a topic and a duration from 1 to 480 minutes."]),
                  `Timing total: ${parsedAgendaItems.reduce((sum, item) => sum + item.minutes, 0)} minutes`,
                  `Preparation notes: ${prepNotes || "None provided"}`,
                ]
              : (op === "minutes" || op === "meeting-minutes")
                ? [
                    "MEETING MINUTES",
                    `Meeting: ${meetingTitle || meetingGoal}`,
                    `Date/time: ${meetingDateTime || "Not set"}`,
                    `Location/link: ${meetingLocation || "Not set"}`,
                    `Attendees: ${attendees}`,
                    "",
                    `Discussion notes:\n${discussionNotes || "- Add discussion notes by agenda item"}`,
                    `Decisions:\n${decisions || "- Record decision and rationale"}`,
                    `Action items (owner · task · due date):\n${actionDraftRows.length ? actionDraftRows.map((item) => `- ${item.owner || "Unassigned"} · ${item.task || "Task not specified"} · ${item.due || "No due date"}`).join("\n") : "- No action items added"}`,
                    `Next meeting: ${nextMeeting || "Not scheduled"}`,
                  ]
                : [`${name} | ${role}`, email, company, "Phone: __________________", "Website: __________________"];
    const output = variants.length ? variants.join("\n") : (isNameMode ? "No names match these filters. Increase the maximum length or remove an exclusion word." : "");

    return (
      <div className="space-y-5">
        <BusinessPrintStyles />
        <BusinessStudioTabs op={op} onLoadExample={loadExample} />
        <div className="rounded-lg border p-3 text-sm text-muted-foreground">Privacy-first: ideas, meeting notes, and signature markup are generated locally in this page. Nothing is uploaded by this Studio; copy or export only what you choose to share.</div>
        <div className="grid gap-3 md:grid-cols-2">
          {op === "sku" || op === "slogan" || op.includes("name") ? (
            <TextField label="Seed / topic" value={seed} onChange={setSeed} />
          ) : null}
          {isNameMode ? <>
            <label className="block space-y-1"><span className="text-sm font-medium">Maximum name length</span><input className="w-full rounded-lg border bg-background px-3 py-2" type="number" min="8" max="60" value={maxNameLength} onChange={(event) => setMaxNameLength(event.target.value)} /></label>
            <TextField label="Exclude words (comma-separated, optional)" value={nameBlacklist} onChange={setNameBlacklist} />
          </> : null}
          {op === "slogan" ? <TextField label="Audience / context" value={audience} onChange={setAudience} /> : null}
          {["agenda", "minutes", "meeting-agenda", "meeting-minutes"].includes(op) ? (
            <>
              <TextField label="Meeting title" value={meetingTitle} onChange={setMeetingTitle} />
              <TextField label="Meeting goal" value={meetingGoal} onChange={setMeetingGoal} />
              <TextField label="Date and time" value={meetingDateTime} onChange={setMeetingDateTime} />
              <TextField label="Location or meeting link" value={meetingLocation} onChange={setMeetingLocation} />
              <TextField label="Attendees" value={attendees} onChange={setAttendees} />
              {["agenda", "meeting-agenda"].includes(op) ? <TextField label="Preparation notes" value={prepNotes} onChange={setPrepNotes} /> : null}
              <div className="space-y-3 md:col-span-2">
                <div className="text-sm font-medium">Timed agenda items</div>
                {agendaDraftRows.map((row, index) => <div key={`agenda-${index}`} className="grid grid-cols-1 gap-2 rounded-lg border p-3 sm:grid-cols-[minmax(0,1fr)_7rem_auto] sm:items-end">
                  <TextField label={`Item ${index + 1} topic`} value={row.topic} onChange={(value) => { const rows = parseAgendaDraftRows(agendaItems); rows[index] = { ...rows[index], topic: value }; setAgendaItems(rows.map((item) => `${item.topic} | ${item.minutes}`).join("\n")); }} />
                  <label className="block space-y-1"><span className="text-sm font-medium">Minutes</span><input className="w-full rounded-lg border bg-background px-3 py-2" type="number" min="1" max="480" step="1" value={row.minutes} onChange={(event) => { const rows = parseAgendaDraftRows(agendaItems); rows[index] = { ...rows[index], minutes: event.target.value }; setAgendaItems(rows.map((item) => `${item.topic} | ${item.minutes}`).join("\n")); }} /></label>
                  <button type="button" className="min-h-10 rounded-lg border px-3 py-2 text-sm" disabled={agendaDraftRows.length <= 1} onClick={() => setAgendaItems(agendaDraftRows.filter((_, rowIndex) => rowIndex !== index).map((item) => `${item.topic} | ${item.minutes}`).join("\n"))}>Remove</button>
                </div>)}
                <button type="button" className="min-h-10 rounded-lg border px-3 py-2 text-sm" onClick={() => setAgendaItems(`${agendaItems.trimEnd()}${agendaItems.trim() ? "\n" : ""}New agenda item | 5`)}>Add timed item</button>
              </div>
              {["minutes", "meeting-minutes"].includes(op) ? <>
                <label className="block space-y-1"><span className="text-sm font-medium">Discussion notes</span><textarea className="w-full rounded-lg border bg-background px-3 py-2" rows={3} value={discussionNotes} onChange={(event) => setDiscussionNotes(event.target.value)} /></label>
                <label className="block space-y-1"><span className="text-sm font-medium">Decisions and rationale</span><textarea className="w-full rounded-lg border bg-background px-3 py-2" rows={2} value={decisions} onChange={(event) => setDecisions(event.target.value)} /></label>
                <div className="space-y-3 md:col-span-2">
                  <div className="text-sm font-medium">Action items</div>
                  {parseActionDraftRows(actionItems).map((row, index) => <div key={`action-${index}`} className="grid grid-cols-1 gap-2 rounded-lg border p-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.5fr)_minmax(0,1fr)_auto] sm:items-end">
                    <TextField label="Owner" value={row.owner} onChange={(value) => { const rows = parseActionDraftRows(actionItems); rows[index] = { ...rows[index], owner: value }; setActionItems(rows.map((item) => `${item.owner} | ${item.task} | ${item.due}`).join("\n")); }} />
                    <TextField label="Task" value={row.task} onChange={(value) => { const rows = parseActionDraftRows(actionItems); rows[index] = { ...rows[index], task: value }; setActionItems(rows.map((item) => `${item.owner} | ${item.task} | ${item.due}`).join("\n")); }} />
                    <TextField label="Due date" value={row.due} onChange={(value) => { const rows = parseActionDraftRows(actionItems); rows[index] = { ...rows[index], due: value }; setActionItems(rows.map((item) => `${item.owner} | ${item.task} | ${item.due}`).join("\n")); }} />
                    <button type="button" className="min-h-10 rounded-lg border px-3 py-2 text-sm" disabled={parseActionDraftRows(actionItems).length <= 1} onClick={() => setActionItems(parseActionDraftRows(actionItems).filter((_, rowIndex) => rowIndex !== index).map((item) => `${item.owner} | ${item.task} | ${item.due}`).join("\n"))}>Remove</button>
                  </div>)}
                  <button type="button" className="min-h-10 rounded-lg border px-3 py-2 text-sm" onClick={() => setActionItems(`${actionItems.trimEnd()}${actionItems.trim() ? "\n" : ""} |  | `)}>Add action item</button>
                </div>
                <TextField label="Next meeting" value={nextMeeting} onChange={setNextMeeting} />
              </> : null}
            </>
          ) : null}
          {op === "email-signature" ? (
            <>
              <TextField label="Name" value={name} onChange={setName} />
              <TextField label="Role" value={role} onChange={setRole} />
              <TextField label="Email" value={email} onChange={setEmail} />
              <TextField label="Company" value={company} onChange={setCompany} />
              <TextField label="Phone (optional)" value={phone} onChange={setPhone} />
              <TextField label="Website URL (optional)" value={website} onChange={setWebsite} />
              <TextField label="Social/profile URL (optional)" value={socialLink} onChange={setSocialLink} />
            </>
          ) : null}
        </div>
        {isNameMode ? <div className="space-y-3 rounded-xl border p-4">
          <div className="text-sm font-semibold">Naming style</div>
          <div className="flex flex-wrap gap-2">{([ ["descriptive", "Descriptive"], ["compound", "Compound"], ["prefix-suffix", "Prefix / suffix"], ["short-brandable", "Short brandable"] ] as Array<[BusinessNameStyle, string]>).map(([style, label]) => <button key={style} type="button" aria-pressed={nameStyle === style} onClick={() => { setNameStyle(style); setGenerationOffset(0); }} className={`min-h-10 rounded-lg border px-3 py-2 text-sm ${nameStyle === style ? "border-primary bg-primary/10 font-semibold" : ""}`}>{label}</button>)}</div>
          <div className="flex flex-wrap gap-2"><button type="button" onClick={() => setGenerationOffset(0)} className="min-h-10 rounded-lg bg-primary px-4 py-2 text-primary-foreground">Generate</button><button type="button" onClick={() => setGenerationOffset((value) => value + 1)} className="min-h-10 rounded-lg border px-4 py-2">More names</button><a className="inline-flex min-h-10 items-center rounded-lg border px-3 py-2 text-sm" href="https://www.namecheap.com/domains/" target="_blank" rel="noreferrer">Check finalists at a registrar ↗</a></div>
          <p className="text-xs text-muted-foreground">Registrar link opens externally. enV does not claim domain availability or detect premium pricing.</p>
        </div> : null}
        {op === "slogan" || op === "sku" ? <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => setGenerationOffset(0)} className="min-h-10 rounded-lg bg-primary px-4 py-2 text-primary-foreground">Generate</button>
          <button type="button" onClick={() => setGenerationOffset((value) => value + 1)} className="min-h-10 rounded-lg border px-4 py-2">More</button>
        </div> : null}
        <div id="business-content-output" className="rounded-2xl border p-5">
          <div className="mb-3 text-sm font-medium">Generated {title}{isNameMode || op === "slogan" ? ` · ${variants.length} ideas` : ""}</div>
          <pre className="whitespace-pre-wrap text-sm leading-6">{output}</pre>
        </div>
        <div className="flex flex-wrap gap-2 print:hidden">
          {(["agenda", "minutes", "meeting-agenda", "meeting-minutes"].includes(op)) ? <><button type="button" onClick={() => window.print()} className="min-h-10 rounded-lg border px-4 py-2">Print</button><button type="button" onClick={() => void downloadBusinessPdf(title, variants, `${safeFilename(title)}.pdf`).catch(() => setCopyMessage("PDF download failed. Please use Print instead."))} className="min-h-10 rounded-lg border px-4 py-2">Download PDF</button></> : null}
          <button type="button" disabled={isNameMode && variants.length === 0} onClick={() => void copy(output)} className="min-h-10 rounded-lg bg-primary px-4 py-2 text-primary-foreground disabled:cursor-not-allowed disabled:opacity-50">{isNameMode ? "Copy all names" : op === "slogan" ? "Copy all slogans" : "Copy output"}</button>
          {op === "email-signature" ? <button type="button" onClick={() => void copy(signatureHtml)} className="min-h-10 rounded-lg border px-4 py-2">Copy email-safe HTML</button> : null}
        </div>
        {isNameMode ? <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{variants.map((variant, index) => <div key={`${variant}-${index}`} className="flex min-h-10 items-center justify-between gap-2 rounded-lg border px-3 py-2"><span className="min-w-0 break-words text-sm">{variant}</span><button type="button" onClick={() => void copy(variant)} className="min-h-10 shrink-0 rounded-md border px-3 py-2 text-xs">Copy</button></div>)}</div> : null}
        {op === "email-signature" ? <div className="rounded-xl border p-4"><div className="mb-2 text-sm font-medium">HTML source (inline styles, no remote images)</div><pre className="overflow-x-auto whitespace-pre-wrap text-xs">{signatureHtml}</pre><p className="mt-2 text-xs text-muted-foreground">Paste instructions: copy the rendered signature where supported. Outlook may sanitize pasted HTML differently across desktop, web, and mobile; verify with a test email before using it widely.</p></div> : null}
        {copyMessage ? <div className="text-xs text-muted-foreground" role="status">{copyMessage}</div> : null}
        <div className="text-xs text-muted-foreground">
          Generated locally from your inputs. These suggestions do not verify trademarks, domain availability, social handles, cultural meaning, or audience fit. Validate finalists before commercial use.
        </div>
      </div>
    );
  }

  const print = () => window.print();
  if (op === "payslip") {
    const gross = Math.max(0, A);
    const deductions = Math.max(0, B) + Math.max(0, C);
    return (
      <div className="space-y-5">
        <BusinessStudioTabs op={op} onLoadExample={loadExample} />
        <BusinessPrintStyles />
        <div className="rounded-xl border border-amber-500/40 bg-amber-500/5 p-3 text-sm font-medium">DEMO — illustrative payslip layout only. Verify local payroll, tax, and statutory requirements.</div>
        <div className="grid gap-3 md:grid-cols-2">
          <TextField label="Employer" value={company} onChange={setCompany} />
          <TextField label="Employee name" value={client} onChange={setClient} />
          <TextField label="Pay period" value={invoiceNo} onChange={setInvoiceNo} />
          <Field label="Gross pay" value={a} onChange={setA} />
          <Field label="Tax / statutory deductions" value={b} onChange={setB} />
          <Field label="Other deductions" value={c} onChange={setC} />
        </div>
        <div id="business-payslip" className="rounded-2xl border p-6">
          <h2 className="text-2xl font-bold">Payslip — DEMO</h2>
          <p className="text-muted-foreground">{company} · {invoiceNo}</p>
          <p className="my-4">Employee: <b>{client}</b></p>
          <div className="space-y-2 border-t pt-4 text-sm">
            <div className="flex justify-between"><span>Gross pay</span><b>{money(gross)}</b></div>
            <div className="flex justify-between"><span>Tax / statutory deductions</span><b>−{money(Math.max(0, B))}</b></div>
            <div className="flex justify-between"><span>Other deductions</span><b>−{money(Math.max(0, C))}</b></div>
            <div className="flex justify-between border-t pt-3 text-lg"><span>Net pay</span><b>{money(gross - deductions)}</b></div>
          </div>
        </div>
        <div className="sticky bottom-2 z-10 flex items-center justify-between gap-3 rounded-xl border bg-background/95 p-3 shadow-lg md:hidden"><span className="text-sm text-muted-foreground">Net pay</span><strong>{currency} {money(gross - deductions)}</strong></div>
        <div className="flex flex-wrap gap-2 print:hidden">
          <button type="button" onClick={print} className="min-h-10 rounded-lg border px-4 py-2">Print</button>
          <button type="button" onClick={() => void downloadBusinessPdf("Payslip - DEMO", ["Payslip - DEMO", `Employer: ${company}`, `Employee: ${client}`, `Pay period: ${invoiceNo}`, `Gross pay: ${money(gross)}`, `Tax / statutory deductions: ${money(Math.max(0, B))}`, `Other deductions: ${money(Math.max(0, C))}`, `Net pay: ${money(gross - deductions)}`, "DEMO ONLY - verify local payroll, tax, and statutory requirements."], `${safeFilename(client)}-payslip-demo.pdf`).catch(() => setCopyMessage("PDF download failed. Please try Print instead."))} className="rounded-lg bg-primary px-4 py-2 text-primary-foreground">Download PDF</button>
        </div>
        {copyMessage ? <p role="status" className="text-sm text-muted-foreground">{copyMessage}</p> : null}
      </div>
    );
  }
  if (isDocument) {
    const documentTotals = calculateDocumentTotals(lineItems.map((item) => ({ quantity: num(item.quantity), unitPrice: num(item.unitPrice) })), T, Disc);
    const subtotal = documentTotals.subtotal;
    const discounted = documentTotals.taxable;
    const total = documentTotals.total;
    return (
      <div className="space-y-5">
        <BusinessStudioTabs op={op} onLoadExample={loadExample} />
        <BusinessPrintStyles />
        <div className="rounded-lg border p-3 text-sm text-muted-foreground">Privacy: document details are processed in this page and are not uploaded by this tool. Avoid entering sensitive data on a shared device.</div>
        <div className="grid gap-3 md:grid-cols-2">
          <TextField label="Business name" value={company} onChange={setCompany} />
          <TextField label={op.startsWith("receipt") ? "Received from" : op.startsWith("quotation") || op.startsWith("estimate") ? "Prepared for" : op.startsWith("purchase-order") ? "Supplier" : "Bill to / recipient"} value={client} onChange={setClient} />
          <TextField label="Document number" value={invoiceNo} onChange={setInvoiceNo} />
          <TextField label="Document date" value={documentDate} onChange={setDocumentDate} />
          <Field label="Tax %" value={tax} onChange={setTax} />
          <label className="block space-y-1"><span className="text-sm font-medium">Currency</span><select className="w-full rounded-lg border bg-background px-3 py-2" value={currency} onChange={(event) => setCurrency(event.target.value)}><option value="USD">USD — US Dollar</option><option value="EUR">EUR — Euro</option><option value="GBP">GBP — Pound Sterling</option><option value="NGN">NGN — Naira</option><option value="CAD">CAD — Canadian Dollar</option><option value="AUD">AUD — Australian Dollar</option><option value="INR">INR — Indian Rupee</option><option value="GHS">GHS — Ghanaian Cedi</option><option value="KES">KES — Kenyan Shilling</option><option value="ZAR">ZAR — South African Rand</option><option value="JPY">JPY — Japanese Yen</option></select></label>
          <Field label="Discount %" value={discount} onChange={setDiscount} />
          <label className="block space-y-1"><span className="text-sm font-medium">Optional logo (stays on this device)</span><input className="w-full rounded-lg border bg-background px-3 py-2" type="file" accept="image/png,image/jpeg" onChange={(event) => { const file = event.target.files?.[0]; if (!file) { setLogoDataUrl(""); return; } if (file.size > 2 * 1024 * 1024) { setCopyMessage("Logo must be 2 MB or smaller."); event.target.value = ""; return; } const reader = new FileReader(); reader.onload = () => setLogoDataUrl(typeof reader.result === "string" ? reader.result : ""); reader.readAsDataURL(file); }} /></label>
        </div>
        <div className="space-y-3 rounded-xl border p-4"><div className="flex items-center justify-between gap-3"><h3 className="font-semibold">Line items</h3><button type="button" className="rounded-lg border px-3 py-2 text-sm" onClick={() => setLineItems((items) => [...items, { description: "", quantity: "1", unitPrice: "0" }])}>Add line item</button></div>
          {lineItems.map((item, index) => <div key={index} className="grid gap-2 rounded-lg border p-3 sm:grid-cols-[minmax(0,2fr)_minmax(5rem,1fr)_minmax(7rem,1fr)_auto]"><label className="block space-y-1"><span className="text-xs font-medium">Description</span><input className="w-full rounded-lg border bg-background px-3 py-2" value={item.description} onChange={(event) => setLineItems((items) => items.map((row, i) => i === index ? { ...row, description: event.target.value } : row))} /></label><label className="block space-y-1"><span className="text-xs font-medium">Qty</span><input className="w-full rounded-lg border bg-background px-3 py-2" type="number" min="0" step="1" value={item.quantity} onChange={(event) => setLineItems((items) => items.map((row, i) => i === index ? { ...row, quantity: event.target.value } : row))} /></label><label className="block space-y-1"><span className="text-xs font-medium">Unit price</span><input className="w-full rounded-lg border bg-background px-3 py-2" type="number" min="0" step="0.01" value={item.unitPrice} onChange={(event) => setLineItems((items) => items.map((row, i) => i === index ? { ...row, unitPrice: event.target.value } : row))} /></label><button type="button" disabled={lineItems.length === 1} className="self-end rounded-lg border px-3 py-2 text-sm disabled:opacity-40" onClick={() => setLineItems((items) => items.filter((_, i) => i !== index))} aria-label={`Remove line item ${index + 1}`}>Remove</button></div>)}
        </div>
        <div className="rounded-2xl border bg-muted/20 p-6" id="business-document">
          <div className="flex items-start justify-between gap-4">
            <div>
              {logoDataUrl ? <img src={logoDataUrl} alt="Business logo" className="mb-3 max-h-16 max-w-40 object-contain" /> : null}
              <h2 className="text-2xl font-bold">{title}</h2>
              <p className="text-muted-foreground">{company}</p>
            </div>
            <div className="text-right text-sm">
              <div>{invoiceNo}</div>
              <div>{documentDate}</div>
            </div>
          </div>
          <div className="my-6"><b>{op.startsWith("receipt") ? "Received from:" : op.startsWith("quotation") || op.startsWith("estimate") ? "Prepared for:" : op.startsWith("purchase-order") ? "Supplier:" : "Bill to:"}</b> {client}</div>
          <div className="grid grid-cols-[1fr_auto_auto] gap-3 border-b pb-2 font-medium">
            <span>Description</span><span>Qty</span><span>Total</span>
          </div>
          {lineItems.map((item, index) => <div key={index} className="grid grid-cols-[1fr_auto_auto] gap-3 border-b py-3 text-sm"><span>{item.description || "—"}</span><span>{Math.max(0, num(item.quantity))}</span><span>{currency} {money(Math.max(0, num(item.quantity)) * Math.max(0, num(item.unitPrice)))}</span></div>)}
          <div className="ml-auto max-w-xs space-y-2 border-t pt-3 text-sm">
            <div className="flex justify-between"><span>Subtotal</span><b>{currency} {money(subtotal)}</b></div>
            <div className="flex justify-between"><span>Discount</span><b>−{currency} {money(documentTotals.discount)}</b></div>
            <div className="flex justify-between"><span>Tax ({money(documentTotals.taxRatePct)}%)</span><b>{currency} {money(documentTotals.tax)}</b></div>
            <div className="flex justify-between text-lg"><span>Total</span><b>{currency} {money(total)}</b></div>
          </div>
        </div>
        <div className="flex flex-wrap gap-2 print:hidden">
          <button type="button" onClick={print} className="rounded-lg border px-4 py-2">Print</button>
          <button type="button" onClick={() => {
            const lines = [title, `Business: ${company}`, `${op.startsWith("receipt") ? "Received from" : op.startsWith("quotation") || op.startsWith("estimate") ? "Prepared for" : op.startsWith("purchase-order") ? "Supplier" : "Bill to / recipient"}: ${client}`, `Document number: ${invoiceNo}`, `Date: ${documentDate}`, "", "Items:", ...lineItems.map((item, index) => `${index + 1}. ${item.description || "Item"} | Qty ${Math.max(0, num(item.quantity))} | Unit ${currency} ${money(Math.max(0, num(item.unitPrice)))} | Line ${currency} ${money(Math.max(0, num(item.quantity)) * Math.max(0, num(item.unitPrice)))}`), "", `Subtotal: ${currency} ${money(subtotal)}`, `Discount (${documentTotals.discountRatePct}%): ${currency} ${money(documentTotals.discount)}`, `Tax (${documentTotals.taxRatePct}%): ${currency} ${money(documentTotals.tax)}`, `TOTAL: ${currency} ${money(total)}`];
            return void downloadBusinessPdf(title, lines, `${safeFilename(invoiceNo || title)}.pdf`, logoDataUrl).catch(() => setCopyMessage("PDF download failed. Please try Print instead."));
          }} className="rounded-lg bg-primary px-4 py-2 text-primary-foreground">Download PDF</button>
        </div>
        {copyMessage ? <p role="status" className="text-sm text-muted-foreground">{copyMessage}</p> : null}
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <BusinessStudioTabs op={op} onLoadExample={loadExample} />
      <div className="rounded-lg border p-3 text-sm text-muted-foreground">Privacy-first: calculations run locally in this page. Inputs are not uploaded by this Studio. Results are illustrative estimates, not accounting, tax, legal, or investment advice.</div>
      <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
        {op === "break-even" ? <><Field label="Fixed costs" value={b} onChange={setB} /><Field label="Selling price per unit" value={a} onChange={setA} /><Field label="Variable cost per unit" value={c} onChange={setC} /><Field label="Target profit (optional)" value={targetProfit} onChange={setTargetProfit} /></> : op === "commission" ? <><Field label="Sales amount" value={a} onChange={setA} /><Field label="Commission rate (%)" value={b} onChange={setB} /></> : op === "customer-acquisition-cost" ? <><Field label="Customer acquisition spend" value={a} onChange={setA} /><Field label="New customers acquired" value={b} onChange={setB} step="1" /><Field label="Customer lifetime value (optional)" value={d} onChange={setD} /><Field label="Monthly contribution per new customer (optional)" value={monthlyContribution} onChange={setMonthlyContribution} /></> : op === "customer-lifetime-value" ? <><div className="md:col-span-2"><span className="mb-2 block text-sm font-medium">LTV model</span><div className="flex flex-wrap gap-2"><button type="button" aria-pressed={ltvModel === "simple"} onClick={() => setLtvModel("simple")} className={`min-h-10 rounded-lg border px-3 py-2 text-sm ${ltvModel === "simple" ? "border-primary bg-primary/10 font-semibold" : ""}`}>Simple / commerce</button><button type="button" aria-pressed={ltvModel === "saas"} onClick={() => setLtvModel("saas")} className={`min-h-10 rounded-lg border px-3 py-2 text-sm ${ltvModel === "saas" ? "border-primary bg-primary/10 font-semibold" : ""}`}>SaaS / subscription</button></div></div>{ltvModel === "simple" ? <><Field label="Average order value" value={a} onChange={setA} /><Field label="Purchases per period" value={b} onChange={setB} /><Field label="Customer lifespan (periods)" value={c} onChange={setC} /></> : <><Field label="Monthly ARPU (average revenue per account)" value={a} onChange={setA} /><Field label="Gross margin (%)" value={grossMarginPct} onChange={setGrossMarginPct} /><Field label="Monthly customer churn (%)" value={monthlyChurnPct} onChange={setMonthlyChurnPct} /></>}<Field label="Customer acquisition cost (optional)" value={d} onChange={setD} />{ltvModel === "simple" ? <Field label="Monthly contribution per customer (optional)" value={monthlyContribution} onChange={setMonthlyContribution} /> : <p className="text-sm text-muted-foreground">Payback uses monthly ARPU × gross margin. Lifetime value requires a monthly churn rate above 0%.</p>}</> : op === "cash-flow" ? <><Field label="Cash inflows" value={a} onChange={setA} /><Field label="Cash outflows" value={b} onChange={setB} /><Field label="Opening cash balance" value={c} onChange={setC} /></> : op === "roi" ? <><Field label="Total value received (before subtracting investment)" value={a} onChange={setA} /><Field label="Initial investment" value={b} onChange={setB} /></> : op === "salary" ? <><Field label="Gross annual salary" value={a} onChange={setA} /></> : ["pricing", "markup"].includes(op) ? <><Field label="Unit cost" value={a} onChange={setA} /><Field label="Markup rate (%)" value={b} onChange={setB} /></> : ["margin", "profit"].includes(op) ? <><Field label="Revenue" value={a} onChange={setA} /><Field label="Total costs" value={b} onChange={setB} /></> : op === "discount" ? <><Field label="Original price" value={a} onChange={setA} /><Field label="Discount rate (%)" value={b} onChange={setB} /></> : op === "recurring-revenue" ? <><Field label="Monthly recurring revenue (MRR)" value={a} onChange={setA} /><Field label="Annual growth rate (%)" value={b} onChange={setB} /></> : op === "inventory" ? <><Field label="Units in stock" value={a} onChange={setA} step="1" /><Field label="Cost per unit" value={b} onChange={setB} /><Field label="Reorder quantity" value={c} onChange={setC} step="1" /></> : op === "expense" ? <><Field label="Operating expenses" value={a} onChange={setA} /><Field label="Payroll" value={b} onChange={setB} /><Field label="Marketing" value={c} onChange={setC} /><Field label="Software / tools" value={d} onChange={setD} /><Field label="Other expenses" value={e} onChange={setE} /></> : <><Field label="Revenue / amount" value={a} onChange={setA} /><Field label="Cost / investment" value={b} onChange={setB} /><Field label="Rate / variable cost" value={c} onChange={setC} /><Field label="Additional value" value={d} onChange={setD} /><Field label="Additional value" value={e} onChange={setE} /></>}
      </div>
      <BusinessPrintStyles />
      <div id="business-calculation-results" className="space-y-4">
        <h2 className="text-xl font-semibold">{title} results</h2>
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
      <div className="flex flex-wrap gap-2 print:hidden">
        <button type="button" onClick={print} className="rounded-lg border px-4 py-2">Print results</button>
        <button type="button" onClick={() => void downloadBusinessPdf(title, [title, ...calculation.metrics.map((metric) => `${metric.label}: ${metric.value}${metric.note ? ` (${metric.note})` : ""}`), "", `Formula / method: ${calculation.formula}`, "", "Illustrative estimate only; not accounting, tax, legal, or investment advice."], `${safeFilename(title)}-results.pdf`).catch(() => setCopyMessage("PDF download failed. Please try Print instead."))} className="rounded-lg bg-primary px-4 py-2 text-primary-foreground">Download results PDF</button>
      </div>
      {copyMessage ? <p role="status" className="text-sm text-muted-foreground">{copyMessage}</p> : null}
    </div>
  );
}
