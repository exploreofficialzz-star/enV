# enV global discovery, brand and catalogue clarity programme

**Status:** Research and first implementation wave in progress; external verification outstanding  
**Scope:** Web discovery, AI-search eligibility, browser retrieval, social sharing, category copy and individual tool explanations  
**Canonical platform name:** `enV`  
**Parent company:** `chAs Technologies LLC`  
**Canonical web origin:** `https://envtools.store`

This document records the research findings and delivery programme for improving how enV is understood, discovered, crawled, indexed, cited, shared and explained. PR #146 includes the first implementation wave for product identity, catalogue copy refinement, category explanations and SEO metadata. This document does not claim that external search engines have indexed enV or that AI systems already cite it.

## 1. Product identity and copy rules

The platform name is **enV**. Do not expand it into "enV Digital Toolkit", "enV Browser Toolkit", "enV digital products", or other appended product descriptors. Do not write "enV_". The company name is not part of the platform name.

Use `chAs Technologies LLC` only where company attribution is appropriate: About/company information, legal documents, publisher/Organization identity, and other contexts that genuinely require the legal parent. Do not repeat the company name in every category or tool description.

Writing should be simple, professional, direct and specific:
- Start with the task people want to complete.
- State what the tool actually does and what result it produces.
- Use familiar verbs and plain language.
- Explain supported inputs, outputs, controls, processing location, external services, limitations and important assumptions accurately.
- Do not imply AI, automation, privacy, offline support, universal format support, speed, security, or guaranteed outcomes unless the implementation verifies the claim.
- Avoid keyword lists disguised as prose, keyword stuffing, promotional superlatives, invented ratings, and repeated boilerplate.

Brand correction must include page titles, visible headings, descriptions, Open Graph, X/Twitter metadata, JSON-LD, `llms.txt`, generated inventories, tests, native information screens, and any public product copy where it conflicts with this identity.

## 2. Current repository findings

The following findings describe the `main` snapshot used as the baseline for this programme. Changes on the PR branch address some of these items; the remaining bullets distinguish baseline defects from work still requiring verification. They are not a substitute for inspecting current production responses or external webmaster consoles.

### Existing foundations to preserve and verify
- `scripts/generate-seo-artifacts.mjs` generates `robots.txt`, `sitemap.xml`, and `llms.txt` from the catalogue and public-route inventory during the production build.
- Crawler policy explicitly distinguishes Googlebot, Bingbot, OAI-SearchBot, Claude-SearchBot / Claude-User, PerplexityBot / Perplexity-User and Applebot from provider-specific training/model-use controls. The PR now adds the shared `__usage_ai-training` preference as a separate signal while retaining the explicit vendor-specific training blocks.
- Tool, category, guide and article routes already use canonical metadata and JSON-LD. Private and interaction-only routes have noindex policies.
- The SEO setup runbook already explains Google Search Console and Bing Webmaster Tools registration and sitemap submission.
- A live SEO smoke script and a GitHub Actions workflow are present. The workflow is scheduled every 30 minutes and checks selected production discovery assets, canonical redirects and representative rendered routes.
- A dedicated content and SEO inventory is generated from the live registry.

### Gaps and risks found
- Brand strings are inconsistent with the requested identity. The homepage currently uses `enV Digital Toolkit by chAs Technologies`; the global Open Graph site name and WebSite structured data also use expanded names. Existing SEO tests assert some of this wording, so they must be corrected alongside the user-facing text.
- Category pages generally show the category description followed by the tool catalogue. Their explanatory content is not consistently deep or tailored to the category's actual workflows.
- The tool documentation engine includes task guidance for all 43 current categories and explicit tool-level guidance for several important operations. It also uses category/engine-level fallback steps for many other tools. Category coverage is therefore established, but individual tool coverage is not: each active public tool still needs its real controls, inputs, outputs, processing path, errors and limits checked against source.
- The original catalogue generator used repeated fallback and cross-category templates. The PR adds `src/lib/generated-tool-copy.mjs`, tests, registry integration and native export integration to replace known legacy boilerplate with task-oriented wording. This is a quality filter, not proof that every final description has been reviewed against its real engine; WS-02 and WS-03 still require an evidence-based tool inventory and individual review.
- Tool and category metadata generally use a shared social image by default. Route-specific share cards are not consistently supplied.
- The sitemap does not yet emit `lastmod`, because there is no reliable per-canonical-route significant-content timestamp source. Do not substitute deployment time or sitemap-generation time.
- IndexNow has been implemented on this PR branch: the production-only Vercel `INDEXNOW_KEY` variable is stored as a sensitive environment variable; the production build generates the matching root-level key file; the notifier checks that the key file is live, selects changed canonical URLs from the generated inventory, includes removed URLs from the previous sitemap when available, batches submissions and handles protocol retry signals. The initial key-file publication and first full-site synchronization still require the PR to be merged/deployed and then verified on the canonical domain.
- Source-level crawler allowances do not prove that crawlers fetched pages, pages were indexed, or AI answer engines cited them.
- Search Console and Bing Webmaster ownership verification, sitemap processing status, indexed-page counts, and AI citation results require external account evidence. The repository runbook records these as owner-side release evidence, not completed actions.

## 2.1 Implementation status on PR #146

The following status describes code committed to the draft PR branch, not a production release:

| Workstream | Branch status | Remaining evidence or work |
|---|---|---|
| Product identity | First web, SEO, Open Graph, schema, README and native information-screen corrections committed | Search repository-wide for residual public name variants; inspect rendered canonical pages after deployment |
| Category copy | All 43 current category descriptions and blurbs rewritten | Improve category-page introductions and workflow groupings; verify every description against current category inventory |
| Generated tool descriptions | Shared rules integrated into web registry, catalogue generation and native export; guard tests added | Audit each active public canonical tool against its real engine; rule-based copy is not an individual capability audit |
| Tool guides | Generic fallback now starts from each tool's purpose and gives relevant first-use/result checks | Finish per-tool controls, inputs, output, processing, limits and failure-path reviews |
| IndexNow | Production-only Vercel secret and PR-branch key generation/submission implementation committed | Merge/deploy, verify the root key file, run one-time full sync, observe real IndexNow responses |
| Sitemap freshness | No fabricated `lastmod` added | Add significant-content timestamps only after reliable route-level update metadata exists |
| Route-specific social cards | Shared default card remains the current baseline | Design and verify a safe route-specific card strategy and test real platform fetchers |
| External webmaster and AI proof | Runbook and repeatable test process documented | Google Search Console/Bing ownership, sitemap processing, actual AI citations and social preview evidence still outstanding |

Do not mark a workstream complete based solely on source changes, a passing build, sitemap inclusion or crawler permission.

## 2.2 Validation snapshot — 14 November 2026

