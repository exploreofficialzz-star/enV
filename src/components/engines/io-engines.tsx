import { useState } from "react";
import { Button } from "@/components/ui/button";
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

export function TextEngine({ op }: { op: string }) {
  const [input, setInput] = useState("");
  const extra = TEXT_OPTION_FIELDS[op] ?? [];
  const [opts, setOpts] = useState(() => initialValues(extra));
  const { error, out, wrap, setOut, setError } = useRunner();
  const run = () =>
    wrap(() => {
      const fn = transforms[op];
      if (!fn) throw new Error("Unknown text operation.");
      return fn(input, opts);
    });
  return (
    <div className="space-y-4">
      {extra.length ? <FieldGrid fields={extra} values={opts} onChange={(n, v) => setOpts((o) => ({ ...o, [n]: v }))} /> : null}
      <label className="block space-y-1.5">
        <Label htmlFor="text-in">Input</Label>
        <Textarea id="text-in" value={input} onChange={(e) => setInput(e.target.value)} className="min-h-44 font-mono" />
      </label>
      <div className="flex flex-wrap gap-2">
        <Button type="button" onClick={run}>
          Run
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
  deadline: [{ name: "target", label: "Deadline", type: "date" }],
};

export function DateTimeEngine({ op }: { op: string }) {
  const fields = DATE_FIELDS[op] ?? [{ name: "value", label: "Date", type: "date" }];
  const [opts, setOpts] = useState(() => initialValues(fields));
  const [error, setError] = useState<string | null>(null);
  const [items, setItems] = useState<{ label: string; value: string }[]>([]);
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
      <Button type="submit">Calculate</Button>
      <ErrorBanner message={error} />
      <ResultPanel items={items} filename={`env-${op}.txt`} />
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
