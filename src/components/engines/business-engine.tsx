import { useMemo, useState } from "react";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import type { ToolMeta } from "@/types/tool";

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
const BusinessPrintStyles = () => <style>{`@media print { body * { visibility: hidden !important; } #business-document, #business-document *, #business-payslip, #business-payslip *, #business-calculation-results, #business-calculation-results * { visibility: visible !important; } #business-document, #business-payslip, #business-calculation-results { position: absolute !important; left: 0 !important; top: 0 !important; width: 100% !important; border: 0 !important; background: #fff !important; color: #111 !important; box-shadow: none !important; } }`}</style>;

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
  const [attendees, setAttendees] = useState("Team");
  const [meetingGoal, setMeetingGoal] = useState("Weekly planning");
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
        const fixedCosts = Math.max(0, B);
        const target = Math.max(0, num(targetProfit));
        const possible = A > C && A > 0 && C >= 0;
        const units = possible ? Math.ceil((fixedCosts + target) / unitMargin) : 0;
        return {
          metrics: [
            { label: "Break-even units", value: possible ? Math.ceil(fixedCosts / unitMargin).toLocaleString() : "Not possible", note: possible ? "Rounded up to a whole unit" : "Selling price must exceed variable cost" },
            { label: "Break-even revenue", value: possible ? money(Math.ceil(fixedCosts / unitMargin) * A) : "—", note: "Revenue at the rounded-up whole-unit break-even point" },
            { label: "Contribution margin ratio", value: possible ? `${((unitMargin / A) * 100).toFixed(2)}%` : "—", note: "Contribution per unit ÷ selling price" },
            { label: "Units for target profit", value: possible ? units.toLocaleString() : "—", note: target > 0 ? `Target profit: ${money(target)}` : "Set a target profit to model a goal" },
            { label: "Contribution margin / unit", value: possible ? money(unitMargin) : "—" },
          ],
          formula: "Break-even units = Fixed costs ÷ (Selling price/unit − Variable cost/unit). Target-profit units = (Fixed costs + target profit) ÷ contribution/unit. Units are rounded up; model is a single-product estimate.",
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
      case "customer-lifetime-value": {
        const ltv = A * B * C;
        const ratio = D > 0 ? ltv / D : 0;
        const payback = num(monthlyContribution) > 0 && D > 0 ? D / num(monthlyContribution) : 0;
        const health = D <= 0 ? "Add CAC to evaluate acquisition efficiency" : ratio < 1 ? "Below 1×: value does not cover acquisition cost" : ratio < 3 ? "1–3×: weak; review unit economics" : ratio < 5 ? "3–5×: commonly used as a planning band" : ">5×: strong ratio; validate retention and margin assumptions";
        return {
          metrics: [
            { label: "Customer lifetime value", value: money(ltv), note: "Revenue-based estimate before gross margin unless adjusted separately" },
            { label: "LTV:CAC", value: D > 0 ? `${ratio.toFixed(2)}×` : "—", note: health },
            { label: "CAC payback", value: payback > 0 ? `${payback.toFixed(1)} months` : "—", note: payback > 0 ? "CAC ÷ monthly contribution per customer" : "Add positive monthly contribution and CAC" },
          ],
          formula: "Revenue-based LTV = average order value × purchases per period × lifespan. Payback months = CAC ÷ monthly contribution per acquired customer. Align periods and use contribution (not revenue) for payback.",
        };
      }
      case "customer-acquisition-cost": {
        const cac = A > 0 && B > 0 ? A / B : 0;
        const ratio = cac > 0 && D > 0 ? D / cac : 0;
        const health = D <= 0 || cac <= 0 ? "Add valid positive LTV and CAC inputs" : ratio < 1 ? "Below 1×: LTV does not cover acquisition cost" : ratio < 3 ? "1–3×: weak; review acquisition efficiency" : ratio < 5 ? "3–5×: commonly used as a planning band" : ">5×: strong ratio; check growth and retention assumptions";
        const payback = num(monthlyContribution) > 0 && cac > 0 ? cac / num(monthlyContribution) : 0;
        return {
          metrics: [
            { label: "Customer acquisition cost (CAC)", value: cac > 0 ? money(cac) : "—", note: "Acquisition spend ÷ new customers" },
            { label: "LTV:CAC ratio", value: ratio > 0 ? `${ratio.toFixed(2)}×` : "—", note: health },
            { label: "CAC payback", value: payback > 0 ? `${payback.toFixed(1)} months` : "—", note: payback > 0 ? "CAC ÷ monthly contribution per new customer" : "Enter positive monthly contribution to estimate payback" },
          ],
          formula: "CAC = acquisition spend ÷ new customers. LTV:CAC = lifetime value ÷ CAC. Payback months = CAC ÷ monthly contribution per new customer. Ratio bands are directional planning heuristics, not universal benchmarks.",
        };
      }
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
  }, [op, A, B, C, D, E, targetProfit, monthlyContribution]);

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
              : (op === "agenda" || op === "meeting-agenda")
                ? [
                    "MEETING AGENDA",
                    `Title: ${meetingTitle || meetingGoal}`,
                    `Date/time: ${meetingDateTime || "Not set"}`,
                    `Location/link: ${meetingLocation || "Not set"}`,
                    `Goal: ${meetingGoal}`,
                    `Attendees: ${attendees}`,
                    "",
                    "1. Welcome & objectives (5 min)",
                    `2. ${meetingGoal} (15 min)`,
                    "3. Progress updates (10 min)",
                    "4. Decisions & blockers (10 min)",
                    "5. Owners and next steps (5 min)",
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
                      `Action items (owner · task · due date):\n${actionItems || "- Owner — Task — Due date"}`,
                      `Next meeting: ${nextMeeting || "Not scheduled"}`,
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
          {["agenda", "minutes", "meeting-agenda", "meeting-minutes"].includes(op) ? (
            <>
              <TextField label="Meeting title" value={meetingTitle} onChange={setMeetingTitle} />
              <TextField label="Meeting goal" value={meetingGoal} onChange={setMeetingGoal} />
              <TextField label="Date and time" value={meetingDateTime} onChange={setMeetingDateTime} />
              <TextField label="Location or meeting link" value={meetingLocation} onChange={setMeetingLocation} />
              <TextField label="Attendees" value={attendees} onChange={setAttendees} />
              {["agenda", "meeting-agenda"].includes(op) ? <TextField label="Preparation notes" value={prepNotes} onChange={setPrepNotes} /> : null}
              {["minutes", "meeting-minutes"].includes(op) ? <>
                <label className="block space-y-1"><span className="text-sm font-medium">Discussion notes</span><textarea className="w-full rounded-lg border bg-background px-3 py-2" rows={3} value={discussionNotes} onChange={(event) => setDiscussionNotes(event.target.value)} /></label>
                <label className="block space-y-1"><span className="text-sm font-medium">Decisions and rationale</span><textarea className="w-full rounded-lg border bg-background px-3 py-2" rows={2} value={decisions} onChange={(event) => setDecisions(event.target.value)} /></label>
                <label className="block space-y-1"><span className="text-sm font-medium">Action items (owner · task · due date)</span><textarea className="w-full rounded-lg border bg-background px-3 py-2" rows={3} value={actionItems} onChange={(event) => setActionItems(event.target.value)} /></label>
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
        <div className="rounded-2xl border p-5">
          <div className="mb-3 text-sm font-medium">Generated {title}</div>
          <pre className="whitespace-pre-wrap text-sm leading-6">{output}</pre>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => void copy(output)} className="rounded-lg bg-primary px-4 py-2 text-primary-foreground">Copy output</button>
          {op === "email-signature" ? <button type="button" onClick={() => void copy(signatureHtml)} className="rounded-lg border px-4 py-2">Copy email-safe HTML</button> : null}
        </div>
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
        <div className="flex flex-wrap gap-2 print:hidden">
          <button type="button" onClick={print} className="rounded-lg border px-4 py-2">Print</button>
          <button type="button" onClick={() => void downloadBusinessPdf("Payslip - DEMO", ["Payslip - DEMO", `Employer: ${company}`, `Employee: ${client}`, `Pay period: ${invoiceNo}`, `Gross pay: ${money(gross)}`, `Tax / statutory deductions: ${money(Math.max(0, B))}`, `Other deductions: ${money(Math.max(0, C))}`, `Net pay: ${money(gross - deductions)}`, "DEMO ONLY - verify local payroll, tax, and statutory requirements."], `${safeFilename(client)}-payslip-demo.pdf`).catch(() => setCopyMessage("PDF download failed. Please try Print instead."))} className="rounded-lg bg-primary px-4 py-2 text-primary-foreground">Download PDF</button>
        </div>
        {copyMessage ? <p role="status" className="text-sm text-muted-foreground">{copyMessage}</p> : null}
      </div>
    );
  }
  if (isDocument) {
    const subtotal = lineItems.reduce((sum, item) => sum + Math.max(0, num(item.quantity)) * Math.max(0, num(item.unitPrice)), 0);
    const discounted = subtotal * (1 - Math.min(100, Math.max(0, Disc)) / 100);
    const total = discounted * (1 + Math.max(0, T) / 100);
    return (
      <div className="space-y-5">
        <BusinessPrintStyles />
        <div className="rounded-lg border p-3 text-sm text-muted-foreground">Privacy: document details are processed in this page and are not uploaded by this tool. Avoid entering sensitive data on a shared device.</div>
        <div className="grid gap-3 md:grid-cols-2">
          <TextField label="Business name" value={company} onChange={setCompany} />
          <TextField label="Client / recipient" value={client} onChange={setClient} />
          <TextField label="Document number" value={invoiceNo} onChange={setInvoiceNo} />
          <TextField label="Document date" value={documentDate} onChange={setDocumentDate} />
          <Field label="Tax %" value={tax} onChange={setTax} />
          <label className="block space-y-1"><span className="text-sm font-medium">Currency</span><select className="w-full rounded-lg border bg-background px-3 py-2" value={currency} onChange={(event) => setCurrency(event.target.value)}><option value="USD">USD — US Dollar</option><option value="EUR">EUR — Euro</option><option value="GBP">GBP — Pound Sterling</option><option value="NGN">NGN — Naira</option><option value="CAD">CAD — Canadian Dollar</option><option value="AUD">AUD — Australian Dollar</option><option value="INR">INR — Indian Rupee</option></select></label>
          <Field label="Discount %" value={discount} onChange={setDiscount} />
          <label className="block space-y-1"><span className="text-sm font-medium">Optional logo (stays on this device)</span><input className="w-full rounded-lg border bg-background px-3 py-2" type="file" accept="image/*" onChange={(event) => { const file = event.target.files?.[0]; if (!file) { setLogoDataUrl(""); return; } if (file.size > 2 * 1024 * 1024) { setCopyMessage("Logo must be 2 MB or smaller."); event.target.value = ""; return; } const reader = new FileReader(); reader.onload = () => setLogoDataUrl(typeof reader.result === "string" ? reader.result : ""); reader.readAsDataURL(file); }} /></label>
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
          <div className="my-6"><b>Bill to:</b> {client}</div>
          <div className="grid grid-cols-[1fr_auto_auto] gap-3 border-b pb-2 font-medium">
            <span>Description</span><span>Qty</span><span>Total</span>
          </div>
          {lineItems.map((item, index) => <div key={index} className="grid grid-cols-[1fr_auto_auto] gap-3 border-b py-3 text-sm"><span>{item.description || "—"}</span><span>{Math.max(0, num(item.quantity))}</span><span>{currency} {money(Math.max(0, num(item.quantity)) * Math.max(0, num(item.unitPrice)))}</span></div>)}
          <div className="ml-auto max-w-xs space-y-2 border-t pt-3 text-sm">
            <div className="flex justify-between"><span>Subtotal</span><b>{currency} {money(subtotal)}</b></div>
            <div className="flex justify-between"><span>Discount</span><b>−{currency} {money(subtotal * Math.min(100, Math.max(0, Disc)) / 100)}</b></div>
            <div className="flex justify-between"><span>Tax</span><b>{currency} {money(discounted * Math.max(0, T) / 100)}</b></div>
            <div className="flex justify-between text-lg"><span>Total</span><b>{currency} {money(total)}</b></div>
          </div>
        </div>
        <div className="flex flex-wrap gap-2 print:hidden">
          <button type="button" onClick={print} className="rounded-lg border px-4 py-2">Print</button>
          <button type="button" onClick={() => {
            const lines = [title, `Business: ${company}`, `Client / recipient: ${client}`, `Document number: ${invoiceNo}`, `Date: ${documentDate}`, "", "Items:", ...lineItems.map((item, index) => `${index + 1}. ${item.description || "Item"} | Qty ${Math.max(0, num(item.quantity))} | Unit ${currency} ${money(Math.max(0, num(item.unitPrice)))} | Line ${currency} ${money(Math.max(0, num(item.quantity)) * Math.max(0, num(item.unitPrice)))}`), "", `Subtotal: ${currency} ${money(subtotal)}`, `Discount (${Math.min(100, Math.max(0, Disc))}%): ${currency} ${money(subtotal * Math.min(100, Math.max(0, Disc)) / 100)}`, `Tax (${Math.max(0, T)}%): ${currency} ${money(discounted * Math.max(0, T) / 100)}`, `TOTAL: ${currency} ${money(total)}`];
            return void downloadBusinessPdf(title, lines, `${safeFilename(invoiceNo || title)}.pdf`, logoDataUrl).catch(() => setCopyMessage("PDF download failed. Please try Print instead."));
          }} className="rounded-lg bg-primary px-4 py-2 text-primary-foreground">Download PDF</button>
        </div>
        {copyMessage ? <p role="status" className="text-sm text-muted-foreground">{copyMessage}</p> : null}
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
        {op === "break-even" ? <><Field label="Fixed costs" value={b} onChange={setB} /><Field label="Selling price per unit" value={a} onChange={setA} /><Field label="Variable cost per unit" value={c} onChange={setC} /><Field label="Target profit (optional)" value={targetProfit} onChange={setTargetProfit} /></> : op === "commission" ? <><Field label="Sales amount" value={a} onChange={setA} /><Field label="Commission rate (%)" value={b} onChange={setB} /></> : op === "customer-acquisition-cost" ? <><Field label="Customer acquisition spend" value={a} onChange={setA} /><Field label="New customers acquired" value={b} onChange={setB} step="1" /><Field label="Customer lifetime value (optional)" value={d} onChange={setD} /><Field label="Monthly contribution per new customer (optional)" value={monthlyContribution} onChange={setMonthlyContribution} /></> : op === "customer-lifetime-value" ? <><Field label="Average order value" value={a} onChange={setA} /><Field label="Purchases per customer / period" value={b} onChange={setB} /><Field label="Customer lifespan (periods)" value={c} onChange={setC} /><Field label="Customer acquisition cost (optional)" value={d} onChange={setD} /><Field label="Monthly contribution per customer (optional)" value={monthlyContribution} onChange={setMonthlyContribution} /></> : op === "cash-flow" ? <><Field label="Cash inflows" value={a} onChange={setA} /><Field label="Cash outflows" value={b} onChange={setB} /><Field label="Opening cash balance" value={c} onChange={setC} /></> : op === "roi" ? <><Field label="Total value received (before subtracting investment)" value={a} onChange={setA} /><Field label="Initial investment" value={b} onChange={setB} /></> : op === "salary" ? <><Field label="Gross annual salary" value={a} onChange={setA} /></> : ["pricing", "markup"].includes(op) ? <><Field label="Unit cost" value={a} onChange={setA} /><Field label="Markup rate (%)" value={b} onChange={setB} /></> : ["margin", "profit"].includes(op) ? <><Field label="Revenue" value={a} onChange={setA} /><Field label="Total costs" value={b} onChange={setB} /></> : op === "discount" ? <><Field label="Original price" value={a} onChange={setA} /><Field label="Discount rate (%)" value={b} onChange={setB} /></> : op === "recurring-revenue" ? <><Field label="Monthly recurring revenue (MRR)" value={a} onChange={setA} /><Field label="Annual growth rate (%)" value={b} onChange={setB} /></> : op === "inventory" ? <><Field label="Units in stock" value={a} onChange={setA} step="1" /><Field label="Cost per unit" value={b} onChange={setB} /><Field label="Reorder quantity" value={c} onChange={setC} step="1" /></> : op === "expense" ? <><Field label="Operating expenses" value={a} onChange={setA} /><Field label="Payroll" value={b} onChange={setB} /><Field label="Marketing" value={c} onChange={setC} /><Field label="Software / tools" value={d} onChange={setD} /><Field label="Other expenses" value={e} onChange={setE} /></> : <><Field label="Revenue / amount" value={a} onChange={setA} /><Field label="Cost / investment" value={b} onChange={setB} /><Field label="Rate / variable cost" value={c} onChange={setC} /><Field label="Additional value" value={d} onChange={setD} /><Field label="Additional value" value={e} onChange={setE} /></>}
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
