import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ErrorBanner } from "@/components/tools/error-banner";
import { FieldGrid, type UiField } from "@/components/engines/fields";
import { initialValues } from "@/components/engines/initial-values";
import { CodeResult } from "@/components/engines/result-panel";
import { transforms } from "@/lib/engines/transforms";
import { runCodec } from "@/lib/engines/codecs";
import { runGenerator } from "@/lib/engines/generators";
import { runDateTime } from "@/lib/engines/datetime";
import { runSeo } from "@/lib/engines/seo";
import { ResultPanel } from "@/components/engines/result-panel";

function useRunner() {
  const [error, setError] = useState<string | null>(null);
  const [out, setOut] = useState("");
  const wrap = async (fn: () => string | Promise<string>) => {
    try {
      setError(null);
      setOut(await fn());
    } catch (e) {
      setOut("");
      setError(e instanceof Error ? e.message : "Something went wrong.");
    }
  };
  return { error, out, setOut, wrap, setError };
}

const TEXT_OPTION_FIELDS: Partial<Record<string, UiField[]>> = {
  "find-replace": [
    { name: "find", label: "Find", type: "text" },
    { name: "replace", label: "Replace with", type: "text" },
  ],
  wrap: [{ name: "width", label: "Column width", type: "number", defaultValue: 80 }],
  list: [
    {
      name: "style",
      label: "Style",
      type: "select",
      options: [
        { value: "bullets", label: "Bullets" },
        { value: "numbered", label: "Numbered" },
        { value: "comma", label: "Comma separated" },
      ],
    },
  ],
  "keyword-density": [{ name: "keyword", label: "Keyword", type: "text" }],
};

function segmentWords(input: string): string[] {
  if (typeof Intl !== "undefined" && "Segmenter" in Intl) {
    try {
      const Segmenter = (Intl as typeof Intl & { Segmenter: new (locales?: string | string[], options?: { granularity?: string }) => { segment(text: string): Iterable<{ segment: string; isWordLike?: boolean }> } }).Segmenter;
      const segmenter = new Segmenter(undefined, { granularity: "word" });
      return [...segmenter.segment(input)].filter((x) => x.isWordLike).map((x) => x.segment);
    } catch {
      // Fall back for browsers without a usable Intl.Segmenter implementation.
    }
  }
  return input.match(/\S+/gu) ?? [];
}

function countSentences(input: string): number {
  return (input.match(/[^.!?。！？]+[.!?。！？]+(?=\s|$)|[^.!?。！？]+$/gu) ?? []).filter((x) => x.trim()).length;
}

function countParagraphs(input: string): number {
  return input.split(/(?:\r?\n){2,}/).map((x) => x.trim()).filter(Boolean).length;
}