This snapshot was reconciled at PR head `f35082bb5a4c55b31d83b30f60c8139507b16dbd` on 14 November 2026, before the current tracker update. Since the last completed workflow evidence at `acf37ee5fbca4f60acf7f4715bd457c68ae1546d`, the branch includes the guide-parser scope fix, SPA-navigation test adjustment, proposed shared `__usage_ai-training` preference and its generator/live/artifact/rendered-route assertions, task-guidance-source classification and inventory assertions, an explicit four-layer classifier test, dedicated Creator content-calendar/content-planner/posting-time guidance, and QR/barcode, E-commerce, Developer/API, Design/accessibility, Social publishing, Creator media and business-record research. The task-guidance label was narrowed to `operation-specific` to avoid implying every rule belongs to one unique tool ID; the SEO setup runbook marks the shared training preference as not approved for deployment. The latest branch comparison shows `main` is now three commits ahead, with native Celebrations and shared catalogue/UI overlaps recorded below. GitHub returned no workflow runs or commit statuses for the latest source commits when checked. Current task-guidance-source totals have not yet been generated by a fresh current-head artifact build; classifier and new Creator guide tests remain **pending fresh CI**, not passed. No Vercel build was manually triggered during this continuation.

| Gate | Observed result | Current disposition |
|---|---|---|
| Category descriptions and blurbs | Current source review matched 43 category records; all 43 descriptions and all 43 blurbs are distinct | Source-level uniqueness check passed. Standard category route renders both above the catalogue. Creators & music specialist route remains an explicit exception. |
| Category workflow grouping | Helper uses actual repeated `subcategory` values; it keeps a flat layout when taxonomy is too sparse, groups only repeated categories, and retains sparse/uncategorized tools under “Other tools” | Existing source tests cover flat fallback, insufficient grouping evidence, “Other tools” and preservation of all tools. Responsive browser checks remain pending. |
| Task-guidance source | Added `operation-specific`, `engine-specific`, `category-guidance`, and `catalogue-fallback` classifications for the overview/example/validation in each guide's “When to use this tool” section. Generator writes counts and per-row labels; artifact assertions check matching tool/guide rows. Unit tests verify all four classification paths and dedicated Creator calendar/planner/posting-time rules. | Source changes committed. Totals and test results require a fresh current-head run. Labels do not classify the entire guide or prove accuracy. |
| Guide-link client navigation | Failed on the earlier head because the browser test required a document `commit` for a TanStack Router SPA transition | Test now waits for the route URL transition without a document-commit requirement; direct URL refresh remains separate. Fresh browser run is pending. |
| Guide parser/typecheck regression | Earlier Web typecheck failed with `TS2304: Cannot find name 'categoryOperationParsers'` in `src/lib/tool-documentation.test.ts` | The out-of-scope synthetic check was removed and real canonical public IDs are checked inside the parser map's scope. The counter-variable rename was also corrected. Fresh typecheck is pending. |
| Rendered SEO and crawler assertions | Passed on the pre-fix head, including canonical metadata, structured data, noindex policy, `robots.txt`, `sitemap.xml`, `llms.txt`, 128 tool-title collision routes and 132 guide-title collision routes | These results do not prove production indexing, ranking or actual crawler fetches. Current-head rerun is pending. |
| Direct tool-guide request | The earlier browser audit fetched `/blog/tool-math-matrix-2x2-determinant` with HTTP 200 and rendered the guide title and required sections | Direct route rendering passed on the earlier head. Fresh verification after the navigation test change is pending. |
| Web and Android authoritative CI | Android subjob passed on the earlier inspected run; Web build completed, then typecheck failed on the parser-scope error | Re-run required after the typecheck fix. No current-head workflow run was returned. |
| Developer Studios quality gate | Failed an existing source-contract check because the purpose-built engine did not contain the required “On-device processing” marker | The implementation and gate are outside this PR's changed-file scope. Keep them with the owning workstream; do not patch them here. |
| Production Check | Verify job timed out waiting for `input[aria-label="Upload QR or barcode image"]` during the browser QR/barcode check; a separate Game Studio job also failed | Independent owning-workstream failures; they are not evidence that this discovery PR caused a QR scanner regression. |
| PR/base-branch mergeability | `main` has advanced by three commits, including the native Celebrations engine and additional native catalogue/build work. The divergence overlaps with shared files changed by this PR: `apps/ios/enV/ContentViews.swift`, `apps/shared/native-execution-matrix.json`, `package.json`, `scripts/gen-catalog.mjs` and `src/components/tools/tool-engine.tsx`; the newer main changes also touch related catalogue/UI files such as `src/components/tools/tool-card.tsx` and `src/components/tools/tool-shell.tsx`. GitHub reports `mergeable=false`. | Merge reconciliation is a release blocker. Preserve the newer Celebrations work and combine both changes deliberately. No rebase, merge commit or force-push has been attempted. |
| Shared AI-training preference | The branch emits a separate `__usage_ai-training` group and validates that it is isolated from wildcard and search-crawler groups | Proposed only. Product-owner approval is required before merging/deploying this policy change. Existing provider-specific crawler rules remain intact. |
| Vercel preview | Latest READY deployment returned for this branch is older commit `0c975e16996caa21c7e0d3f2c5c23df551c68123`. Vercel PR comments report the free project's deployment quota exceeded (more than 100 deployments/day). | No current-head deployment exists in the results. Do not spend another build on the draft branch before merge conflicts and source checks are resolved. Production was not changed. |
| Webmaster and external search evidence | No Google Search Console, Bing Webmaster Tools, or AI answer-engine account evidence was available in the repository checks | Still outstanding; crawler allowances and generated sitemap URLs are not proof of indexing, ranking or citations. |

Relevant previously inspected workflow runs (these are historical evidence, not current-head results):
- Web and Android CI: https://github.com/exploreofficialzz-star/enV/actions/runs/43613992855
- Production Check: https://github.com/exploreofficialzz-star/enV/actions/runs/43613992804
- Phase 8 rendered accessibility/SEO workflow: https://github.com/exploreofficialzz-star/enV/actions/runs/43613992954
- Developer Studios quality gate: https://github.com/exploreofficialzz-star/enV/actions/runs/43613992939
- Billing integration validation: https://github.com/exploreofficialzz-star/enV/actions/runs/43613992932
- Date & Time focused verification: https://github.com/exploreofficialzz-star/enV/actions/runs/43613992903
- User Behavior analytics security tests: https://github.com/exploreofficialzz-star/enV/actions/runs/43613992917

The earlier rendered guide index displayed **9,979 searchable guide entries**. A separate prior SEO artifact build reported **4,822 canonical public tool pages** within **10,174 public URLs**. These are different filtered counts; searchable guide entries include records SEO rules may exclude from indexing. Recalculate both from a fresh, current-head build before publishing a new count. The new task-guidance-source totals are also unknown until that generated inventory is rebuilt.

The PR remains open and draft, with `mergeable=false`. No current-head CI, current-head Vercel deployment, production release, Search Console/Bing verification, indexing result, AI citation or live social-preview validation is claimed.

## 3. Competitor and platform research

The research compares patterns, not wording to copy. enV should use its own language and only claim capabilities demonstrated by its implementation.

