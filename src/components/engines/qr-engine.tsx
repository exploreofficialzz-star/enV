import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { ErrorBanner } from "@/components/tools/error-banner";
import { FieldGrid, type UiField } from "@/components/engines/fields";
import { downloadBlob, downloadText } from "@/lib/utils";
import { Download, Copy } from "lucide-react";

const COMMON_FIELDS: Record<string, UiField[]> = {
  text: [{ name: "text", label: "Text or URL", type: "textarea", placeholder: "https://example.com" }],
  url: [{ name: "url", label: "URL", type: "text", placeholder: "https://example.com" }],
  wifi: [
    { name: "ssid", label: "Network name (SSID)", type: "text" },
    { name: "password", label: "Password", type: "text" },
    { name: "security", label: "Security", type: "select", options: [{ value: "WPA", label: "WPA/WPA2" }, { value: "WEP", label: "WEP" }, { value: "nopass", label: "No password" }] },
    { name: "hidden", label: "Hidden network", type: "select", options: [{ value: "false", label: "No" }, { value: "true", label: "Yes" }] },
  ],
  whatsapp: [{ name: "phone", label: "Phone with country code", type: "text", placeholder: "2349012345678" }, { name: "text", label: "Message", type: "textarea" }],
  email: [{ name: "to", label: "Email", type: "text" }, { name: "subject", label: "Subject", type: "text" }, { name: "body", label: "Message", type: "textarea" }],
  phone: [{ name: "phone", label: "Phone", type: "text" }],
  sms: [{ name: "phone", label: "Phone", type: "text" }, { name: "body", label: "Message", type: "textarea" }],
  vcard: [{ name: "name", label: "Name", type: "text" }, { name: "phone", label: "Phone", type: "text" }, { name: "email", label: "Email", type: "text" }, { name: "org", label: "Organization", type: "text" }],
  mecard: [{ name: "name", label: "Name", type: "text" }, { name: "phone", label: "Phone", type: "text" }, { name: "email", label: "Email", type: "text" }],
  geo: [{ name: "lat", label: "Latitude", type: "text" }, { name: "lng", label: "Longitude", type: "text" }],
  event: [{ name: "title", label: "Title", type: "text" }, { name: "start", label: "Start (YYYYMMDDTHHMMSS)", type: "text" }, { name: "end", label: "End (YYYYMMDDTHHMMSS)", type: "text" }, { name: "location", label: "Location", type: "text" }],
  calendar: [{ name: "title", label: "Title", type: "text" }, { name: "start", label: "Start (YYYYMMDDTHHMMSS)", type: "text" }, { name: "end", label: "End (YYYYMMDDTHHMMSS)", type: "text" }, { name: "location", label: "Location", type: "text" }],
  bitcoin: [{ name: "address", label: "Bitcoin address", type: "text" }, { name: "amount", label: "Amount (optional BTC)", type: "text" }, { name: "label", label: "Label", type: "text" }],
  ethereum: [{ name: "address", label: "Ethereum address", type: "text" }],
  crypto: [{ name: "address", label: "Wallet address", type: "text" }],
  styled: [{ name: "text", label: "Text or URL", type: "textarea" }, { name: "dark", label: "Dark color", type: "color", defaultValue: "#16181d" }, { name: "light", label: "Light color", type: "color", defaultValue: "#ffffff" }, { name: "size", label: "Size (px)", type: "number", defaultValue: 512, min: 128, max: 2048, step: 1 }, { name: "margin", label: "Margin", type: "number", defaultValue: 1, min: 0, max: 16, step: 1 }],
  batch: [{ name: "items", label: "One value per line", type: "textarea", placeholder: "https://example.com\nhttps://example.org" }],
  payload: [{ name: "kind", label: "Payload type", type: "select", options: [{ value: "wifi", label: "Wi-Fi" }, { value: "email", label: "Email" }, { value: "phone", label: "Phone" }, { value: "sms", label: "SMS" }, { value: "geo", label: "Geo" }] }, { name: "a", label: "Primary value", type: "text" }, { name: "b", label: "Secondary value", type: "text" }, { name: "c", label: "Third value", type: "text" }],
  inspect: [{ name: "payload", label: "QR payload", type: "textarea", placeholder: "WIFI:T:WPA;S:MyWifi;P:password;;" }],
};

function esc(value: string) {
  return value.replace(/([\\;,:])/g, "\\$1");
}

