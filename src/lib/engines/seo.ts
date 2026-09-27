function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function runSeo(
  op: string,
  opts: Record<string, string>,
): { title?: string; code: string; preview?: string } {
  const title = opts.title || opts.name || "Page title";
  const desc = opts.description || "A short description.";
  const url = opts.url || opts.canonical || "https://example.com/";
  switch (op) {
    case "meta":
      return {
        code: [
          `<title>${esc(title)}</title>`,
          `<meta name="description" content="${esc(desc)}" />`,
          opts.canonical ? `<link rel="canonical" href="${esc(opts.canonical)}" />` : "",
        ]
          .filter(Boolean)
          .join("\n"),
      };
    case "serp":
      return {
        code: `${title}\n${url}\n${desc}`,
        preview: `<p style="font:16px/1.4 Arial,sans-serif"><span style="color:#1a0dab">${esc(title)}</span><br/><span style="color:#006621">${esc(url)}</span><br/><span style="color:#545454">${esc(desc)}</span></p>`,
      };
    case "og":
      return {
        code: [
          `<meta property="og:title" content="${esc(title)}" />`,
          `<meta property="og:description" content="${esc(desc)}" />`,
          `<meta property="og:image" content="${esc(opts.image || "")}" />`,
          `<meta property="og:url" content="${esc(url)}" />`,
          `<meta property="og:type" content="website" />`,
        ].join("\n"),
      };
    case "twitter-card":
      return {
        code: [
          `<meta name="twitter:card" content="summary_large_image" />`,
          `<meta name="twitter:title" content="${esc(title)}" />`,
          `<meta name="twitter:description" content="${esc(desc)}" />`,
          `<meta name="twitter:image" content="${esc(opts.image || "")}" />`,
        ].join("\n"),
      };
    case "schema": {
      const kind = opts.kind || "WebSite";
      const obj = { "@context": "https://schema.org", "@type": kind, name: title, description: desc };
      return { code: `<script type="application/ld+json">\n${JSON.stringify(obj, null, 2)}\n</script>` };
    }
    case "sitemap": {
      const urls = (opts.urls || url)
        .split("\n")
        .map((u) => u.trim())
        .filter(Boolean);
      const body = urls
        .map((u) => `  <url>\n    <loc>${esc(u)}</loc>\n  </url>`)
        .join("\n");
      return {
        code: `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${body}\n</urlset>`,
      };
    }
    case "robots": {
      const disallow = (opts.disallow || "")
        .split("\n")
        .map((p) => p.trim())
        .filter(Boolean)
        .map((p) => `Disallow: ${p}`)
        .join("\n");
      return {
        code: `User-agent: *\nAllow: /\n${disallow}${opts.sitemap ? `\nSitemap: ${opts.sitemap}` : ""}`.trim(),
      };
    }
    case "canonical":
      return { code: `<link rel="canonical" href="${esc(url)}" />` };
    case "hreflang": {
      const rows = (opts.rows || "")
        .split("\n")
        .map((r) => r.trim())
        .filter(Boolean);
      if (!rows.length) throw new Error("Enter rows as lang,url");
      return {
        code: rows
          .map((r) => {
            const [lang, href] = r.split(",");
            return `<link rel="alternate" hreflang="${esc((lang || "").trim())}" href="${esc((href || "").trim())}" />`;
          })
          .join("\n"),
      };
    }
    case "utm": {
      const u = new URL(opts.url || "https://example.com/");
      if (opts.source) u.searchParams.set("utm_source", opts.source);
      if (opts.medium) u.searchParams.set("utm_medium", opts.medium);
      if (opts.campaign) u.searchParams.set("utm_campaign", opts.campaign);
      return { code: u.toString() };
    }
    case "redirect":
      return {
        code: [
          `# nginx\nrewrite ^${opts.from || "/old"}$ ${opts.to || "/"} permanent;`,
          `# netlify\n${opts.from || "/old"} ${opts.to || "/"} 301`,
          `<!-- meta -->\n<meta http-equiv="refresh" content="0;url=${esc(opts.to || "/")}">`,
        ].join("\n\n"),
      };
    case "manifest":
      return {
        code: JSON.stringify(
          {
            name: opts.name || "App",
            short_name: opts.short_name || "App",
            start_url: "/",
            display: "standalone",
            background_color: "#ffffff",
            theme_color: opts.theme || "#0d9f8a",
          },
          null,
          2,
        ),
      };
    default:
      throw new Error("Unknown SEO operation.");
  }
}