| Reference | Observed pattern | What enV should adopt |
|---|---|---|
| Canva | Organizes a broad product around recognisable work areas such as social, video, photo editing, documents and presentations, with visual examples and clear category navigation. | Group categories around user goals; make the directory scannable; use real examples and previews where they help someone choose. |
| Smallpdf | Uses short task names such as Compress, Convert, Merge, Edit and Sign, then supports them with a straightforward product explanation. | Use familiar action-first labels and keep the first explanation focused on the job and result. |
| iLovePDF | Groups document work into actions such as organize, optimize, convert, edit and security; its guide describes the actual sequence of selecting, arranging, processing and downloading files. | Describe actual workflow steps, input sources, output and limits rather than generic claims about document processing. |
| TinyWow | Uses a broad directory with category groupings and compact one-line tool descriptions, often explaining the immediate result. | Keep cards concise and task-first, but avoid repeated or vague descriptions across similarly named tools. |
| CloudConvert | Makes supported formats and conversion direction explicit; its documentation identifies operation parameters and format-specific options. | Maintain accurate input/output format matrices and expose format limits only when the implementation supports them. |
| Photopea | Clearly explains browser execution and its local/no-upload behavior, and provides a structured learning path from basic to advanced workflows. | Explain local processing or offline support only where verified; offer deeper guidance for complex studios. |
| remove.bg | Shows concrete examples, use cases and before/after outcomes for one specific task. | Use real examples and previews to explain outputs; never borrow its AI claims for non-AI enV tools. |
| Kapwing | Organizes tools by workflow and uses concise action/result descriptions such as adding subtitles, resizing or transcribing. | Make category groupings reflect related user workflows and describe the result in plain language. |

### 3.1 Workflow details verified from product documentation

The most useful comparison is the *actual task flow*, not the headline count of tools:

- **iLovePDF:** its user guide walks through choosing files from a device or supported cloud source, selecting page ranges, arranging page order, choosing compression behavior and downloading the processed result. enV's PDF pages should explain the actual sequence users will encounter, including whether the original file remains unchanged and what output is produced. Source: https://www.ilovepdf.com/help/documentation
- **CloudConvert:** its conversion-operation documentation exposes the source task, target format, engine/version, timeout and format-dependent options. Its API describes asynchronous and synchronous jobs, webhooks and chained jobs. enV should publish format support only when the particular engine and current code path support that source/target pair; asynchronous processing must not be described as instant local conversion. Sources: https://cloudconvert.com/docs/operations/convert-files and https://cloudconvert.com/apis/file-conversion
- **Photopea:** its own learning material describes browser-based editing and states that files remain on the device. That is a product-specific privacy and processing disclosure, not a claim to reuse for every browser editor. enV must state the processing path of each tool independently. Source: https://www.photopea.com/learn/
- **remove.bg:** its help material documents several distinct ways to use its background-removal product, including the website, desktop application, API and integrations. The lesson is to explain the delivery path and batch/API distinction for a specific product; it does not justify describing unrelated enV tools as AI-powered. Source: https://www.remove.bg/help/a/how-can-i-use-remove-bg.class
- **Smallpdf:** its directory organizes work around verbs such as compress, convert, merge, split, edit, sign and protect. That makes the directory scannable before users open an individual tool. enV should use clear task labels and ensure each card's wording matches the route behind it. Source: https://smallpdf.com/pdf-tools
- **TinyWow:** its directory groups a large range of utilities into recognizable categories and pairs entries with short task descriptions. enV can adopt the compact navigation pattern, but should avoid scaling page count through near-duplicate keyword variants. Sources: https://tinywow.com/tools and https://tinywow.com/tools/pdf
- **Kapwing:** its tools directory groups products by workflows such as video editing, subtitles, translation/transcription, audio, social publishing and conversion/compression. enV categories should help people move between related jobs rather than merely list unrelated tool names. Source: https://www.kapwing.com/tools
- **Canva:** its public product navigation groups a broad creative suite around outputs and work areas such as social content, video, documents and presentations, supported by visual examples. enV can make complex studios easier to choose with genuine previews and examples, but must only show examples generated by the actual tool. Source: https://www.canva.com/

### 3.1.1 QR, barcode and commerce benchmarks

These categories need standards-aware explanations. Their public directories should distinguish a local utility from a connected commerce service.

**QR and barcode generation / reading**

- **TEC-IT Barcode Generator:** the web workflow exposes a symbology chooser spanning linear, postal, GS1 and 2D types; then a data field and controls for barcode-specific properties. Its service documentation separately exposes width/module-width, units, rotation, image format, quiet-zone sizing, DPI, raster/vector output and error handling. It also distinguishes a free browser demonstration from its paid service/API. enV should borrow the sequence—choose a symbology, enter data, configure only valid options, generate, scan-check, then download—rather than making users choose from a long undifferentiated code list. Never imply a barcode is valid for retail or logistics merely because an image was generated. Sources: https://barcode.tec-it.com/en and https://services.tec-it.com/aspx/TBarCode/BarcodeGenerator.aspx
- **QR TIGER:** its current product positioning distinguishes static from dynamic QR. Dynamic codes can support destination edits after printing, scan analytics (time, location and device), bulk production, APIs and integrations. These functions require a hosted redirect/data layer, account permissions, storage, analytics and service operations; they are not properties of a static QR image. enV's local QR generator must be described as static/local unless a separate production-backed dynamic-code service is implemented and verified. Do not advertise editable destinations, unique/total scan counts, geo analytics, campaign tracking, retargeting, folders or integrations from the existence of a QR renderer alone. Sources: https://www.qrcode-tiger.com/ and https://qrtiger.helpscoutdocs.com/article/124-how-do-i-track-my-qr-code-scans
- **GS1:** distinguish a plain QR payload from standards-based identifiers and GS1 2D data. GS1 DataMatrix uses GS1 element-string syntax; QR Code and Data Matrix with GS1 Digital Link use a web-compatible URI syntax. The GS1 support centre states that not all retail POS systems can yet scan and process 2D symbols and that 1D marking may still be needed during the transition. GS1 US describes Sunrise 2027 as a target to prepare retailers to accept 2D barcodes at POS by the end of 2027; it is not proof that every retailer or market will have completed the transition. enV should not label a generic QR as a GS1 Digital Link or POS-ready barcode unless it implements the relevant syntax, identifier validation, print constraints and scanner tests. Sources: https://support.gs1.org/support/solutions/articles/43000756000-what-is-the-difference-between-2d-barcode-options- and https://documents.gs1us.org/adobe/assets/deliver/urn%3Aaaid%3Aaem%3A24e150cc-390c-482b-b7d2-0bc277adcfb8/GS1-US-Sunrise-2027-One-Pager.pdf

**E-commerce workflows**

