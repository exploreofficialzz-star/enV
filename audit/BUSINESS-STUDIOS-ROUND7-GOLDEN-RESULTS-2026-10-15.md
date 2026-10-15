# Business Studios Round 7 — golden results

These are deterministic fixtures for formula regressions, not a claim of production certification.

| Fixture | Inputs | Expected / verified result |
|---|---|---|
| Invoice subtotal | 3 items at quantity 1, unit price 250 (equivalent subtotal 750) | Subtotal 750.00; at 7.5% tax and no discount total 806.25. |
| Commission | Sales 50,000; rate 8% | 4,000.00. |
| Break-even | Fixed costs 10,000; price 50/unit; variable cost 30/unit | Contribution 20; break-even 500 whole units; break-even revenue 25,000. |
| Break-even target | Same economics; target profit 5,000 | 750 whole units. |
| Impossible break-even | Price 10; variable cost 15 | Explicit invalid/impossible result; no fictitious units. |
| CAC | Acquisition spend 5,000; 100 new customers | CAC 50.00 per customer. |
| Simple commerce LTV | AOV 50; 12 purchases/period units; 24 periods | Revenue-based LTV 14,400 (before gross margin). |
| SaaS gross-profit LTV | ARPU 50/month; margin 80%; churn 5%/month | LTV 800.00 under constant-churn assumptions. |
| LTV:CAC and payback | SaaS LTV 800; CAC 100; monthly contribution 40 | LTV:CAC 8.00×; payback 2.5 months. |
| LTV:CAC bands | Ratios 0.99×, 1×, 2.99×, 3×, 5×, 5.01× | Below 1×; 1–3×; 1–3×; 3–5×; 3–5×; >5× respectively. |
| Zero churn | SaaS model, churn 0% | Explicit “not finite” warning; no false finite LTV claim. |
| Cash flow | Opening 1,000; inflows 900; outflows 650 | Net cash flow 250; ending cash 1,250. |
| Expense normalization | 100, −200, 300, 0, 20 | Negative expense treated as zero; total 420; average over five lines 84. |
| Recurring revenue | MRR −100; annual growth −15% | MRR 0; ARR 0; negative growth is displayed as contraction, not clamped. |
| Discount bounds | Price 100; rate 150% | Rate bounded to 100%; discount 100; final price 0. |
| ROI zero-investment edge | Initial investment 0 | No division-by-zero percentage is invented. |
| Margin zero-revenue edge | Revenue 0; cost 10 | Margin shown undefined (`—`). |
| Document empty row | Blank description; quantity 1; price 0 | No phantom service line; subtotal and total remain 0. |
| Naming | “solar energy”, 4 styles | Broad/deduplicated paged suggestions; styles differ; filters apply; “More” produces a separate page. Web/Android/iOS link outward to a registrar without availability badges; heuristic domain/TM/social/cultural checks are not claimed. |
| SKU | Seed `TEC` | Sequential codes `TEC-001` and onward, with page offsets and no duplicate within a page. |
| Agenda | `Metrics review | 10` and `Decision log | 20` | Structured agenda and 30-minute timing total. |
| Native Studio operation override | Invoice anchor + sales 50,000 and rate 8%, operation override `commission` | Kotlin and Swift engines return Commission 4,000.00 and do not return invoice subtotal; proves mode chips select the intended engine operation. |
| Email signature | Name/email/company fields | HTML-safe local output; user must verify client-specific rendering. |

**Pass evidence:** `src/lib/engines/business-studios.test.ts` and `src/lib/business-studios-catalog.test.ts` pass 12/12; Kotlin and Swift engine runtime fixtures pass with lightweight model stubs. App-level Gradle/XCTest suites still require their native toolchains.