function buildTextDiff(a: string, b: string): { added: number; removed: number; unchanged: number; lines: string } {
  const left = a.split(/\r?\n/);
  const right = b.split(/\r?\n/);
  const rows = left.length, cols = right.length;
  const dp: number[][] = Array.from({ length: rows + 1 }, () => Array(cols + 1).fill(0));
  for (let i = rows - 1; i >= 0; i--) {
    for (let j = cols - 1; j >= 0; j--) dp[i][j] = left[i] === right[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
  }
  const out: string[] = [];
  let i = 0, j = 0, added = 0, removed = 0, unchanged = 0;
  while (i < rows && j < cols) {
    if (left[i] === right[j]) { out.push(`  ${left[i]}`); unchanged++; i++; j++; }
    else if (dp[i + 1][j] >= dp[i][j + 1]) { out.push(`- ${left[i]}`); removed++; i++; }
    else { out.push(`+ ${right[j]}`); added++; j++; }
  }
  while (i < rows) { out.push(`- ${left[i++]}`); removed++; }
  while (j < cols) { out.push(`+ ${right[j++]}`); added++; }
  return { added, removed, unchanged, lines: out.join("\n") };
}

export function TextEngine({ op }: { op: string }) {
  const [input, setInput] = useState("");
  const [compare, setCompare] = useState("");
  const [limit, setLimit] = useState("280");
  const [wpm, setWpm] = useState("200");
  const extra = TEXT_OPTION_FIELDS[op] ?? [];
  const [opts, setOpts] = useState(() => initialValues(extra));
  const { error, out, wrap, setOut, setError } = useRunner();
  const words = segmentWords(input);
  const chars = Array.from(input).length;
  const charsNoSpaces = Array.from(input.replace(/\s/gu, "")).length;
  const sentences = countSentences(input);
  const paragraphs = countParagraphs(input);
  const readingSeconds = words.length ? Math.ceil((words.length / Math.max(1, Number(wpm) || 200)) * 60) : 0;

  if (op === "word-counter" || op === "character-counter" || op === "sentence-counter" || op === "paragraph-counter" || op === "reading-time-calculator") {
    const limitValue = Math.max(1, Number(limit) || 1);
    const metric = op === "word-counter" ? words.length : op === "character-counter" ? chars : op === "sentence-counter" ? sentences : op === "paragraph-counter" ? paragraphs : Math.ceil(readingSeconds / 60);
    return (
      <div className="space-y-4">
        <label className="block space-y-1.5">
          <Label htmlFor="text-in">Text</Label>
          <Textarea id="text-in" value={input} onChange={(e) => setInput(e.target.value)} className="min-h-56 font-mono" placeholder="Paste or type your text…" />
        </label>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {[['Words', words.length], ['Characters', chars], ['No spaces', charsNoSpaces], ['Sentences', sentences], ['Paragraphs', paragraphs], ['Lines', input ? input.split(/\r?\n/).length : 0], ['Reading time', readingSeconds ? `${Math.max(1, Math.ceil(readingSeconds / 60))} min` : '0 min']].map(([label, value]) => (
            <div key={String(label)} className="rounded-lg border border-border bg-surface-2 p-3"><div className="text-xs text-muted">{label}</div><div className="mt-1 text-lg font-semibold tabular-nums">{value}</div></div>
          ))}
        </div>
        {(op === "character-counter" || op === "word-counter") ? (
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block space-y-1.5"><Label htmlFor="limit">Target limit</Label><Input id="limit" value={limit} onChange={(e) => setLimit(e.target.value)} inputMode="numeric" /></label>
            <div className="rounded-lg border border-border p-3"><div className="text-xs text-muted">Limit status</div><div className="mt-1 font-medium">{metric <= limitValue ? `${limitValue - metric} remaining` : `${metric - limitValue} over`}</div></div>
          </div>
        ) : null}
        {op === "reading-time-calculator" ? <label className="block max-w-sm space-y-1.5"><Label htmlFor="wpm">Reading speed (words/min)</Label><Input id="wpm" value={wpm} onChange={(e) => setWpm(e.target.value)} inputMode="numeric" /></label> : null}
        <CodeResult code={input ? `Words: ${words.length}\nCharacters: ${chars}\nCharacters without spaces: ${charsNoSpaces}\nSentences: ${sentences}\nParagraphs: ${paragraphs}\nLines: ${input.split(/\r?\n/).length}\nReading time: ${readingSeconds ? `${Math.max(1, Math.ceil(readingSeconds / 60))} min` : '0 min'}` : ""} filename="env-text-stats.txt" />
      </div>
    );
  }

  if (op === "text-diff") {
    const diff = buildTextDiff(input, compare);
    return (
      <div className="space-y-4">
        <div className="grid gap-4 lg:grid-cols-2">
          <label className="block space-y-1.5"><Label htmlFor="diff-a">Original text</Label><Textarea id="diff-a" value={input} onChange={(e) => setInput(e.target.value)} className="min-h-64 font-mono" /></label>
          <label className="block space-y-1.5"><Label htmlFor="diff-b">New text</Label><Textarea id="diff-b" value={compare} onChange={(e) => setCompare(e.target.value)} className="min-h-64 font-mono" /></label>
        </div>
        <div className="grid gap-2 sm:grid-cols-3"><div className="rounded-lg border border-border p-3"><div className="text-xs text-muted">Added lines</div><div className="text-lg font-semibold">{diff.added}</div></div><div className="rounded-lg border border-border p-3"><div className="text-xs text-muted">Removed lines</div><div className="text-lg font-semibold">{diff.removed}</div></div><div className="rounded-lg border border-border p-3"><div className="text-xs text-muted">Unchanged lines</div><div className="text-lg font-semibold">{diff.unchanged}</div></div></div>
        <CodeResult code={diff.lines} filename="env-text-diff.txt" />
      </div>
    );
  }

  const run = () => wrap(() => {
    const fn = transforms[op];
    if (!fn) throw new Error("Unknown text operation.");
    return fn(input, opts);
  });
  return (
    <div className="space-y-4">
      {extra.length ? <FieldGrid fields={extra} values={opts} onChange={(n, v) => setOpts((o) => ({ ...o, [n]: v }))} /> : null}
      <label className="block space-y-1.5"><Label htmlFor="text-in">Input</Label><Textarea id="text-in" value={input} onChange={(e) => setInput(e.target.value)} className="min-h-44 font-mono" /></label>
      <div className="flex flex-wrap gap-2"><Button type="button" onClick={run}>Run</Button><Button type="button" variant="ghost" onClick={() => { setInput(""); setOut(""); setError(null); }}>Reset</Button></div>
      <ErrorBanner message={error} />
      <CodeResult code={out} filename={`env-${op}.txt`} />
    </div>
  );
}

export function CodecEngine({ op }: { op: string }) {
  const [input, setInput] = useState("");
  const extra: UiField[] =
    op === "base-convert"
      ? [
          { name: "fromBase", label: "From base", type: "number", defaultValue: 10 },
          { name: "toBase", label: "To base", type: "number", defaultValue: 16 },
        ]
      : op === "hash-compare"
        ? [
            { name: "a", label: "Hash A", type: "text" },
            { name: "b", label: "Hash B", type: "text" },
          ]
        : [];
  const [opts, setOpts] = useState(() => initialValues(extra));
  const { error, out, wrap, setOut, setError } = useRunner();
  return (
    <div className="space-y-4">
      {extra.length ? <FieldGrid fields={extra} values={opts} onChange={(n, v) => setOpts((o) => ({ ...o, [n]: v }))} /> : null}
      {op !== "hash-compare" ? (
        <label className="block space-y-1.5">
          <Label htmlFor="codec-in">Input</Label>
          <Textarea id="codec-in" value={input} onChange={(e) => setInput(e.target.value)} className="min-h-36 font-mono" />
        </label>
      ) : null}
      <div className="flex flex-wrap gap-2">
        <Button type="button" onClick={() => wrap(() => runCodec(op, input, opts))}>
          Convert
        </Button>
        <Button
          type="button"
          variant="ghost"
          onClick={() => {
            setInput("");
            setOut("");
            setError(null);
          }}
        >
          Reset
        </Button>
      </div>
      <ErrorBanner message={error} />
      <CodeResult code={out} filename={`env-${op}.txt`} />
    </div>
  );
}

const GEN_FIELDS: Record<string, UiField[]> = {
  lorem: [
    { name: "count", label: "Count", type: "number", defaultValue: 3 },
    {
      name: "unit",
      label: "Unit",
      type: "select",
      options: [
        { value: "paragraphs", label: "Paragraphs" },
        { value: "sentences", label: "Sentences" },
        { value: "words", label: "Words" },
      ],
    },
  ],
  "random-number": [
    { name: "min", label: "Min", type: "number", defaultValue: 1 },
    { name: "max", label: "Max", type: "number", defaultValue: 100 },
    { name: "count", label: "How many", type: "number", defaultValue: 1 },
  ],
  "random-string": [{ name: "length", label: "Length", type: "number", defaultValue: 16 }],
  "random-hex": [{ name: "length", label: "Bytes", type: "number", defaultValue: 16 }],
  "secure-token": [{ name: "length", label: "Length", type: "number", defaultValue: 32 }],
  passphrase: [{ name: "words", label: "Words", type: "number", defaultValue: 6 }],
  "uuid-list": [{ name: "count", label: "Count", type: "number", defaultValue: 10 }],
  dummy: [{ name: "count", label: "Rows", type: "number", defaultValue: 5 }],
  teams: [
    { name: "names", label: "Names (one per line)", type: "textarea" },
    { name: "teams", label: "Number of teams", type: "number", defaultValue: 2 },
  ],
  "secret-santa": [{ name: "names", label: "Names (one per line)", type: "textarea" }],
  decision: [{ name: "options", label: "Options (one per line)", type: "textarea" }],
  hashtags: [{ name: "seed", label: "Keywords", type: "text", placeholder: "travel coffee japan" }],
  sku: [{ name: "prefix", label: "Prefix", type: "text", defaultValue: "SKU" }],
  "biz-name": [{ name: "seed", label: "Keyword", type: "text" }],
  "company-name": [{ name: "seed", label: "Keyword", type: "text" }],
  "brand-name": [{ name: "seed", label: "Keyword", type: "text" }],
  "product-name": [{ name: "seed", label: "Keyword", type: "text" }],
  nickname: [{ name: "name", label: "Given name", type: "text" }],
  dummyjson: [{ name: "count", label: "Count", type: "number", defaultValue: 5 }],
};

function genFieldsFor(op: string): UiField[] {
  if (GEN_FIELDS[op]) return GEN_FIELDS[op];
  if (["coin-flip"].includes(op)) return [];
  if (op === "dice-roller") return [
    { name: "dice", label: "Dice", type: "number", defaultValue: 1 },
    { name: "sides", label: "Sides", type: "number", defaultValue: 6 },
  ];
  if (op === "wheel" || op.endsWith("-wheel") || op.includes("decision-")) return [{ name: "options", label: "Options (one per line)", type: "textarea", defaultValue: "Option A\nOption B\nOption C" }];
  if (op.includes("team-") || op.includes("group-")) return [
    { name: "names", label: "Names (one per line)", type: "textarea", defaultValue: "Alex\nJordan\nSam\nTaylor" },
    ...(op.includes("group-") ? [{ name: "groups", label: "Groups", type: "number", defaultValue: 2 } as UiField] : []),
  ];
  if (op.endsWith("-list-generator") || op.endsWith("-generator") || op.endsWith("-picker") || op.endsWith("-randomizer")) return [{ name: "count", label: "How many", type: "number", defaultValue: 5 }];
  if (op.startsWith("dummy")) return GEN_FIELDS.dummy;
  if (op.startsWith("test-")) return [{ name: "count", label: "Count", type: "number", defaultValue: 8 }];
  return [{ name: "count", label: "Count", type: "number", defaultValue: 8 }];
}

export function GeneratorEngine({ op }: { op: string }) {
  const fields = genFieldsFor(op);
  const [opts, setOpts] = useState(() => initialValues(fields));
  const { error, out, wrap, setOut, setError } = useRunner();
  return (
    <div className="space-y-4">
      <FieldGrid fields={fields} values={opts} onChange={(n, v) => setOpts((o) => ({ ...o, [n]: v }))} />
      <div className="flex flex-wrap gap-2">
        <Button type="button" onClick={() => wrap(() => runGenerator(op, opts))}>
          Generate
        </Button>
        <Button
          type="button"
          variant="ghost"
          onClick={() => {
            setOut("");
            setError(null);
          }}
        >
          Clear
        </Button>
      </div>
      <ErrorBanner message={error} />
      <CodeResult code={out} filename={`env-${op}.txt`} />
    </div>
  );
}

const DATE_FIELDS: Record<string, UiField[]> = {
  age: [{ name: "birth", label: "Birth date", type: "date" }],
  "date-diff": [
    { name: "from", label: "From", type: "date" },
    { name: "to", label: "To", type: "date" },
  ],
  workday: [
    { name: "start", label: "Start", type: "date" },
    { name: "days", label: "Business days to add", type: "number", defaultValue: 10 },
  ],
  "business-days": [
    { name: "from", label: "From", type: "date" },
    { name: "to", label: "To", type: "date" },
  ],
  duration: [
    { name: "from", label: "From (ISO or date)", type: "text", placeholder: "2026-01-01 09:00" },
    { name: "to", label: "To", type: "text", placeholder: "2026-01-02 17:30" },
  ],
  timezone: [
    { name: "time", label: "Local time (ISO)", type: "text", placeholder: "2026-09-27T12:00" },
    { name: "fromTz", label: "From time zone", type: "text", defaultValue: "UTC" },
    { name: "toTz", label: "To time zone", type: "text", defaultValue: "America/New_York" },
  ],
  unix: [{ name: "value", label: "Unix seconds or ISO date", type: "text" }],
  format: [
    { name: "value", label: "Date", type: "date" },
    { name: "pattern", label: "Pattern", type: "text", defaultValue: "yyyy-MM-dd" },
  ],
  weekday: [{ name: "value", label: "Date", type: "date" }],
  "week-number": [{ name: "value", label: "Date", type: "date" }],
  leap: [{ name: "year", label: "Year", type: "number", defaultValue: new Date().getFullYear() }],
  birthday: [{ name: "birth", label: "Birth date", type: "date" }],
  "time-until": [{ name: "target", label: "Target date", type: "date" }],
  countdown: [{ name: "target", label: "Target date & time", type: "datetime-local" }],
  "world-clock": [{ name: "zones", label: "IANA time zones (one per line)", type: "textarea", defaultValue: "Africa/Lagos\\nEurope/London\\nAmerica/New_York\\nAsia/Tokyo" }],
  deadline: [{ name: "target", label: "Deadline", type: "date" }],
};

export function DateTimeEngine({ op }: { op: string }) {
  const fields = DATE_FIELDS[op] ?? [{ name: "value", label: "Date", type: "date" }];
  const [opts, setOpts] = useState(() => initialValues(fields));
  const [error, setError] = useState<string | null>(null);
  const [items, setItems] = useState<{ label: string; value: string }[]>([]);

  const live = op === "countdown" || op === "world-clock";
  useEffect(() => {
    if (!live) return;
    const tick = () => {
      try {
        setError(null);
        setItems(runDateTime(op, opts));
      } catch (err) {
        setItems([]);
        setError(err instanceof Error ? err.message : "Could not compute that date.");
      }
    };
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, [live, op, opts]);

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        try {
          setError(null);
          setItems(runDateTime(op, opts));
        } catch (err) {
          setItems([]);
          setError(err instanceof Error ? err.message : "Could not compute that date.");
        }
      }}
    >
      <FieldGrid fields={fields} values={opts} onChange={(n, v) => setOpts((o) => ({ ...o, [n]: v }))} />
      {!live ? <Button type="submit">Calculate</Button> : null}
      <ErrorBanner message={error} />
      {live ? (
        <div className="grid gap-3 sm:grid-cols-2">
          {items.map((item) => (
            <div key={item.label} className="rounded-xl border border-border bg-surface-2 p-4">
              <div className="text-xs font-medium uppercase tracking-wide text-muted">{item.label}</div>
              <div className="mt-1 break-words text-lg font-semibold tabular-nums">{item.value}</div>
            </div>
          ))}
        </div>
      ) : (
        <ResultPanel items={items} filename={`env-${op}.txt`} />
      )}
    </form>
  );
}