- **Shopify:** its product catalogue model includes more than a name and price: descriptions, media, variants, compare-at prices, inventory levels, tags, metafields, collections and bulk/CSV changes. Its discount system distinguishes discount codes and automatic discounts, with percentage/fixed amount, buy-X-get-Y and free-shipping types; codes and automatic offers can have different eligibility, limits and combinations. Shipping labels depend on eligible fulfillment locations and supported countries/carriers, can be purchased individually or in bulk against orders, and cannot be printed from Shopify Admin without an order. These are connected store-management capabilities, not mere calculations. enV's current E-commerce engine explicitly states that it runs locally and has no store or carrier account connected; its shipping output is a recorded quote, not a live carrier rate. Therefore enV's descriptions must say “estimate”, “record”, “plan”, “generate a sample” or “preview” where appropriate, and must not claim live inventory sync, actual checkout/order creation, discount deployment, shipping-rate retrieval, label purchase or fulfillment integration. Sources: https://help.shopify.com/en/manual/products, https://help.shopify.com/en/manual/discounts, and https://help.shopify.com/en/manual/fulfillment/fulfilling-orders/shipping-labels/buying-labels

**Current enV implementation boundary to preserve**

- The current source-level QR/barcode audit describes a local browser reader that can decode camera streams and uploaded images, plus an explicit manual payload-inspection mode. The Android reader uses CameraX/ZXing and local image decoding; iOS uses AVFoundation/Vision and photo selection. The source test inventory checks 52 QR/barcode catalogue handlers on iOS and exercises QR plus Code 128 scanning paths. These checks are evidence of implementation paths and test coverage, not a statement that every scanner, print format, POS device or GS1 workflow has been certified. See `scripts/check-qr-barcode.mjs`, `scripts/browser-qr-barcode-reader-audit.mjs`, `apps/android/app/src/main/java/com/chastech/env/NativeBarcodeReader.kt`, `apps/ios/enV/NativeQrBarcodeAndEcommerceViews.swift` and `apps/ios/enVTests/NativeEcommerceEngineTests.swift`.
- The E-commerce source implements local product/order/inventory/shipping/pricing/discount/coupon/SKU/catalog/store/customer/return/profit/margin workflows with generator, calculator, planner, template, mockup and helper variants. The native tests cover the generated catalogue families, while the visible web engine discloses that no store or carrier account is connected and that carrier rates are not fetched. A handler existing for each catalogue ID does not prove that every generated variant is a complete store integration or that its example content is sufficiently differentiated. Inspect the form and output for each active canonical ID before giving it a unique capability claim. See `src/components/engines/ecommerce-engine.tsx`, `src/components/engines/ecommerce-engine-utils.ts`, `apps/android/app/src/main/java/com/chastech/env/NativeEcommerceEngine.kt`, `apps/ios/enV/NativeEcommerceEngine.swift`, `scripts/check-qr-barcode.mjs` and the Android/iOS native commerce tests.

### 3.1.2 Developer, design and accessibility workflows

**API and developer utilities**

- **Postman API Client:** its workflow is more than a URL field and a Send button. The product supports request construction across HTTP and several other protocols, explicit authentication configuration, response inspection, reusable collections, environment switching, JavaScript pre/post-request tests, CI collection runs and scheduled monitors. Its lightweight desktop client can create/send requests and keep request history locally while signed out; account workspaces add team collaboration, environment variables and shared assets. enV should only describe these capabilities for a specific tool when the current route implements them. A simple HTTP request runner should clearly show the destination, method, headers, body, authentication behavior, network request, status code, response headers/body and failure state. It must never claim a request ran locally just because the interface is in a browser, and it must avoid persisting or exposing credentials in logs, exports or shared URLs. Do not imply collection management, environment vaults, multi-protocol support, tests or monitoring unless those flows exist. Sources: https://www.postman.com/product/api-client, https://learning.postman.com/docs/use/overview, https://learning.postman.com/docs/tests-and-scripts/running-collections/running-collections-overview and https://learning.postman.com/docs/getting-started/basics/using-api-client
- **Postman as an API lifecycle product:** its broader product sequence is design/import an API, build and test requests, organize them into collections/environments, version/govern, automate/monitor, then publish/share documentation. The lesson for enV's Developer category is to distinguish a one-shot local formatter or request from a managed API workspace, and to explain the exact lifecycle stage the tool supports. A small utility should not be described as an API platform. Source: https://www.postman.com/product/

**Image editing and visual design**

- **Photopea:** its learning path starts with basic tasks and progressively introduces more advanced raster/vector editing; it documents browser support, color spaces and bit depth. Photopea explicitly says processing runs on the user's device and can continue offline after the page is loaded. This is a strong model for precise, tool-specific privacy language: enV may say a file stays local only for a verified engine with that execution path, not for every tool in the Image, Design or Photography category. It should also explain the actual supported formats, layers, color model, bit depth and export controls rather than using a generic “professional editor” claim. Source: https://www.photopea.com/learn/
- For smaller design utilities, the user-facing sequence should remain task-specific: select a color/shape/effect, inspect the rendered result, then copy or export the actual artifact. A CSS value preview is not a complete design project; a generated SVG is not a full illustration editor; and an exported mockup is not proof of how the asset behaves in every browser or device.

**Accessibility standards and testing**

- **W3C WCAG 2.2:** the normative success criteria provide concrete tests that can be mapped to controls and results. Success Criterion 2.1.1 (Keyboard, Level A) requires all functionality to be operable through a keyboard interface, except for narrowly defined path-dependent input. Success Criterion 1.4.3 (Contrast Minimum, Level AA) requires at least 4.5:1 for normal text and 3:1 for large text, subject to the stated exceptions. An enV contrast checker can report a measured color-pair result against the chosen threshold; it cannot certify that an entire page or application conforms to WCAG. A full review must also examine keyboard behavior, focus visibility/order, names/roles/values, labels, instructions, errors, headings, semantics, dynamic updates and relevant criteria beyond color contrast. Source: https://www.w3.org/TR/wcag/
- **Testing implication:** explain exactly what was evaluated, the input/scope, the applicable criterion, and the detected result. “No issue found in this test” is more accurate than “accessible” or “WCAG compliant” when the tool has only run a subset of checks. Automated scanners should be paired with manual keyboard and assistive-technology review; absence of an automated finding does not prove conformance.

### 3.1.3 Social publishing, creator media and business records

**Social publishing and content calendars**

- **Buffer** treats publishing as a stateful workflow, not simply writing a caption. A user composes a post, selects one or more connected social channels, adapts content for each network where necessary, saves drafts, then chooses a queue slot, a priority position, a custom date/time or immediate publishing. Its All Channels view separates Queue, Drafts, Approvals and Sent; team permissions determine who can edit, request approval and publish. Buffer's documentation also notes that scheduled posts to multiple channels become separate channel-specific posts and may need separate editing. enV should only use words such as “schedule”, “publish”, “sent”, “approved” or “failed” when a real connected account, permission, provider response and auditable post state exist. A calendar or content plan is not a publishing integration. Sources: https://support.buffer.com/en-us/articles/scheduling-posts-4Qdld7giAZ, https://support.buffer.com/en-us/articles/how-to-use-the-all-channels-view-in-buffer-oqqE4Sdf3T, and https://support.buffer.com/en-us/articles/requesting-approval-and-approving-draft-posts-57li7M8tDA
- **Current enV creator boundary:** the Creator engine's content-calendar operation creates dated publishing ideas, suggested formats and posting days. The screen explicitly says it does not schedule or publish posts, and the generated output says it is not an auto-publishing connection. The posting-time helper asks the user to enter their own audience activity information and refuses to invent a universal best time when none is supplied. Keep this as a planning workflow; do not describe it as a social scheduler, channel connector, approval queue, analytics integration or autopublisher. Evidence: `src/lib/engines/creator.ts` (`contentPlan`, `content-calendar`) and `src/components/engines/creator-engine.tsx` (`CalendarScreen`).

