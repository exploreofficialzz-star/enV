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

Training-oriented crawler controls are separate: GPTBot, ClaudeBot, and Applebot-Extended are disallowed. Do not assume that a user-facing search crawler and a model-training crawler have the same purpose or robots token.

Private account, wallet, settings, and interaction-only routes receive page-level noindex. A robots disallow rule is not a replacement for noindex; crawlers need to be able to fetch a page to see its indexing directive.

## 6. What to measure

Track outcomes by page group, not only by site-wide average:

- Brand queries: enV, envtools, and relevant company/product name variants.
- Non-brand tool queries: each tool's name, category, and the use cases actually represented by its catalogue keywords and guide.
- Discovery health: submitted versus indexed URLs, crawl errors, canonical duplicates, and the ratio of public tool routes with valid guides.
- Search performance: impressions, clicks, click-through rate, query groups, and average position by route group.
- Experience quality: mobile usability, Core Web Vitals, server response errors, and rendered-page accessibility.
- AI visibility: verify actual source citations and mentions in ChatGPT Search, Claude Search, Perplexity, and Copilot with repeatable prompts. A crawler being allowed does not guarantee a mention or citation.

## 7. Release checklist

Before considering an SEO release complete:

- npm run check:seo passes and generated files are current.
- The rendered SEO route audit passes for indexable and noindex routes.
- Individual tool pages and usage guides return successful server-rendered HTML with unique titles, descriptions, canonicals, and appropriate structured data.
- Public policy, support, platform, and token-guide pages appear in the sitemap.
- Private or interaction-only routes remain noindex.
- The production deployment is READY and the live canonical domain serves the same robots.txt, sitemap, and llms.txt as the committed build.
- Search Console and Bing Webmaster Tools have verified ownership and have accepted the sitemap.

This setup improves crawlability and clarity. It does not promise rankings, indexing, rich results, AI citations, or traffic.