function payloadFor(preset: string, v: Record<string, string>) {
  switch (preset) {
    case "wifi": return `WIFI:T:${v.security || "WPA"};S:${esc(v.ssid || "")};P:${esc(v.password || "")};H:${v.hidden === "true"};`;
    case "whatsapp": return `https://wa.me/${(v.phone || "").replace(/\D/g, "")}?text=${encodeURIComponent(v.text || "")}`;
    case "email": return `mailto:${v.to || ""}?subject=${encodeURIComponent(v.subject || "")}&body=${encodeURIComponent(v.body || "")}`;
    case "phone": return `tel:${v.phone || ""}`;
    case "sms": return `sms:${v.phone || ""}?body=${encodeURIComponent(v.body || "")}`;
    case "vcard": return `BEGIN:VCARD\nVERSION:3.0\nFN:${v.name || ""}\nORG:${v.org || ""}\nTEL:${v.phone || ""}\nEMAIL:${v.email || ""}\nEND:VCARD`;
    case "mecard": return `MECARD:N:${esc(v.name || "")};TEL:${esc(v.phone || "")};EMAIL:${esc(v.email || "")};;`;
    case "geo": return `geo:${v.lat || "0"},${v.lng || "0"}`;
    case "event": case "calendar": return `BEGIN:VEVENT\nSUMMARY:${v.title || ""}\nDTSTART:${v.start || ""}\nDTEND:${v.end || ""}\nLOCATION:${v.location || ""}\nEND:VEVENT`;
    case "bitcoin": { const q = new URLSearchParams(); if (v.amount) q.set("amount", v.amount); if (v.label) q.set("label", v.label); return `bitcoin:${v.address || ""}${q.toString() ? `?${q}` : ""}`; }
    case "ethereum": return `ethereum:${v.address || ""}`;
    case "crypto": return v.address || "";
    case "url": return v.url || "";
    case "payload": return buildPayload(v);
    default: return v.text || "";
  }
}

function buildPayload(v: Record<string, string>) {
  if (v.kind === "wifi") return `WIFI:T:WPA;S:${esc(v.a || "")};P:${esc(v.b || "")};H:false;`;
  if (v.kind === "email") return `mailto:${v.a || ""}?subject=${encodeURIComponent(v.b || "")}&body=${encodeURIComponent(v.c || "")}`;
  if (v.kind === "phone") return `tel:${v.a || ""}`;
  if (v.kind === "sms") return `sms:${v.a || ""}?body=${encodeURIComponent(v.b || "")}`;
  if (v.kind === "geo") return `geo:${v.a || "0"},${v.b || "0"}`;
  return v.a || "";
}

function checkDigit(value: string) {
  const digits = value.replace(/\D/g, "");
  if (!digits) return null;
  let sum = 0;
  for (let i = digits.length - 1, pos = 0; i >= 0; i--, pos++) sum += Number(digits[i]) * (pos % 2 === 0 ? 3 : 1);
  return (10 - (sum % 10)) % 10;
}

function validateGtin(value: string) {
  const digits = value.replace(/\D/g, "");
  if (![8, 12, 13, 14].includes(digits.length)) return { valid: false, message: "GTIN must contain 8, 12, 13 or 14 digits." };
  const expected = checkDigit(digits.slice(0, -1));
  return { valid: expected === Number(digits.at(-1)), message: `Expected check digit: ${expected}. Supplied: ${digits.at(-1)}.` };
}

function approxVersion(length: number, level: string) {
  const factor = level === "H" ? 0.7 : level === "Q" ? 0.78 : level === "M" ? 0.88 : 1;
  return Math.min(40, Math.max(1, Math.ceil(length / (factor * 20))));
}