**Audio/video creator editing and transcription**

- **Descript** combines recording/import, automatic transcription, transcript-based editing, media refinement and publishing/repurposing. Its text-based editing model maps transcript edits back to the audio/video timeline; its feature set also includes multitrack/remote recording, filler-word removal and AI-assisted edits. This is a full media-editing workflow, not just a transcription endpoint. enV should not imply transcript-driven cuts, synchronized timeline edits, multitrack editing, speaker-separated recording, AI cleanup or end-to-end media publishing unless those operations are implemented and verified. Sources: https://www.descript.com/features and https://www.descript.com/video-editing
- **Current enV transcription boundary:** `TranscriptionEngine` uploads the selected audio/video file to the configured enV transcription endpoint using a multipart request; the UI explicitly tells the user that the file is sent to that service. The Render gateway code path enforces a 4 MB limit, and the separate AI transcript assist describes a short audio clip of about 2.8 MB with timestamps. The current exposed transcription form provides file selection, language/translation options, output text and a downloadable TXT/SRT/VTT result; this is not the same as a non-destructive transcript-linked media editor. Explain the server transfer, configuration dependency and relevant upload limit for the exact route. Evidence: `src/components/engines/transcription-engine.tsx`, `src/lib/ai/features.ts`, `docs-transcription.md` and `scripts/transcription-processor.mjs`.

**Invoices, receipts and accounting workflows**

- **QuickBooks Online** models an invoice as a business record linked to a customer, products/services, invoice and due dates, terms, tax/discount and payment settings. Its workflow continues after document creation: the invoice can be emailed or shared, its Sent/Paid status can be inspected, reminders can be configured, and full or partial customer payments are recorded against the outstanding invoice and a deposit account. The distinction matters: generating a printable invoice is not equivalent to sending it, receiving payment, reconciling the deposit or updating an accounting ledger. enV must only claim these actions when a production accounting/payment integration actually performs them and reports the resulting state. Sources: https://quickbooks.intuit.com/learn-support/en-us/help-article/invoicing/create-invoices-quickbooks-online/L7gSzvCld_US_en_US and https://quickbooks.intuit.com/learn-support/en-us/quickbooks-online/invoice-and-payments/
- **Current enV boundary:** business document and commerce workflows generate or calculate outputs from user-entered values. The E-commerce engine states that it runs locally and that no store or carrier account is connected; shipping output is a recorded quote, not a live carrier rate. A generated invoice/receipt/quotation should therefore be described as a draft, template, estimate or downloadable document unless the exact tool is connected to a service that sends the document, records a transaction, receives payment or reconciles an account. Never describe “payment method” or “payment fee” inputs in a calculator as payment processing. Evidence: `src/components/engines/ecommerce-engine.tsx`, `src/components/engines/ecommerce-engine-utils.ts`, the Business Studio document engine, and `scripts/check-business-studios.mjs`.

**Implementation and content acceptance**

- Use distinct lifecycle states for a local draft, an exported file, a provider-accepted request, a published/sent record, a failed operation and a confirmed payment. Do not label a local output as “sent”, a future content plan as “scheduled”, a returned quote as a live carrier rate, or an invoice file as “paid”.
- For any future publishing or accounting integration, record the connected account/channel, authorization scope, target resource, user confirmation, provider request/response, idempotency behavior, time zone where applicable, error/retry state, and the final provider-side record ID. Expose approval and rollback/correction paths before enabling bulk or scheduled actions.

### 3.2 Crawler purposes and emerging AI-usage preferences

Crawler access must be decided by purpose rather than by a broad label such as “AI bot”. The current enV policy deliberately permits the search/retrieval agents whose access helps discovery while disallowing the separately identified training agents. The vendor documentation reviewed on 14 November 2026 confirms these distinctions:

| Provider | Search / discovery | User-directed retrieval | Training / other usage control | enV policy implication |
|---|---|---|---|---|
| OpenAI | `OAI-SearchBot` is used to surface sites in ChatGPT Search. | `ChatGPT-User` fetches pages for user actions and is not an automatic crawler; robots.txt may not apply to those requests. | `GPTBot` identifies crawl access that may be used to train OpenAI foundation models. | Keep OAI-SearchBot allowed and GPTBot disallowed. Do not confuse ChatGPT-User requests with automatic indexing or assume robots.txt is enforceable for a user-directed fetch. |
| Anthropic | `Claude-SearchBot` improves search-result quality. | `Claude-User` fetches pages when a person asks Claude to use them. | `ClaudeBot` is used for model-development/training collection. | Keep the two discovery/retrieval agents distinct from ClaudeBot; current policy allows search and user retrieval while disallowing ClaudeBot. Anthropic also recognizes the shared training-preference token on a phased rollout; its explicitly named ClaudeBot rule takes precedence. Anthropic documents robots.txt and a non-standard Crawl-delay extension. |
| Perplexity | `PerplexityBot` surfaces and links pages in Perplexity search and is explicitly not used for foundation-model training. | `Perplexity-User` fetches a page to answer an individual user's request; Perplexity says this fetcher generally ignores robots.txt. | The crawler guide says PerplexityBot is not a training crawler and Perplexity-User is not used for training. | Keep PerplexityBot allowed. A robots.txt allow rule for Perplexity-User is descriptive, not an effective access control for user-triggered requests. Use server/WAF policy where restrictions are required. |
| Apple | `Applebot` powers search discovery across Apple surfaces, including Spotlight, Siri and Safari. | Applebot can provide fresh context to Apple product experiences. | `Applebot-Extended` is the separate opt-out signal for using Applebot-crawled content to train Apple's general-purpose foundation models. Apple documents `nosnippet` as a separate control for use as additional context in broad AI-generated answers. | Keep Applebot allowed and Applebot-Extended disallowed. Do not add `nosnippet` globally unless enV intentionally wants to limit that contextual use; it is not the same control as training opt-out. |
| Google | `Googlebot` controls Google Search crawling, including AI Overviews and AI Mode eligibility. | Google has separate user-triggered fetchers for certain user actions. | `Google-Extended` is a robots.txt product token that controls use of crawled content for Gemini model training and grounding; Google states it does not affect Google Search inclusion or ranking. | Keep Googlebot allowed and Google-Extended disallowed while preserving Search eligibility. Google plans to recognize the shared training-preference token in 2027; enV now emits it separately without replacing the explicit Google-Extended rule. |

