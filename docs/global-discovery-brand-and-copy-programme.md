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
- Crawler policy explicitly handles Googlebot, Bingbot, OAI-SearchBot, Claude-SearchBot / Claude-User, PerplexityBot / Perplexity-User and Applebot. Separate training/model-use agents are deliberately blocked in the current policy. Preserve the distinction and obtain an explicit product-policy decision before changing it.
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

This snapshot records the latest inspected PR head, `273e86c5b9cc3d51372a3e57193c905870bf48f9` (92 commits ahead of `main`, 0 behind at the time checked). It distinguishes successful discovery checks from unrelated failures and work that is still running.

| Gate | Observed result | Interpretation |
|---|---|---|
| Production web build in rendered SEO workflow | Passed; generated 10,174 public URLs and 4,822 public tools | Build and registry-based artifact generation succeeded for this PR head. |
| Catalogue-wide SEO artifact checks | Passed | Tool and guide metadata, canonical URLs, structured data, sitemap, crawler policy and generated inventory assertions passed. |
| Rendered SEO/crawler checks | Passed | The workflow verified rendered metadata, canonicals, structured data, noindex policy, `robots.txt`, `sitemap.xml` and `llms.txt`, including title-collision routes. |
| Tool-guide navigation | Passed | The browser clicked “Read the full guide”, reached the canonical guide URL through client-side navigation and rendered the complete guide. A product article link also reached a successful HTTP 200 page. |
| Rendered accessibility report | Workflow passed, but report contains nonzero findings | This is not an assertion that every page is accessibility-clean. The report recorded findings on the homepage, tools directory and several other routes; those need their own triage and must not be described as zero violations. |
| Billing integration validation | Passed | Independent gate; no claim about search visibility. |
| User Behavior analytics security tests | Passed | Independent gate; no claim about search visibility. |
| Ad-supported guest access | Passed | Independent gate; no claim about search visibility. |
| AI provider platform tests | Passed | Independent gate; no claim about AI-search citations. |
| Date & Time Android and Web checks | Passed | The iOS Date & Time test was still running in the inspected snapshot. |
| Full Web/Android authoritative gate | Web subjob failed an existing Business Studio source-contract assertion requiring “Optional logo (stays on this device)”; Android subjob was still running | The assertion is in `scripts/check-business-studios.mjs` and the relevant Business Studio implementation is not part of this PR's changed files. Do not change that agent's work in this discovery PR. |
| Developer Studios quality gate | Failed an existing UI marker assertion for “On-device processing” | This is an independent Developer Studios defect outside the discovery PR's changed-file scope; leave it with that workstream. |
| Native iOS and native iOS accessibility | Still running at the time checked | No pass is claimed until the jobs finish. |
| Production Check and other reference/browser checks | Still running at the time checked | No pass is claimed until the jobs finish. |
| Vercel preview | `Vercel – env` reported a build-rate-limit failure; there was no deployment record for this PR head | A previously READY preview used older commit `865e545e54c85a2d86671cc9cbf1cfb48d639a64`, not this PR head. Do not use that URL as evidence for the latest changes. Production remained on `main`. |

The rendered SEO workflow is linked at https://github.com/exploreofficialzz-star/enV/actions/runs/43605636353. The Web/Android workflow is at https://github.com/exploreofficialzz-star/enV/actions/runs/43605636253. The Developer Studios workflow is at https://github.com/exploreofficialzz-star/enV/actions/runs/43605636267.

These results verify source/build behavior on the PR branch only. They do not establish production deployment, Search Console/Bing ownership, search indexing, ranking, AI citations or live social-preview fetches.

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

### Primary research and documentation
- Google Search Essentials: https://developers.google.com/search/docs/essentials
- Google helpful, reliable, people-first content: https://developers.google.com/search/docs/fundamentals/creating-helpful-content
- Google title links: https://developers.google.com/search/docs/appearance/title-link
- Google sitemap guidance: https://developers.google.com/search/docs/crawling-indexing/sitemaps/build-sitemap
- Google JavaScript SEO: https://developers.google.com/search/docs/crawling-indexing/javascript/javascript-seo-basics
- Google Software App structured data: https://developers.google.com/search/docs/appearance/structured-data/software-app
- OpenAI crawler guidance: https://developers.openai.com/api/docs/bots
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
The PR branch audit confirms 43 of 43 catalogue categories have an entry in `CATEGORY_TASK_GUIDANCE`; `scripts/check-support-center.mjs` protects that coverage. Every guide now identifies its specific tool, keeps the catalogue task statement when it is not already present in the page introduction, supplies a tool-framed example and includes the required guide sections. `src/lib/tool-documentation.test.ts` checks the category and engine fallbacks, representative hand-written guides, and now iterates every canonical public tool to enforce that guide contract. This is catalogue-grounded copy coverage, not proof that every active engine's real controls, outputs, errors, privacy path and limits have been manually or browser-verified; that source-level per-tool audit remains required.

For every active, public, canonical tool:
- Start from the generated `docs/seo-tool-inventory.md`, which now exposes stable IDs, catalogue status, engine operations, client-side/backend/account flags, SEO fields and canonical links for tools and guides. Those registry fields are review leads only; they are not runtime verification.
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

Do not force every tool into a long article. Simple utilities need short, clear explanations. Complex studios, multi-step workflows, financial/health estimates, media processors and security tools need their additional task-specific context.

### WS-04 — Rewrite every category
- Give every category a distinct, plain-language description that defines what belongs there.
- Add a short category introduction explaining the main jobs people can complete.
- Group tools by real subcategories or workflows where the catalogue supports that taxonomy.
- Help users choose between similar tools and link to the relevant canonical tool pages.
- Feature representative tools only when they are active and the descriptions accurately match their functionality.
- Remove empty promises, redundant phrases and generic statements shared across unrelated categories.

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
- Audit Google Play and Apple App Store product names, short/long descriptions, screenshots, category/keyword fields, support links and privacy links.
- Keep the name enV consistent while writing store descriptions that accurately distinguish native Android/iOS capabilities from the web version.
- Verify web-to-app links and canonical website references without presenting native apps as web wrappers.
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
- No change to crawler training/model-use policy without an explicit decision.
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
