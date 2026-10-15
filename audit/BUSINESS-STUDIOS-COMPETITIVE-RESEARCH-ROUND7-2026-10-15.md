# Business Studios — competitive research addendum, Round 7

**Research checked:** 15 October 2026. This is qualitative feature/review research; reviews are self-selected and product pages describe vendors' own features. It is not a statistically representative customer survey or a timed benchmark.

## 1. Bookkeeping/payment platforms: lesson is to avoid payment custody

The current Wave profile on Trustpilot (https://www.trustpilot.com/review/waveapps.com) showed 555 reviews, 395 within the preceding 12 months, and a 3.2/5 score when checked. The page included current reviewer reports dated in September/October 2026 concerning payment holds, refund delays, difficulty reaching human support and app/web feature gaps. These are reviewer allegations/individual experiences, not independently established facts about all users or a verified rate of payment failures.

**enV design response:** do not process, custody, or claim to reconcile funds. Generate documents locally so the user chooses how to send or collect payment. Never imply that a generated invoice is a payment confirmation, and never persist client/document contents to enV servers in these tool paths.

Source: https://www.trustpilot.com/review/waveapps.com (accessed 2026-10-15).

## 2. Naming products: volume and availability are not legal clearance

Shopify's current Business Name Generator (https://www.shopify.com/tools/business-name-generator) encourages users to explore generated ideas, check domain availability and continue into a store-creation funnel. Shopify's own guidance also recommends researching market fit, domain/social availability and trademark records. Namelix coverage updated 27 August 2026 describes its short, brandable suggestions and domain checks as strengths while warning that a domain check is not the same as trademark clearance, and vague inputs can still result in generic/repetitive suggestions. A low-engagement Reddit post in November 2025 praised favorite-based adaptation as a way to improve later batches; it is a useful design signal, but not representative evidence.

**enV design response:** offer multiple local styles, editable length/exclusion filters, more than a few suffix templates, copy one/all, a registrar-only outbound link on Web/Android/iOS rather than a fabricated “available” badge, and a plain-language limitation disclaimer. A favorite-driven adaptive generator is not implemented in this round and remains a candidate follow-up rather than a claimed capability.

Sources:
- Shopify: https://www.shopify.com/tools/business-name-generator (checked 2026-10-15).
- Namelix review: https://www.techraisal.com/blog/namelix-review/ (updated 2026-08-27).
- Reddit naming feedback: https://www.reddit.com/r/StartupsHelpStartups/comments/1otf7jh (published 2025-11-10; low engagement, treated as anecdotal).

## 3. SaaS unit economics: make gross profit and payback explicit

Current specialist calculators and SaaS metric explainers consistently distinguish gross-profit LTV from revenue-only lifetime value, use `LTV = monthly ARPU × gross margin ÷ monthly churn`, calculate LTV:CAC as LTV/CAC, and estimate payback as CAC divided by monthly gross profit per account. They also caution that constant churn/ARPU assumptions and LTV:CAC alone can conceal cash/payback risk. “3:1” and 3–5× bands are planning heuristics, not universal standards for every company or growth stage.

**enV design response:** distinguish a simple commerce formula (revenue-based and disclosed) from a gross-profit SaaS model; show the method, churn guard, CAC ratio, band and contribution-based payback; state that results depend on assumptions.

Sources:
- ROIStack: https://roistack.org/saas-ltv-cac-calculator/ (checked 2026-10-15).
- AgentCalc: https://www.agentcalc.com/saas-ltv-cac-benchmark-calculator (checked 2026-10-15).
- Taylor Sicard's CAC payback calculator: https://taylorsicard.com/tools/saas-cac-payback (checked 2026-10-15).

## 4. Local document generators: compare against the features users can actually use

Public product pages for lightweight invoice generators commonly emphasize fast PDF/print creation, line items, logo and currency controls, and no-account/no-watermark positioning. Such claims are feature descriptions from vendors rather than independent verification. The relevant product opportunity is not to add accounting, payments or payroll: it is a quick, clear, mobile-friendly document that the user can save/share themselves, without hiding the output behind account requirements.

**enV design response:** Web supports line-item editing, live subtotal/tax/discount/total, currency, local PNG/JPEG logo and PDF/print; Android/iOS have native forms and local PDF/text output. A known parity gap remains: the native PDF is still primarily text-first and does not yet equal the Web document's structured table layout.

## Research limits

- No vendor API or private datasets were used.
- Review themes are qualitative and self-selected; sample size and platform ratings do not establish incidence or causal claims.
- No task-time, task-success, accessibility, total-cost or end-user preference benchmark was performed; therefore enV is not being labelled “#1” or objectively better than the named competitors.