**Do not treat robots.txt as an access-control or confidentiality mechanism.** It communicates preferences to compliant crawlers; it does not authenticate users, block arbitrary clients, or guarantee that every fetcher follows the file. Use authorization, signed URLs, rate limits or server/WAF controls for protected content. Use page-level `noindex` for pages that must not appear in search results; blocking a URL in robots.txt alone is not a reliable way to remove its URL from an index.

**Shared AI-training preference — supplementary signal, not a universal enforcement mechanism.** The PR now emits a separate `User-agent: __usage_ai-training` / `Disallow: /` group to express enV's broad preference against generative-AI model training. Anthropic says it began recognizing the signal on 30 October 2026 and is rolling it out across its services; it also says explicit `ClaudeBot` rules take precedence over the general token. Google announced that it plans to support the token in 2027 and says that, when the shared token opts out and `Google-Extended` is not explicitly specified, it plans to interpret the preference as disallowing `Google-Extended`. enV nevertheless keeps the explicit `Google-Extended: Disallow: /` rule, as well as the existing GPTBot, ClaudeBot and Applebot-Extended blocks.

The token is defined in an active October 2026 IETF individual Internet-Draft, not a published RFC. The Datatracker says the draft is not endorsed by the IETF and has no formal standing in its standards process. The draft describes an intended usage preference, not a crawl directive: compliant consumers may use it to inform training decisions, while crawler product-token rules continue to be evaluated independently. It does not stop HTTP requests, guarantee provider compliance, authenticate visitors, or replace vendor-specific and server-side controls. Keep this supplementary group while continuing to monitor actual provider adoption and any changes to the AIPREF work.

A robots.txt file is host-specific. Every host/subdomain where the policy is expected to apply must serve and maintain the appropriate root-level file. User-triggered fetchers may deliberately operate outside normal robots.txt semantics, so vendor-specific documentation and server-side controls must be checked separately.

### Primary research and documentation
- Google Search Essentials: https://developers.google.com/search/docs/essentials
- Google helpful, reliable, people-first content: https://developers.google.com/search/docs/fundamentals/creating-helpful-content
- Google title links: https://developers.google.com/search/docs/appearance/title-link
- Google sitemap guidance: https://developers.google.com/search/docs/crawling-indexing/sitemaps/build-sitemap
- Google JavaScript SEO: https://developers.google.com/search/docs/crawling-indexing/javascript/javascript-seo-basics
- Google Software App structured data: https://developers.google.com/search/docs/appearance/structured-data/software-app
- OpenAI crawler guidance: https://developers.openai.com/api/docs/bots
- Anthropic crawler guidance: https://privacy.claude.com/en/articles/8896518-does-anthropic-crawl-data-from-the-web-and-how-can-site-owners-block-the-crawler
- Perplexity crawler guidance: https://docs.perplexity.ai/docs/resources/perplexity-crawlers
- Applebot and Applebot-Extended guidance: https://support.apple.com/en-gb/119829
- Google crawler and Google-Extended guidance: https://developers.google.com/crawling/docs/crawlers-fetchers/google-common-crawlers
- Google AI Search features and Google-Extended: https://developers.google.com/search/docs/appearance/ai-features
- Google announcement on the shared AI training control (30 October 2026): https://developers.google.com/search/blog/2026/10/ai-training-control
- Anthropic's 30 October 2026 explanation of its shared AI-training preference rollout and ClaudeBot precedence: https://privacy.claude.com/en/articles/8896518-does-anthropic-crawl-data-from-the-web-and-how-can-site-owners-block-the-crawler
- IETF individual draft for the `__usage_ai-training` policy token (work in progress): https://datatracker.ietf.org/doc/draft-kelley-aipref-training-preference-signal/
- Cloudflare's 4 August 2025 traffic observations about undeclared Perplexity crawler behavior (third-party observation, not a crawler-policy specification): https://blog.cloudflare.com/perplexity-is-using-stealth-undeclared-crawlers-to-evade-website-no-crawl-directives/
- IndexNow protocol: https://www.indexnow.org/documentation
- Bing Webmaster Guidelines: https://www.bing.com/webmasters/help/webmaster-guidelines-30fba23a
- Canva product directory: https://www.canva.com/
- Canva sitemap: https://www.canva.com/sitemap/
- Smallpdf: https://smallpdf.com/about
- iLovePDF user guide: https://www.ilovepdf.com/help/documentation
- TinyWow tools: https://tinywow.com/tools
- CloudConvert format catalog: https://cloudconvert.com/
- Photopea introduction: https://www.photopea.com/learn/
- remove.bg: https://www.remove.bg/
- Kapwing tools: https://www.kapwing.com/tools

## 4. Implementation workstreams

### WS-01 — Correct the enV identity everywhere
- Set the canonical product/site name to exactly `enV`.
- Remove expanded platform names from page titles, headings, descriptions, Open Graph, X/Twitter metadata, WebSite/Brand schema, `llms.txt`, share cards, generated inventory and tests.
- Keep `chAs Technologies LLC` as the publisher/parent Organization where appropriate, with enV represented as the product Brand/WebSite.
- Audit native Android/iOS information and store-facing text for the same identity rule.
- Preserve legal company attribution where it belongs; do not erase ownership information or insert it into every product label.

### WS-02 — Build a verified catalogue content inventory
The PR branch audit confirms 43 of 43 catalogue categories have an entry in `CATEGORY_TASK_GUIDANCE`; `scripts/check-support-center.mjs` protects that coverage. Every generated guide identifies its tool, retains the catalogue task statement when it is not already present in the page introduction, supplies a tool-framed example and includes the required guide sections. Each canonical guide is also classified by task-guidance source: `operation-specific` (a narrow stable-ID or name-pattern rule for a named operation or closely related family), `engine-specific` (shared guidance for an execution engine), `category-guidance` (shared guidance for the category), or `catalogue-fallback` (catalogue purpose plus generic usage advice). The generated inventory now reports these classes both in its summary and on each tool/guide row; the SEO artifact test checks the row-to-tool association. Prioritize catalogue-fallback first, then category-guidance and engine-specific guides for human source/runtime review. A task-guidance source label identifies only the origin of the 'When to use this tool' overview, example and validation; it is not a quality score or a classification of the entire guide. `src/lib/tool-documentation.test.ts` still enforces guide structure, catalogue binding, required sections and imported runtime-renderer coverage. These automated checks do not independently verify every tool's actual inputs, outputs, errors, privacy path, limits or platform-specific behavior; that source-level and browser/device audit remains required.