export function QrEngine({ preset }: { preset: string }) {
  const fieldPreset = ["high-error", "low-error"].includes(preset) ? "text" : preset;
  const fields = ["size", "version", "capacity", "inspect"].includes(preset) ? [] : (COMMON_FIELDS[fieldPreset] ?? COMMON_FIELDS.text);
  const defaults = useMemo(() => Object.fromEntries(fields.map((f) => [f.name, String(f.defaultValue ?? "")])), [fields]);
  const [vals, setVals] = useState<Record<string, string>>(defaults);
  const [url, setUrl] = useState<string | null>(null);
  const [svg, setSvg] = useState("");
  const [batch, setBatch] = useState<string[]>([]);
  const [info, setInfo] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const run = async () => {
    try {
      setError(null); setInfo(null); setBatch([]); setUrl(null); setSvg("");
      if (preset === "size") {
        const modules = Number(vals.modules || 21); const modulePx = Number(vals.modulePx || 4);
        setInfo(`${modules} modules × ${modulePx}px = ${modules * modulePx}px before quiet-zone margin.`); return;
      }
      if (preset === "version") {
        setInfo(`Estimated QR version: ${approxVersion((vals.text || "").length, vals.level || "M")} for ${vals.level || "M"} error correction. Actual version depends on encoding mode and content.`); return;
      }
      if (preset === "capacity") {
        const version = Math.min(40, Math.max(1, Number(vals.version || 1))); const level = vals.level || "M";
        const cap = Math.max(10, Math.floor(version * version * 18 * ({L:1,M:.8,Q:.65,H:.5} as Record<string,number>)[level]));
        setInfo(`Approximate alphanumeric capacity for version ${version} / ${level}: about ${cap} characters. This is a planning estimate, not the QR standard's exact byte table.`); return;
      }
      if (preset === "inspect") {
        const p = vals.payload || "";
        if (!p.trim()) throw new Error("Enter a QR payload to inspect.");
        const kind = p.startsWith("WIFI:") ? "Wi-Fi" : p.startsWith("BEGIN:VCARD") ? "vCard" : p.startsWith("BEGIN:VEVENT") ? "Calendar event" : p.startsWith("mailto:") ? "Email" : p.startsWith("tel:") ? "Phone" : p.startsWith("sms:") ? "SMS" : p.startsWith("geo:") ? "Location" : p.startsWith("bitcoin:") ? "Bitcoin payment" : /^https?:\/\//i.test(p) ? "URL" : "Plain text";
        setInfo(`Detected payload type: ${kind}. Length: ${p.length} characters.`); return;
      }
      const QR = await import("qrcode");
      if (preset === "batch") {
        const items = (vals.items || "").split(/\r?\n/).map((x) => x.trim()).filter(Boolean).slice(0, 50);
        if (!items.length) throw new Error("Enter at least one value.");
        const outputs = await Promise.all(items.map((x) => QR.toDataURL(x, { width: 320, margin: 1 })));
        setBatch(outputs); setInfo(`Generated ${outputs.length} QR codes locally.`); return;
      }
      const data = payloadFor(preset === "styled" ? "text" : preset, vals);
      if (!data.trim()) throw new Error("Enter something to encode.");
      const level = preset === "high-error" ? "H" : preset === "low-error" ? "L" : (vals.level || "M");
      const opts = { width: Number(vals.size || 512), margin: Number(vals.margin ?? 1), errorCorrectionLevel: level as "L" | "M" | "Q" | "H", color: { dark: vals.dark || "#16181d", light: vals.light || "#ffffff" } };
      if (preset === "svg") {
        setSvg(await QR.toString(data, { type: "svg", ...opts }));
      } else if (preset === "data-url") {
        const dataUrl = await QR.toDataURL(data, opts);
        setUrl(dataUrl);
        setInfo(`Generated a QR image data URL for ${data.length} characters.`);
      } else {
        setUrl(await QR.toDataURL(data, opts));
        setInfo(`Encoded ${data.length} characters using error correction ${level}.`);
      }
    } catch (e) { setError(e instanceof Error ? e.message : "Could not generate the QR code."); }
  };

  return <div className="space-y-4">
    <FieldGrid fields={fields} values={vals} onChange={(n, v) => setVals((o) => ({ ...o, [n]: v }))} />
    {preset === "size" ? <FieldGrid fields={[{name:"modules",label:"QR modules",type:"number",defaultValue:21},{name:"modulePx",label:"Module size (px)",type:"number",defaultValue:4}]} values={vals} onChange={(n,v)=>setVals(o=>({...o,[n]:v}))}/> : null}
    {preset === "version" ? <FieldGrid fields={[{name:"level",label:"Error correction",type:"select",options:[{value:"L",label:"L"},{value:"M",label:"M"},{value:"Q",label:"Q"},{value:"H",label:"H"}]},{name:"text",label:"Payload",type:"textarea"}]} values={vals} onChange={(n,v)=>setVals(o=>({...o,[n]:v}))}/> : null}
    {preset === "capacity" ? <FieldGrid fields={[{name:"version",label:"Version",type:"number",defaultValue:1,min:1,max:40},{name:"level",label:"Error correction",type:"select",options:[{value:"L",label:"L"},{value:"M",label:"M"},{value:"Q",label:"Q"},{value:"H",label:"H"}]}]} values={vals} onChange={(n,v)=>setVals(o=>({...o,[n]:v}))}/> : null}
    <div className="flex gap-2"><Button type="button" onClick={run}>{["size","version","capacity","inspect"].includes(preset) ? "Calculate" : "Generate QR"}</Button><Button type="button" variant="outline" onClick={()=>{setVals(defaults);setUrl(null);setSvg("");setBatch([]);setInfo(null);setError(null);}}>Reset</Button></div>
    <ErrorBanner message={error} />
    {info ? <div className="rounded-lg border p-3 text-sm">{info}</div> : null}
    {url ? <div className="space-y-3"><img src={url} alt="Generated QR code" className="size-56 rounded-lg bg-white p-2" /><div className="flex gap-2"><Button type="button" variant="outline" onClick={async()=>downloadBlob(await (await fetch(url)).blob(),"env-qr.png")}><Download className="size-4"/>Download PNG</Button></div></div> : null}
    {svg ? <div className="space-y-3"><div className="max-w-md rounded-lg bg-white p-4" dangerouslySetInnerHTML={{__html:svg}}/><div className="flex gap-2"><Button type="button" variant="outline" onClick={()=>downloadText(svg,"env-qr.svg","image/svg+xml")}><Download className="size-4"/>Download SVG</Button><Button type="button" variant="outline" onClick={async()=>{try{await navigator.clipboard.writeText(svg)}catch{setError("Clipboard access is unavailable; use the download option instead.");}}}><Copy className="size-4"/>Copy SVG</Button></div></div> : null}
    {batch.length ? <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">{batch.map((src,i)=><div key={src} className="space-y-2 rounded-lg border p-2"><img src={src} alt={`QR ${i+1}`} className="w-full bg-white"/><Button type="button" variant="outline" className="w-full" onClick={async()=>downloadBlob(await (await fetch(src)).blob(),`env-qr-${i+1}.png`)}><Download className="size-4"/>PNG</Button></div>)}</div> : null}
  </div>;
}

export function BarcodeEngine({ format }: { format: string }) {
  const [value, setValue] = useState(format === "ean13" || format === "isbn" ? "9780143127741" : format === "upca" ? "036000291452" : format === "ean8" ? "96385074" : "ENV-12345");
  const [error, setError] = useState<string | null>(null);
  const [svg, setSvg] = useState("");
  const [result, setResult] = useState<string | null>(null);

  const run = async () => {
    try {
      setError(null); setResult(null); setSvg("");
      if (["gtin-validator","ean13-check","upc-check","isbn-check"].includes(format)) {
        if (format === "gtin-validator") { const r = validateGtin(value); setResult(`${r.valid ? "Valid" : "Invalid"}: ${r.message}`); return; }
        const digits = value.replace(/\D/g, "");
        const body = format === "upc-check" ? digits.slice(0, 11) : format === "ean13-check" || format === "isbn-check" ? digits.slice(0, 12) : digits.slice(0, -1);
        const d = checkDigit(body); if (d === null) throw new Error("Enter numeric digits.");
        setResult(`Calculated check digit: ${d}. ${digits.length ? `Supplied check digit: ${digits.at(-1) ?? "—"}.` : ""}`); return;
      }
      const JsBarcode = (await import("jsbarcode")).default;
      const doc = document.createElementNS("http://www.w3.org/2000/svg", "svg");
      const fmt = ({ean13:"EAN13",ean8:"EAN8",upca:"UPC",code128:"CODE128",code39:"CODE39",itf14:"ITF14",msi:"MSI",pharmacode:"pharmacode",codabar:"codabar",isbn:"EAN13"} as Record<string,string>)[format] || "CODE128";
      const clean = value.replace(/[- ]/g, "");
      JsBarcode(doc, format === "isbn" ? clean.replace(/^ISBN(?:-13)?:?/i, "") : clean, { format: fmt, displayValue: true, font: "monospace", height: 80, margin: 8, width: 2 });
      const markup = new XMLSerializer().serializeToString(doc);
      setSvg(markup);
    } catch (e) { setError(e instanceof Error ? e.message : "Invalid barcode value for this format."); }
  };

  return <div className="space-y-4">
    <label className="block space-y-1.5"><span className="text-sm font-medium">Value</span><input className="flex h-11 w-full rounded-md bg-surface px-3 text-sm shadow-[var(--shadow-border)]" value={value} onChange={(e)=>setValue(e.target.value)} /></label>
    <div className="flex gap-2"><Button type="button" onClick={run}>{["gtin-validator","ean13-check","upc-check","isbn-check"].includes(format) ? "Validate / Calculate" : "Generate barcode"}</Button><Button type="button" variant="outline" onClick={()=>{setValue(format === "ean13" || format === "isbn" ? "9780143127741" : format === "upca" ? "036000291452" : format === "ean8" ? "96385074" : "ENV-12345");setError(null);setResult(null);setSvg("");}}>Reset</Button></div>
    <ErrorBanner message={error}/>
    {result ? <div className="rounded-lg border p-3 text-sm">{result}</div> : null}
    {svg ? <div className="space-y-3"><div className="overflow-x-auto rounded-lg bg-white p-4" dangerouslySetInnerHTML={{__html:svg}}/><div className="flex gap-2"><Button type="button" variant="outline" onClick={()=>downloadText(svg,"env-barcode.svg","image/svg+xml")}><Download className="size-4"/>Download SVG</Button></div></div> : null}
  </div>;
}
