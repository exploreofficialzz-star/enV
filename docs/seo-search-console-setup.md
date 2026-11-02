# enV search-engine and AI-search setup

This runbook covers the external ownership and monitoring steps for the SEO/GEO work in this repository. The application now generates its public robots.txt, XML sitemap, and llms.txt during the production build. Route-level titles, descriptions, canonical URLs, structured data, public-tool filtering, and noindex policies are managed in source.

## 1. Verify the canonical domain

Use https://envtools.store as the canonical site origin. The site currently declares that origin in src/lib/seo-metadata.ts. Keep the www and alternate domains redirected or canonicalized to this origin; do not submit duplicate host properties as separate canonical sites unless they are deliberately separate products. The Vercel project configuration also includes permanent host-based redirects for www.envtools.store, envtools.site, www.envtools.site, and en-v.vercel.app. Vercel domain-level redirect settings can run before project routing, so confirm each configured alias ultimately resolves directly to https://envtools.store.

## 2. Google Search Console

1. Add a Domain property for envtools.store in Google Search Console.
2. Complete the DNS TXT ownership check at the registrar or DNS host. The application does not need access to the DNS token.
3. Submit https://envtools.store/sitemap.xml in the Sitemaps report.
4. Inspect the homepage, /tools, representative category pages, individual tools, and their /blog/tool-{tool-id} guides with URL Inspection.
5. Review Page indexing, duplicate/canonical selection, crawl stats, Core Web Vitals, and manual-action/security reports.

A URL listed in the sitemap is only a discovery hint. Google decides independently whether a URL is eligible, indexed, or shown for a query.

## 3. Bing Webmaster Tools

1. Add https://envtools.store in Bing Webmaster Tools. Importing the verified Google Search Console property is an option where available.
2. Complete the site ownership check using the method Bing provides.
3. Submit https://envtools.store/sitemap.xml.
4. Review crawl errors, indexed URLs, canonical selection, search performance, and Copilot-related citation/grounding reports where the account exposes them.

## 4. Optional HTML verification meta tags

For URL-prefix verification, the root route and all SEO-managed page heads can emit provider verification tags at build time.

Set these Vercel project environment variables for the appropriate deployment environments:

- VITE_GOOGLE_SITE_VERIFICATION — the exact Google Search Console HTML meta verification value.
- VITE_BING_SITE_VERIFICATION — the exact Bing Webmaster Tools msvalidate.01 value.

Use only the token value supplied by the relevant provider, not a complete HTML tag. Save the variables in Vercel, then trigger a new deployment. The values are public verification markers and are intentionally not committed to Git.

DNS verification is often preferable because it is independent of application deployments.

## 5. Crawler policy

The generated robots policy allows search/citation crawlers such as Googlebot, Bingbot, OAI-SearchBot, Claude-SearchBot, PerplexityBot, and Applebot to access public pages while keeping /api/ routes out of crawl paths.

The crawler tokens have different purposes:

- OAI-SearchBot is the crawler OpenAI uses to surface pages in ChatGPT Search. GPTBot is a separate training crawler and remains disallowed.
- Claude-SearchBot is used to improve Claude search results; Claude-User supports user-directed retrieval. ClaudeBot is a separate training crawler and remains disallowed.
- PerplexityBot supports Perplexity search discovery; Perplexity-User is for user-directed requests.
- Applebot supports Apple search discovery. Applebot-Extended is a separate extended/model-related control and remains disallowed.
- Google-Extended is disallowed. It is not a Google Search crawler and does not affect Google Search indexing or rankings. Googlebot remains allowed, so this does not block ordinary Search crawling or eligibility for Search-based AI features. Blocking Google-Extended avoids granting separate permission for Gemini Apps grounding and future model use.

ChatGPT-User is intentionally not listed as a search crawler: OpenAI documents it as a user-triggered fetcher, not the agent that determines ChatGPT Search inclusion. Allowing OAI-SearchBot is the relevant Search setting.

Private account, wallet, settings, and interaction-only routes receive page-level noindex. A robots disallow rule is not a replacement for noindex; crawlers need to be able to fetch a page to see its indexing directive.

## 6. What to measure

Track outcomes by page group, not only by site-wide average:

- Brand queries: enV, envtools, and relevant company/product name variants.
- Non-brand tool queries: each tool's name, category, and the use cases actually represented by its catalogue keywords and guide.
- Discovery health: submitted versus indexed URLs, crawl errors, canonical duplicates, and the ratio of public tool routes with valid guides.
- Search performance: impressions, clicks, click-through rate, query groups, and average position by route group.
- Experience quality: mobile usability, Core Web Vitals, server response errors, and rendered-page accessibility.
- AI visibility: verify actual source citations and mentions in ChatGPT Search, Claude Search, Perplexity, and Copilot with repeatable prompts. A crawler being allowed does not guarantee a mention or citation.

## 7. Repeatable AI-search visibility checks

Run the same test set in each search-enabled product being measured. Use its search mode when available, record the product/model and date, and keep the full answer or a screenshot as evidence.

For every canonical public tool and guide in the generated inventory, run at least one neutral discovery prompt and one branded verification prompt:

- **Neutral discovery:** "I need to [state the task described by this tool's public description]. Which online tools can do this? Compare the relevant capabilities and cite the official source pages." Do not mention enV in this prompt; it measures unprompted discovery.
- **Neutral how-to:** "How do I [state the task] safely and correctly? Explain the required inputs, important assumptions, and how to check the output. Cite the official guide."
- **Branded verification:** "Does enV offer a [tool name] for [the task]? Link the exact official tool page and its usage guide, and describe only capabilities stated on those pages."

Record these outcomes separately: tool mentioned, exact canonical tool URL cited, exact guide URL cited, factual description accurate, unsupported capability claimed, and competing sources cited. A name mention without a relevant source URL is not a verified citation. Treat a wrong URL or an unsupported feature claim as a regression to investigate.

Repeat prompts verbatim over time. Do not combine neutral and branded results into one visibility score, and do not infer ranking or citation probability from crawler permissions, structured data, sitemap inclusion, or `llms.txt`.

## 8. Release checklist

Before considering an SEO release complete:

- npm run check:seo passes and generated files are current.
- The rendered SEO route audit passes for indexable and noindex routes.
- Individual tool pages and usage guides return successful server-rendered HTML with unique titles, descriptions, canonicals, and appropriate structured data.
- Public policy, support, platform, and token-guide pages appear in the sitemap.
- Private or interaction-only routes remain noindex.
- The production deployment is READY and the live canonical domain serves the same robots.txt, sitemap, and llms.txt as the committed build.
- The `Production live connectivity smoke` workflow runs every 30 minutes and on manual dispatch. Its `scripts/check-live-seo.mjs` step checks the live robots policy, sitemap and shards, llms.txt, canonical host, required public routes, private-route exclusion, and representative server-rendered page metadata/schema.
- Search Console and Bing Webmaster Tools have verified ownership and have accepted the sitemap.

This setup improves crawlability and clarity. It does not promise rankings, indexing, rich results, AI citations, or traffic.

## 9. External release evidence still required

The repository can generate and test discovery files, route metadata, canonical URLs, and crawler policies. It cannot prove that the owner has completed external webmaster verification or that a search provider has accepted a sitemap. Record the following evidence before closing the SEO release:

| External task | Completion evidence |
| --- | --- |
| Verify the `envtools.store` Domain property in Google Search Console | Search Console reports the property as verified. |
| Submit `https://envtools.store/sitemap.xml` to Google Search Console | The Sitemaps report shows the submitted sitemap and a successful read/processing status. |
| Verify `https://envtools.store` in Bing Webmaster Tools | Bing reports successful site ownership verification. |
| Submit `https://envtools.store/sitemap.xml` to Bing | Bing reports the sitemap as successfully processed. |
| Verify the production deployment | Vercel shows a READY production deployment whose Git SHA matches the intended `main` commit; the live domain serves the same robots, sitemap, and llms files as that build. |
| Establish a search baseline | Record the first available impressions, clicks, indexed-page counts, crawl errors, and query/citation samples by page group. |

Do not place DNS ownership tokens, private API credentials, or account passwords in the repository. HTML verification values may be supplied through the named Vercel environment variables above. A generated sitemap or an allowed crawler is not evidence of indexing, ranking, traffic, or AI citation.