For every active, public, canonical tool:
- Start from the generated `docs/seo-tool-inventory.md`, which exposes stable IDs, catalogue status, engine operations, client-side/backend/account flags, SEO fields, canonical links and a task-guidance-source class for tools and guides. Those registry fields and task-guidance-source labels are review leads only; they are not runtime verification.
- Record tool ID, displayed name, canonical route, category/subcategory, current description, keywords, tags and related tools.
- Trace the actual route and engine operation; inspect forms, accepted inputs, supported output, controls, errors, limits and actual processing path.
- Verify client/local, backend, external-provider, AI-assisted, account, network and offline behavior from implementation—not from a marketing label alone.
- Identify duplicate aliases, generated variants, consolidated Studio modes, planned/under-production entries and non-indexable routes.
- Record evidence/source paths and a content owner/reviewer.
- Maintain explicit exclusions and canonical targets so thin duplicates and false tool routes do not enter the sitemap.

### WS-03 — Rewrite tool explanations individually
Each tool gets an accurate explanation at the appropriate depth:
1. **Tool card:** one short sentence stating the task and result.
2. **Tool page introduction:** what it does, what input is needed and what output it produces.
3. **How to use:** concise steps tied to the controls and sequence that actually exist.
4. **Inputs and outputs:** real supported formats, units, options and output types.
5. **Processing and privacy:** whether this operation runs locally, uses enV servers, calls an external provider, requires sign-in, or needs a connection.
6. **Limits and caveats:** real file/duration/size/precision/service limits, assumptions, rights requirements and cases the tool does not handle.
7. **Result checks:** how to confirm the result is valid for the user's intended use.
8. **Examples or FAQs:** add only where they materially help a person use or choose the tool.

Do not force every tool into a long article. Simple utilities need short, clear explanations. Complex studios, multi-step workflows, financial/health estimates, media processors and security tools need their additional task-specific context. Use the inventory's task-guidance-source class to prioritize human review, then record whether the actual controls and output were traced to source code and checked in a browser or on-device.

**Automated task-guidance-source is now implemented in the registry and generated inventory.** Every canonical public guide receives one of four labels:

- `operation-specific`: a narrow stable-ID or name-pattern rule supplies task advice for a named operation or a closely related family; it is not necessarily a one-tool-only rule.
- `engine-specific`: guidance comes from a shared engine-family rule.
- `category-guidance`: guidance comes from the category-level task guidance.
- `catalogue-fallback`: the catalogue purpose statement is used with a generic example and validation guidance.

The generated `docs/seo-tool-inventory.md` reports each task-guidance-source label in its `Task guidance source` column and gives totals for the canonical guide inventory. The classification applies only to the task-specific overview, example and validation in the 'When to use this tool' section. It does not classify every guide section, and an explicit tool rule is not automatically accurate, current or verified against live controls. It does not claim human editorial review, source/runtime correctness, privacy verification or device parity.

Use this order to prioritize the next review batch: `catalogue-fallback` first, then `category-guidance`, then `engine-specific`; still check `operation-specific` guides against their real interface because a dedicated rule can also become stale. For every class, verify the actual fields, output, failure states, processing location, required permissions/accounts, supported formats, limits and responsive/native behavior. Replace broad text only after that evidence is available.

**New operation-specific Creator guide coverage — source change committed, test run pending.** The guide rules now cover three distinct Creator operations:
- `*-content-calendar`: plans dated posts from a start date, requested count, weekdays and comma-separated format mix. It explicitly says that the result is a plan, not provider scheduling or auto-publishing.
- `*-content-planner`: creates undated editorial ideas from the supplied brand, topic, audience, goal and pillar; it does not read analytics or publish.
- `*-posting-time-helper`: ranks the audience activity windows the user enters from native analytics; it does not fetch analytics or predict a universal best time.
The source has dedicated examples and validation notes, and the hand-written guide contract now uses YouTube calendar/planner/posting-time records to exercise these rules and their `operation-specific` source label. A fresh test/typecheck run is still required. Evidence is in `src/lib/tool-documentation.ts`, `src/lib/tool-documentation.test.ts`, `src/lib/engines/creator.ts`, and `src/components/engines/creator-engine.tsx`.

### WS-04 — Rewrite every category

**Implemented foundation:** all 43 current category records now have distinct, plain-language descriptions and short task-oriented blurbs. The standard category route renders the description and blurb above the tool catalogue. The Design category has its own explorer with named workflow groups and explanatory copy. The existing generic grouping helper uses real `subcategory` metadata, creates sections only when at least two subcategories each contain at least two tools, and retains sparse or unlabeled entries under “Other tools”; where taxonomy is too thin, it falls back to the flat catalogue rather than fabricating groups.

**Known route exception:** the Creators & music route returns its dedicated `CreatorCategoryLauncher` before the standard category header, so the category description and blurb currently do not appear on that route. This needs an integration that preserves the specialist launcher's mobile-first layout. It was recorded as an outstanding route-specific gap rather than modifying the specialised launcher, which is outside this PR's original changed-file scope.

**Still required:**
- Compare every category description and blurb with its current active/beta tool inventory and actual runtime capabilities; refine any category whose copy overstates, omits, or misclassifies the available work.
- Verify subcategory labels against real workflows, check that similar tools are distinguishable, and ensure the correct canonical routes are linked.
- Feature representative tools only when they are active and their descriptions accurately match their functionality.
- Remove empty promises, redundant phrases and generic statements shared across unrelated categories.
- Browser-check the standard, Design, and Creators & music layouts at mobile, tablet and desktop widths, including filter behavior, “See more tools” behavior and categories with sparse taxonomy.

### WS-05 — Strengthen guide and content quality
- Keep the tool page as the source of truth for live capability.
- Make its guide useful beyond repeating the card description: include inputs, steps, assumptions, examples, outputs, processing disclosures and verification advice.
- Consolidate aliases and near-identical generated pages. Do not publish mass-produced doorway pages or pages that only swap a keyword.
- Review public help, About, platform, pricing, privacy, responsible-use and blog pages for consistent product identity and factual alignment.
- Do not write content merely to hit a word count or insert search phrases unnaturally.

### WS-06 — Search and AI discovery engineering
- Preserve and verify server-rendered, crawlable HTML for all canonical public pages.
- Keep crawler policy explicit by crawler purpose. Search crawlers, user-triggered retrieval agents and model-training crawlers are not interchangeable.
- IndexNow implementation is on the PR branch. Preserve the production-only key file, canonical URL change detection, removed URL handling, batching and bounded retry/backoff. HTTP 200 means the URL list was received; HTTP 202 means accepted with key validation pending. Neither response proves that a page was crawled or indexed. After production deployment, verify the live key file and run the one-time initial full-site synchronization described in `docs/seo-search-console-setup.md`. Google does not participate in IndexNow.
- Add sitemap `lastmod` only when a reliable per-page timestamp reflects a significant content change, such as a reviewed main-content, structured-data or important-link update. A deployment/build time or sitemap-generation time is not a valid substitute. Do not add meaningless `priority`/`changefreq` values.
- Verify sitemap coverage, shards, canonical host, status codes, robots directives and private-route exclusion.
- Evaluate whether a small machine-readable public catalogue index adds value for retrieval systems; do not invent a proprietary crawler standard or treat `llms.txt` as a ranking requirement.
- Test AI-search visibility using repeatable neutral discovery, how-to and branded verification prompts. Record exact citations, canonical URLs, factual accuracy and unsupported claims. Do not promise inclusion in any AI answer engine.

