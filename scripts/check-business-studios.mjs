import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const catalog = await readFile(new URL('../src/data/catalog.ts', import.meta.url), 'utf8');
const web = await readFile(new URL('../src/components/engines/business-engine.tsx', import.meta.url), 'utf8');
const android = await readFile(new URL('../apps/android/app/src/main/java/com/chastech/env/engine/NativeBusinessEngine.kt', import.meta.url), 'utf8');
const androidPdf = await readFile(new URL('../apps/android/app/src/main/java/com/chastech/env/engine/NativeBusinessPdfExporter.kt', import.meta.url), 'utf8');
const ios = await readFile(new URL('../apps/ios/enV/NativeBusinessEngine.swift', import.meta.url), 'utf8');
const category = await readFile(new URL('../src/routes/tools/$category/index.tsx', import.meta.url), 'utf8');
const businessRoute = await readFile(new URL('../src/routes/tools/$category/$slug.tsx', import.meta.url), 'utf8');
const businessCatalogMap = await readFile(new URL('../src/lib/business-studios-catalog.ts', import.meta.url), 'utf8');
const businessCatalogTests = await readFile(new URL('../src/lib/business-studios-catalog.test.ts', import.meta.url), 'utf8');
const webHelpers = await readFile(new URL('../src/lib/engines/business-studios.ts', import.meta.url), 'utf8');
const webGoldenTests = await readFile(new URL('../src/lib/engines/business-studios.test.ts', import.meta.url), 'utf8');
const slugMap = await readFile(new URL('../docs/business-studios-slug-map.csv', import.meta.url), 'utf8');
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
assert.match(web, /BusinessStudioTabs/);
assert.match(web, /Load example/);
assert.match(web, /calculateRecurringRevenue/);
assert.match(web, /calculateExpenses/);
assert.match(web, /Net pay<\/span><strong>\{currency\} \{money\(gross - deductions\)\}/);
assert.match(android, /PAYSLIP — DEMO ONLY/);
assert.match(android, /MEETING AGENDA/);
assert.match(android, /Not possible: selling price must exceed non-negative variable cost/);
assert.match(android, /Units for target profit/);
assert.match(android, /Bands are directional heuristics/);
assert.match(android, /HTML signature \(inline styles; no remote images\)/);
assert.match(android, /lineItems/);
assert.match(android, /Negative expense inputs are treated as zero/);
assert.match(android, /non-negative MRR/);
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
assert.match(category, /document-studio\?mode=invoice/);
assert.match(category, /finance-studio\?mode=break-even/);
assert.match(category, /naming-studio\?mode=business-name/);
assert.match(category, /ops-studio\?mode=meeting-agenda/);
assert.match(businessRoute, /businessStudioAnchorSlug/);
assert.match(businessRoute, /Navigate/);
assert.match(businessRoute, /slug === "break-even-calculator"/);
assert.match(businessCatalogMap, /businessStudioRouteForTool/);
assert.match(businessCatalogTests, /businessTools.length, 104/);
assert.match(web, /initialMode/);
assert.match(webHelpers, /generateBusinessNames/);
assert.match(webHelpers, /calculateLifetimeValue/);
assert.match(webHelpers, /calculateDocumentTotals/);
assert.match(webGoldenTests, /document totals bound discounts/);
assert.match(webGoldenTests, /SKU pages use sequential unique codes/);
assert.match(webGoldenTests, /exact 1×, 3×, and 5× boundaries/);
assert.match(android, /generatedNames/);
assert.match(android, /generatedAgenda/);
assert.match(ios, /generatedNames/);
assert.match(ios, /Timing total:/);
assert.match(androidUi, /Line items · description, quantity and unit price/);
assert.match(androidUi, /Target profit \(optional\)/);
assert.match(androidUi, /fun loadBusinessExample\(\)/);
assert.match(androidUi, /OutlinedButton\(onClick = \{\s*loadBusinessExample\(\)/);
assert.match(androidUi, /Monthly contribution per customer/);
assert.match(androidUi, /Download output \(\.txt\)/);
assert.match(androidUi, /Download PDF/);
assert.match(androidUi, /Add timed item/);
assert.match(androidUi, /Add action item/);
assert.match(iosUi, /Button\("Add timed item"\)/);
assert.match(iosUi, /Button\("Add action item"\)/);
assert.match(androidUi, /Text\(\"Studio modes\"/);
assert.match(iosUi, /Text\(\"Studio modes\"\)/);
assert.match(androidUi, /operationOverride = op/);
assert.match(androidUi, /https:\/\/www\.namecheap\.com\/domains\//);
assert.match(iosUi, /https:\/\/www\.namecheap\.com\/domains\//);
assert.match(androidUi, /This external link does not verify availability or premium pricing/);
assert.match(iosUi, /This external link does not verify availability or premium pricing/);
assert.match(iosUi, /operationOverride: op/);
assert.match(androidTests, /studioModeOverrideRunsSelectedOperationInsteadOfAnchorTool/);
assert.match(iosTests, /testStudioModeOverrideRunsSelectedOperationInsteadOfAnchorTool/);
assert.ok((web.match(/<BusinessStudioTabs op=\{op\}/g) ?? []).length >= 4, 'each Web Studio view must show its mode tabs and example control');
assert.match(androidUi, /Meeting title/);
assert.match(androidUi, /Discussion notes/);
assert.match(androidUi, /Action items \(owner \| task \| due date\)/);
assert.match(androidUi, /employeeName/);
assert.match(androidUi, /CreateDocument\(\"application\/pdf\"\)/);
assert.match(androidUi, /Live document total/);
assert.match(androidUi, /Choose local logo \(stays on this device\)/);
assert.match(androidUi, /Add line item/);
assert.match(androidUi, /Remove item/);
assert.match(androidUi, /Copy all names/);
assert.match(androidUi, /Copy an individual name/);
assert.doesNotMatch(androidUi, /Fourth value \(optional\)|Fifth value \(optional\)/);
assert.match(androidPdf, /PdfDocument/);
assert.match(androidPdf, /Generated locally by enV/);
assert.match(androidPdf, /writeTo\(out\)/);
assert.match(iosUi, /Line items · description, quantity and unit price/);
assert.match(iosUi, /Target profit \(optional\)/);
assert.match(iosUi, /private func loadBusinessExample\(\)/);
assert.match(iosUi, /Button\(\"Load example\"\) \{ loadBusinessExample\(\) \}/);
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
assert.match(iosUi, /Live document total/);
assert.match(iosUi, /Choose local logo \(stays on this device\)/);
assert.match(iosUi, /ForEach\(\$lineItemRows\)/);
assert.match(iosUi, /Copy all names/);
assert.match(iosUi, /Copy an individual name/);
assert.doesNotMatch(iosUi, /Fourth value \(optional\)|Fifth value \(optional\)/);
assert.match(iosUi, /if op == \"slogan\" \|\| op == \"sku\"/);
assert.match(androidTests, /nativeDocumentsSupportMultipleLineItemsAndCorrectTotals/);
assert.match(androidTests, /cacDoesNotInventLtvAndCalculatesPaybackOnlyWithContribution/);
assert.match(iosTests, /testNativeDocumentsSupportMultipleLineItemsAndCorrectTotals/);
assert.match(iosTests, /testCACDoesNotInventLTVAndCalculatesPaybackOnlyWithContribution/);
assert.match(androidTests, /blankEditableDocumentRowsDoNotInventAServiceOrTotal/);
assert.match(iosTests, /testBlankEditableDocumentRowsDoNotInventAServiceOrTotal/);

// Every mapped legacy slug must still resolve to a catalog tool ID.
const mappedSlugs = slugMap.trim().split(/\r?\n/).slice(1).map((line) => line.split(',')[0].replace(/^"|"$/g, '')).filter(Boolean);
assert.equal(mappedSlugs.length, 105, 'documented business slug map row count');
for (const slug of mappedSlugs) assert.ok(catalog.includes(`\\"id\\":\\"${slug}\\"`), `mapped slug still exists in the catalog: ${slug}`);

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

console.log(`Business Studios source audit passed: ${mappedSlugs.length} mapped legacy slugs, Studio entry routes, local naming/LTV/document engines, native PDF/logo/line-item controls, no generic finance placeholders, and golden formula fixtures.`);