const SEO_FIELDS: Record<string, UiField[]> = {
  meta: [
    { name: "title", label: "Title", type: "text" },
    { name: "description", label: "Description", type: "textarea" },
    { name: "canonical", label: "Canonical URL", type: "text" },
  ],
  serp: [
    { name: "title", label: "Title", type: "text" },
    { name: "url", label: "URL", type: "text", defaultValue: "https://example.com/page" },
    { name: "description", label: "Description", type: "textarea" },
  ],
  og: [
    { name: "title", label: "og:title", type: "text" },
    { name: "description", label: "og:description", type: "textarea" },
    { name: "image", label: "og:image URL", type: "text" },
    { name: "url", label: "URL", type: "text" },
  ],
  "twitter-card": [
    { name: "title", label: "Title", type: "text" },
    { name: "description", label: "Description", type: "textarea" },
    { name: "image", label: "Image URL", type: "text" },
  ],
  schema: [
    {
      name: "kind",
      label: "Type",
      type: "select",
      options: [
        { value: "WebSite", label: "WebSite" },
        { value: "Article", label: "Article" },
        { value: "FAQPage", label: "FAQPage" },
      ],
    },
    { name: "name", label: "Name", type: "text" },
    { name: "description", label: "Description", type: "textarea" },
  ],
  sitemap: [{ name: "urls", label: "URLs (one per line)", type: "textarea" }],
  robots: [
    { name: "sitemap", label: "Sitemap URL", type: "text" },
    { name: "disallow", label: "Disallow paths (one per line)", type: "textarea", defaultValue: "/admin" },
  ],
  canonical: [{ name: "url", label: "Canonical URL", type: "text" }],
  hreflang: [{ name: "rows", label: "lang,url per line", type: "textarea", placeholder: "en,https://example.com/\nfr,https://example.com/fr/" }],
  utm: [
    { name: "url", label: "Base URL", type: "text" },
    { name: "source", label: "utm_source", type: "text" },
    { name: "medium", label: "utm_medium", type: "text", defaultValue: "email" },
    { name: "campaign", label: "utm_campaign", type: "text" },
  ],
  redirect: [
    { name: "from", label: "From path", type: "text", defaultValue: "/old" },
    { name: "to", label: "To URL", type: "text" },
  ],
  "robots-test": [
    { name: "robots", label: "robots.txt", type: "textarea", defaultValue: "User-agent: *\nDisallow: /admin\nAllow: /" },
    { name: "path", label: "Path to test", type: "text", defaultValue: "/admin/settings" },
    { name: "agent", label: "User-agent", type: "text", defaultValue: "*" },
  ],
  "sitemap-validator": [{ name: "xml", label: "Sitemap XML", type: "textarea" }],
  "jsonld-validator": [{ name: "jsonld", label: "JSON-LD", type: "textarea" }],
  headings: [{ name: "html", label: "HTML", type: "textarea" }],
  slug: [
    { name: "text", label: "Text", type: "text" },
    { name: "stopwords", label: "Stopwords (comma-separated)", type: "text", defaultValue: "the,a,an,and,or,of,to,in,on,for,with,by" },
  ],
  "title-length": [{ name: "text", label: "Title", type: "text" }],
  "description-length": [{ name: "text", label: "Meta description", type: "textarea" }],
  "meta-robots": [
    { name: "index", label: "Indexing", type: "select", options: [{ value: "index", label: "index" }, { value: "noindex", label: "noindex" }] },
    { name: "follow", label: "Links", type: "select", options: [{ value: "follow", label: "follow" }, { value: "nofollow", label: "nofollow" }] },
    { name: "snippet", label: "Snippet", type: "select", options: [{ value: "snippet", label: "snippet" }, { value: "nosnippet", label: "nosnippet" }] },
    { name: "maxSnippet", label: "max-snippet (optional)", type: "text" },
    { name: "maxImage", label: "max-image-preview (optional)", type: "select", options: [{ value: "", label: "not set" }, { value: "none", label: "none" }, { value: "standard", label: "standard" }, { value: "large", label: "large" }] },
  ],
  "llms-txt": [{ name: "name", label: "Site name", type: "text" }, { name: "description", label: "Description", type: "textarea" }, { name: "url", label: "Site URL", type: "text" }, { name: "pages", label: "Important pages (one per line)", type: "textarea" }],
  manifest: [
    { name: "name", label: "Name", type: "text", defaultValue: "My App" },
    { name: "short_name", label: "Short name", type: "text", defaultValue: "App" },
    { name: "theme", label: "Theme color", type: "text", defaultValue: "#0d9f8a" },
  ],
};

export function SeoEngine({ op }: { op: string }) {
  const fields = SEO_FIELDS[op] ?? [{ name: "title", label: "Title", type: "text" }];
  const [opts, setOpts] = useState(() => initialValues(fields));
  const [error, setError] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [preview, setPreview] = useState("");
  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        try {
          setError(null);
          const r = runSeo(op, opts);
          setCode(r.code);
          setPreview(r.preview ?? "");
        } catch (err) {
          setCode("");
          setError(err instanceof Error ? err.message : "Could not generate that snippet.");
        }
      }}
    >
      <FieldGrid fields={fields} values={opts} onChange={(n, v) => setOpts((o) => ({ ...o, [n]: v }))} />
      <Button type="submit">Generate</Button>
      <ErrorBanner message={error} />
      {preview ? (
        <div className="rounded-lg bg-surface-2 p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-subtle">Preview</p>
          <div className="mt-2 text-sm" dangerouslySetInnerHTML={{ __html: preview }} />
        </div>
      ) : null}
      <CodeResult code={code} filename={`env-${op}.txt`} />
    </form>
  );
}