### WS-07 — Social and browser sharing
- Supply route-specific Open Graph/X cards for the homepage, major categories, representative tools and guides; use accurate tool names and descriptions.
- Ensure image dimensions, absolute URLs, accessible alt text, cache behavior and canonical URL consistency.
- Test public fetch access and real previews with the relevant platform inspection tools, including Facebook Sharing Debugger, LinkedIn Post Inspector and X card validation where available.
- Review browser-rendered and original HTTP HTML for page titles, headings, descriptions, navigation links and usable content.
- Treat external social mentions, directory submissions and community participation as a genuine distribution programme—not automated link spam.

### WS-08 — Measurement and external verification
- Google Search Console: verify the Domain property, submit the sitemap, inspect representative routes, record indexing/canonical/crawl status and search performance.
- Bing Webmaster Tools: verify ownership, submit the sitemap, use URL submission/IndexNow as appropriate, and monitor Bing/Copilot discovery signals available in the account.
- AI products: record dated prompt tests and exact citations separately from crawler access.
- Social platforms: verify preview fetches and refresh stale cached cards.
- Use existing first-party analytics and operational logs where appropriate to separate human referral traffic, crawler fetches, errors and route discovery. Respect existing consent, privacy and retention policies.
- Create a baseline before reporting improvement; do not present impressions, indexed pages, citations or traffic as complete until measured.

### WS-09 — Native store discovery and cross-surface consistency
- The branch now has a checked draft in `docs/native-store-listing.json` for Google Play and App Store copy. It keeps the product name enV, matches the Android application ID and iOS bundle identifier, and stays within the platforms' text-field limits.
- The draft describes the Android/iOS apps as native products and says Web-only tools open in the system browser. It does not promise that the whole app works offline.
- Support and privacy URLs point to the canonical enV host. Public Google Play and App Store URLs remain unset until the actual product pages can be verified.
- Store screenshots and feature assets still need capture from real Android/iPhone release builds; do not use Web screenshots or synthetic mockups as evidence of native functionality.
- The identity audit checks the app labels, package/bundle IDs, native inventory fingerprint, and shared Android/iOS native coverage manifest. It does not claim store-account ownership, listing publication, review approval or public availability.
- Store listing changes require the appropriate store account release and review; a web deployment cannot publish them automatically.

## 5. Copy quality standard and example structure

Illustrative examples only; final text must be derived from verified tool behavior.

**Platform homepage**
- Name/title: `enV`
- Description: "Find a tool for the task you're working on. Browse categories, open a tool and follow the steps to complete it."

**Category**
- Heading: `PDF & documents`
- Description: "Work with PDF files and documents. Merge pages, split files, convert formats and prepare documents using the tools available in this category."

**Tool**
- Heading: `Merge PDF`
- Card text: "Combine selected PDF files into one document."
- Detailed introduction should then state how files are selected, whether order can be changed, what file is returned, actual processing location, and any verified limits.

Descriptions should read naturally aloud. A person should understand the purpose without needing to decode keywords or marketing jargon.

## 6. Verification gates

A workstream is complete only when its implementation and evidence pass the relevant gates.

### Brand and copy
- No prohibited expanded platform-name variants remain in public product copy or metadata, except documented migration/history references where required.
- Company attribution appears only in relevant company/legal/publisher contexts.
- Every active public canonical tool has a unique, accurate, reviewed description.
- Every category has its own meaningful explanation; the support-center audit verifies task-guidance coverage against the category registry.
- No generic generator fallback is allowed to publish as final user-facing copy without review.
- Claims about AI, offline, privacy, processing location, formats and limits match executable behavior.

### Technical discovery
- The generated tool inventory includes stable tool IDs, catalogue status, engine operations, execution/account flags and canonical links, while explicitly stating that registry metadata is not runtime proof.
- `npm run check:seo` passes.
- `npm run audit:seo:rendered` passes.
- `npm run build`, typecheck and lint pass.
- Live SEO smoke verifies the current build SHA, actual robots/sitemap/llms responses, canonical redirects, rendered metadata/schema, required public routes and noindex exclusions.
- IndexNow key-file creation, URL selection, XML parsing, and retry/response-state behavior pass automated tests. Production key-file and endpoint acceptance still require a real canonical-domain deployment.
- Sitemap lastmod values are accurate and change only for significant updates.
- Social images return successful public responses and generate usable previews.
- Structured data passes the relevant schema and search-feature validation without fabricated ratings, review counts or pricing.

### Real-world discovery
- Google Search Console ownership and sitemap processing evidence is recorded.
- Bing Webmaster Tools ownership and sitemap processing evidence is recorded.
- Representative URLs have been inspected for crawl/index/canonical status.
- AI search and browser citation checks are dated and repeatable.
- Social previews have been checked with the platforms' own inspection tools.
- Search visibility is reported as measured results, not assumed from robots permissions.

## 7. Delivery order

1. Freeze the enV naming and copy rules; correct conflicting metadata and test expectations.
2. Produce the full catalogue/category inventory and identify generic, duplicate, inaccurate or unsupported descriptions.
3. Rewrite category descriptions and tool cards, then tool detail explanations and guides, in reviewed batches.
4. Upgrade sitemap freshness, IndexNow notification handling, crawler and rendered-page tests.
5. Add and test route-specific social cards.
6. Complete Google/Bing external verification and AI/social visibility baselines.
7. Audit Play Store/App Store copy and cross-surface identity.
8. Run the full quality gates and verify the actual production deployment before marking work complete.

## 8. Explicit non-goals and safeguards

- No promise of universal indexing, ranking, AI citations, recommendations or social reach.
- No mass-generated keyword pages or keyword stuffing.
- No fabricated reviews, ratings, testimonials, usage counts or supported formats.
- The branch's new `__usage_ai-training` group is a proposed conservative extension of the existing provider-specific training blocks, not an approved production policy change. Keep PR #146 draft and do not merge/deploy that group until the product owner explicitly approves the shared preference. Existing provider-specific rules remain unchanged.
- No new analytics tracker where existing first-party reporting can meet the requirement.
- No unrelated payment, wallet, native, or other agent work in this PR.
- No claims of external webmaster verification without access to the corresponding account evidence.

## 9. Research and implementation references

Internal files reviewed:
- `docs/seo-search-console-setup.md`
- `scripts/generate-seo-artifacts.mjs`
- `scripts/check-seo-artifacts.mjs`
- `scripts/check-seo-rendered-routes.mjs`
- `scripts/check-live-seo.mjs`
- `src/lib/seo-metadata.ts`
- `src/data/categories.ts`
- `scripts/gen-catalog.mjs`
- `src/lib/tool-documentation.ts`
- `src/routes/tools/$category/index.tsx`
- `vercel.json`

External research was reviewed on 14 November 2026. See the official and competitor links in section 3. Recheck platform-specific crawler, schema, indexing and store requirements against current documentation before implementation and release.
