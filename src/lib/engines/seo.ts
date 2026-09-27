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
    case "robots-test": {
      const rules = (opts.robots || "").split(/\r?\n/).map((line) => line.trim()).filter((line) => line && !line.startsWith("#"));
      const path = opts.path || "/";
      const agent = (opts.agent || "*").toLowerCase();
      let agents: string[] = []; let best = -1; let allowed = true; let matchedRule = "";
      for (const line of rules) {
        const [rawKey, ...rest] = line.split(":"); const key = rawKey?.trim().toLowerCase(); const value = rest.join(":").trim();
        if (key === "user-agent") { agents = [value.toLowerCase()]; continue; }
        if ((key === "allow" || key === "disallow") && (agents.includes("*") || agents.includes(agent))) {
          if (!value) continue;
          const escaped = value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\\\*/g, ".*");
          if (new RegExp("^" + escaped, "i").test(path) && value.length >= best) { best = value.length; allowed = key === "allow"; matchedRule = value; }
        }
      }
      return { code: JSON.stringify({ agent, path, allowed, matchedRule: matchedRule || null }, null, 2), preview: `<div><strong>${allowed ? "Allowed" : "Blocked"}</strong><div class="mt-1 text-sm">${esc(path)}</div></div>` };
    }
    case "sitemap-validator": {
      const xml = opts.xml || ""; if (!xml.trim()) throw new Error("Paste sitemap XML first.");
      const doc = new DOMParser().parseFromString(xml, "application/xml");
      if (doc.querySelector("parsererror")) throw new Error("Invalid XML: the sitemap could not be parsed.");
      const root = doc.documentElement; const isUrlset = root?.localName === "urlset"; const isIndex = root?.localName === "sitemapindex";
      if (!isUrlset && !isIndex) throw new Error("Root element must be <urlset> or <sitemapindex>.");
      const locs = Array.from(doc.getElementsByTagNameNS("*", "loc")).map((n) => (n.textContent || "").trim()).filter(Boolean);
      const invalid = locs.filter((u) => { try { new URL(u); return false; } catch { return true; } }); const unique = new Set(locs);
      return { code: JSON.stringify({ valid: invalid.length === 0, type: isUrlset ? "urlset" : "sitemapindex", urlCount: locs.length, duplicateCount: locs.length - unique.size, invalidUrlCount: invalid.length, invalidUrls: invalid.slice(0, 20) }, null, 2), preview: `<div><strong>${invalid.length === 0 ? "Valid structure" : "Issues found"}</strong><div class="mt-1 text-sm">${locs.length} locations checked</div></div>` };
    }
    case "jsonld-validator": {
      const raw = opts.jsonld || ""; if (!raw.trim()) throw new Error("Paste JSON-LD first."); let parsed: unknown;
      try { parsed = JSON.parse(raw); } catch { throw new Error("Invalid JSON: fix the JSON syntax before validating JSON-LD."); }
      const nodes = Array.isArray(parsed) ? parsed : [parsed]; const missingContext = nodes.filter((n: any) => !n || typeof n !== "object" || !("@context" in n)); const types = nodes.map((n: any) => n?.["@type"]).filter(Boolean);
      return { code: JSON.stringify({ validJson: true, hasSchemaContext: missingContext.length === 0, types, nodeCount: nodes.length }, null, 2), preview: `<div><strong>${missingContext.length === 0 ? "Valid JSON-LD structure" : "JSON is valid, but @context is missing"}</strong></div>` };
    }
    case "headings": {
      const html = opts.html || ""; if (!html.trim()) throw new Error("Paste HTML containing your headings."); const doc = new DOMParser().parseFromString(html, "text/html");
      const headings = Array.from(doc.querySelectorAll("h1,h2,h3,h4,h5,h6")).map((el) => ({ level: Number(el.tagName.substring(1)), text: (el.textContent || "").trim() })); const h1s = headings.filter((h) => h.level === 1);
      const skips = headings.filter((h, i) => i > 0 && h.level > headings[i - 1].level + 1); const empty = headings.filter((h) => !h.text);
      return { code: JSON.stringify({ headingCount: headings.length, h1Count: h1s.length, missingH1: h1s.length === 0, multipleH1: h1s.length > 1, skippedLevels: skips, emptyHeadings: empty, outline: headings }, null, 2), preview: `<div><strong>${headings.length} headings found</strong><div class="mt-1 text-sm">H1: ${h1s.length} · skipped: ${skips.length} · empty: ${empty.length}</div></div>` };
    }
    case "slug": {
      const text = (opts.text || "").normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim(); const stop = new Set((opts.stopwords || "the,a,an,and,or,of,to,in,on,for,with,by").split(",").map((x) => x.trim()).filter(Boolean));
      const slug = text.replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-+|-+$/g, "").split("-").filter((x) => !stop.has(x)).join("-"); return { code: slug, preview: `<div><strong>/${esc(slug)}</strong></div>` };
    }
    case "title-length": { const value = opts.text || ""; const n = [...value].length; return { code: JSON.stringify({ characters: n, guidance: n <= 60 ? "Within common working guidance; search engines may still rewrite it." : "Above common guidance; consider shortening the visible title." }, null, 2), preview: `<div><strong>${n} characters</strong></div>` }; }
    case "description-length": { const value = opts.text || ""; const n = [...value].length; return { code: JSON.stringify({ characters: n, guidance: n <= 160 ? "Within common working guidance; snippets are not guaranteed." : "Above common guidance; search engines may truncate or rewrite it." }, null, 2), preview: `<div><strong>${n} characters</strong></div>` }; }
    case "meta-robots": { const parts = [opts.index === "noindex" ? "noindex" : "index", opts.follow === "nofollow" ? "nofollow" : "follow"]; if (opts.snippet === "nosnippet") parts.push("nosnippet"); if (opts.maxSnippet) parts.push(`max-snippet:${opts.maxSnippet}`); if (opts.maxImage) parts.push(`max-image-preview:${opts.maxImage}`); return { code: `<meta name="robots" content="${esc(parts.join(", "))}" />` }; }
    case "llms-txt": return { code: `# ${title}\n\n> ${desc}\n\n## About\n- ${url}\n\n## Important pages\n- ${opts.pages || "/"}` };
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
