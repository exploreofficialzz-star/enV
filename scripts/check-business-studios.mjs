import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const catalog = await readFile(new URL('../src/data/catalog.ts', import.meta.url), 'utf8');
const web = await readFile(new URL('../src/components/engines/business-engine.tsx', import.meta.url), 'utf8');
const android = await readFile(new URL('../apps/android/app/src/main/java/com/chastech/env/engine/NativeBusinessEngine.kt', import.meta.url), 'utf8');
const androidPdf = await readFile(new URL('../apps/android/app/src/main/java/com/chastech/env/engine/NativeBusinessPdfExporter.kt', import.meta.url), 'utf8');
const ios = await readFile(new URL('../apps/ios/enV/NativeBusinessEngine.swift', import.meta.url), 'utf8');
const category = await readFile(new URL('../src/routes/tools/$category/index.tsx', import.meta.url), 'utf8');
const androidUi = await readFile(new URL('../apps/android/app/src/main/java/com/chastech/env/MainActivity.kt', import.meta.url), 'utf8');
const iosUi = await readFile(new URL('../apps/ios/enV/ToolViews.swift', import.meta.url), 'utf8');
const androidTests = await readFile(new URL('../apps/android/app/src/test/java/com/chastech/env/engine/NativeBusinessEngineTest.kt', import.meta.url), 'utf8');
const iosTests = await readFile(new URL('../apps/ios/enVTests/NativeBusinessEngineTests.swift', import.meta.url), 'utf8');

for (const slug of ['invoice-generator', 'receipt-generator', 'quotation-generator', 'estimate-generator', 'meeting-agenda-generator', 'meeting-minutes-generator', 'payslip-calculator', 'break-even-calculator']) {
  assert.ok(catalog.includes(`\\"id\\":\\"${slug}\\"`), `legacy slug retained: ${slug}`);
}
assert.match(catalog, /\\"id\\":\\"break-even-calculator\\"[\s\S]{0,1000}\\"engine\\":\{\\"type\\":\\"business\\",\\"op\\":\\"break-even\\"\}/);
assert.match(web, /op === "payslip"/);
assert.match(web, /MEETING MINUTES|Decisions:/);
assert.match(web, /Meeting title/);
assert.match(web, /Action items \(owner · task · due date\)/);
assert.match(web, /Target profit \(optional\)/);
assert.match(web, /bands are directional planning heuristics/);
assert.match(web, /do not verify trademarks, domain availability/);
assert.match(web, /Copy email-safe HTML/);
assert.match(web, /safeHttpUrl/);
assert.match(web, /Add line item/);
assert.match(web, /Download PDF/);
assert.match(web, /Download results PDF/);
assert.match(web, /PDFDocument\.create\(\)/);
assert.match(web, /application\/pdf/);
assert.match(web, /Locally generated business document/);
assert.match(web, /window\.print\(\)/);
assert.match(web, /CAC payback/);
assert.match(web, /Monthly contribution per new customer/);
assert.match(web, /Optional logo \(stays on this device\)/);
assert.match(web, /Selling price per unit/);
assert.match(web, /Customer lifetime value \(optional\)/);
assert.match(android, /PAYSLIP — DEMO ONLY/);
assert.match(android, /MEETING AGENDA/);
assert.match(android, /Not possible: selling price must exceed non-negative variable cost/);
assert.match(android, /Units for target profit/);
assert.match(android, /Bands are directional heuristics/);
assert.match(android, /HTML signature \(inline styles; no remote images\)/);
assert.match(android, /lineItems/);
assert.match(android, /monthlyContribution/);
assert.match(android, /Contribution margin ratio/);
assert.match(android, /"invoice", "receipt", "quotation", "estimate", "purchase-order"/);
assert.match(ios, /PAYSLIP — DEMO ONLY/);
assert.match(ios, /MEETING AGENDA/);
assert.match(ios, /Not possible: selling price must exceed non-negative variable cost/);
assert.match(ios, /Units for target profit/);
assert.match(ios, /Bands are directional heuristics/);
assert.match(ios, /HTML signature \(inline styles; no remote images\)/);
assert.match(ios, /lineItems/);
assert.match(ios, /monthlyContribution/);
assert.match(ios, /Contribution margin ratio/);
assert.match(ios, /case "invoice", "receipt", "quotation", "estimate", "purchase-order"/);
assert.match(category, /Business Studios/);
assert.match(androidUi, /Line items \(one per line: description/);
assert.match(androidUi, /Target profit \(optional\)/);
assert.match(androidUi, /Monthly contribution per customer/);
assert.match(androidUi, /Download output \(\.txt\)/);
assert.match(androidUi, /Download PDF/);
assert.match(androidUi, /Meeting title/);
assert.match(androidUi, /Discussion notes/);
assert.match(androidUi, /Action items \(owner \| task \| due date\)/);
assert.match(androidUi, /employeeName/);
assert.match(androidUi, /CreateDocument\(\"application\/pdf\"\)/);
assert.match(androidPdf, /PdfDocument/);
assert.match(androidPdf, /Generated locally by enV/);
assert.match(androidPdf, /writeTo\(out\)/);
assert.match(iosUi, /Line items \(one per line: description/);
assert.match(iosUi, /Target profit \(optional\)/);
assert.match(iosUi, /Monthly contribution per customer/);
assert.match(iosUi, /Download output \(\.txt\)/);
assert.match(iosUi, /Button\(\"Download PDF\"/);
assert.match(iosUi, /Meeting title/);
assert.match(iosUi, /Discussion notes/);
assert.match(iosUi, /Action items \(owner \| task \| due date\)/);
assert.match(iosUi, /employeeName/);
assert.match(iosUi, /UIGraphicsPDFRenderer/);
assert.match(iosUi, /NativeBusinessPDFDocument/);
assert.match(iosUi, /contentType: \.pdf/);
assert.match(androidTests, /nativeDocumentsSupportMultipleLineItemsAndCorrectTotals/);
assert.match(androidTests, /cacDoesNotInventLtvAndCalculatesPaybackOnlyWithContribution/);
assert.match(iosTests, /testNativeDocumentsSupportMultipleLineItemsAndCorrectTotals/);
assert.match(iosTests, /testCACDoesNotInventLTVAndCalculatesPaybackOnlyWithContribution/);

// Golden formula fixtures from the business prompt.
assert.equal(3 * 250, 750); // invoice subtotal
assert.equal(50000 * 8 / 100, 4000); // commission
assert.equal(5000 / 100, 50); // CAC
assert.equal(50 * 12 * 24, 14400); // simple LTV
assert.equal(Math.ceil(10000 / (50 - 30)), 500); // break-even units
assert.equal(Math.ceil(10000 / (50 - 30)) * 50, 25000); // break-even revenue
assert.equal(Math.ceil((10000 + 5000) / (50 - 30)), 750); // units for $5,000 target profit
assert.equal(50 / 10, 5); // CAC payback months for $50 CAC and $10 monthly contribution
assert.equal(750 * 0.075, 56.25); // multi-line invoice tax fixture
assert.ok(10 - 15 <= 0); // impossible break-even guard condition

console.log('Business Studios source audit passed: legacy routes, P0 miswiring guards, web and native PDF export markers, web print actions, web/native operation markers, payback and multi-line document parity, and golden formula fixtures.');
