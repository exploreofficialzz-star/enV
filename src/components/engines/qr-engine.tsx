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

export function payloadFor(preset: string, v: Record<string, string>) {
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

/** Validate structured inputs before encoding so empty prefixes cannot masquerade as useful payloads. */
export function qrInputError(preset: string, v: Record<string, string>): string | null {
  const required = (key: string, label: string) => v[key]?.trim() ? null : `Enter ${label}.`;
  const phone = (key: string, label: string) => required(key, label) ?? (/\d{3,}/.test(v[key].replace(/\D/g, "")) ? null : `Enter a valid ${label.toLowerCase()}.`);
  const email = (key: string, label: string) => required(key, label) ?? (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v[key].trim()) ? null : `Enter a valid ${label.toLowerCase()}.`);
  const coordinate = (key: string, label: string, min: number, max: number) => {
    if (!v[key]?.trim()) return `Enter ${label}.`;
    const value = Number(v[key]);
    return Number.isFinite(value) && value >= min && value <= max ? null : `${label} must be between ${min} and ${max}.`;
  };
  const firstError = (checks: (string | null)[]) => checks.find(Boolean) ?? null;

  if (preset === "size") {
    const modules = Number(v.modules || 21), modulePx = Number(v.modulePx || 4);
    return Number.isInteger(modules) && modules > 0 && Number.isFinite(modulePx) && modulePx > 0 ? null : "Modules and module size must be positive numbers.";
  }
  if (preset === "version") return required("text", "a QR payload to estimate");
  if (preset === "capacity") {
    const version = Number(v.version || 1);
    return Number.isInteger(version) && version >= 1 && version <= 40 && ["L", "M", "Q", "H"].includes(v.level || "M") ? null : "Choose a QR version from 1 to 40 and a valid error-correction level.";
  }
  if (preset === "inspect") return required("payload", "a QR payload to inspect");
  if (preset === "batch") {
    const items = (v.items || "").split(/\r?\n/).map((x) => x.trim()).filter(Boolean);
    if (!items.length) return "Enter at least one value.";
    return items.length > 50 ? "Batch generation is limited to 50 values at a time." : null;
  }
  if (["high-error", "low-error", "text", "styled", "svg", "data-url"].includes(preset)) return required("text", "something to encode");
  if (preset === "url") {
    if (!v.url?.trim()) return "Enter a URL.";
    try { const url = new URL(v.url.trim()); return url.protocol && url.hostname ? null : "Enter a complete URL including its host."; }
    catch { return "Enter a complete URL including https://."; }
  }
  if (preset === "wifi") return firstError([required("ssid", "a network name"), v.security !== "nopass" ? required("password", "a Wi-Fi password or choose No password") : null]);
  if (preset === "whatsapp") return phone("phone", "phone number");
  if (preset === "email") return email("to", "email address");
  if (preset === "phone" || preset === "sms") return phone("phone", "phone number");
  if (preset === "vcard" || preset === "mecard") return required("name", "a contact name");
  if (preset === "geo") return firstError([coordinate("lat", "Latitude", -90, 90), coordinate("lng", "Longitude", -180, 180)]);
  if (preset === "event" || preset === "calendar") return firstError([required("title", "an event title"), required("start", "a start time"), required("end", "an end time")]);
  if (preset === "bitcoin") {
    if (!v.address?.trim()) return "Enter a Bitcoin address.";
    if (v.amount?.trim() && (!Number.isFinite(Number(v.amount)) || Number(v.amount) < 0)) return "Amount must be a non-negative number.";
    return null;
  }
  if (preset === "ethereum" || preset === "crypto") return required("address", "a wallet address");
  if (preset === "payload") {
    switch (v.kind) {
      case "wifi": return required("a", "a network name");
      case "email": return email("a", "email address");
      case "phone": case "sms": return phone("a", "phone number");
      case "geo": return firstError([coordinate("a", "Latitude", -90, 90), coordinate("b", "Longitude", -180, 180)]);
      default: return required("a", "a payload value");
    }
  }
  return null;
}

export function initialBarcodeValue(format: string): string {
  return ({ ean13: "9780143127741", isbn: "9780143127741", "ean13-check": "9780143127741", "isbn-check": "9780143127741", "gtin-validator": "9780143127741", upca: "036000291452", "upc-check": "036000291452", ean8: "96385074", itf14: "10000000000007", msi: "12345", pharmacode: "12345" } as Record<string, string>)[format] ?? "12345";
}

export function checkDigit(value: string) {
  const digits = value.replace(/\D/g, "");
  if (!digits) return null;
  let sum = 0;
  for (let i = digits.length - 1, pos = 0; i >= 0; i--, pos++) sum += Number(digits[i]) * (pos % 2 === 0 ? 3 : 1);
  return (10 - (sum % 10)) % 10;
}

export function validateGtin(value: string) {
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
  const fields = ["size", "version", "capacity"].includes(preset) ? [] : (COMMON_FIELDS[fieldPreset] ?? COMMON_FIELDS.text);
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
      const inputError = qrInputError(preset, vals);
      if (inputError) throw new Error(inputError);
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
        const items = (vals.items || "").split(/\r?\n/).map((x) => x.trim()).filter(Boolean);
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
    {url ? <div className="space-y-3"><img src={url} alt="Generated QR code" className="size-56 rounded-lg bg-white p-2" /><div className="flex flex-wrap gap-2"><Button type="button" variant="outline" onClick={async()=>downloadBlob(await (await fetch(url)).blob(),"env-qr.png")}><Download className="size-4"/>Download PNG</Button>{preset === "data-url" ? <><Button type="button" variant="outline" onClick={async()=>{try{await navigator.clipboard.writeText(url)}catch{setError("Clipboard access is unavailable; use the text below instead.");}}}><Copy className="size-4"/>Copy data URL</Button><Button type="button" variant="outline" onClick={()=>downloadText(url,"env-qr-data-url.txt","text/plain")}><Download className="size-4"/>Download data URL</Button></> : null}</div>{preset === "data-url" ? <pre className="max-h-40 overflow-auto break-all rounded-md bg-surface p-3 text-xs" aria-label="Generated QR data URL">{url}</pre> : null}</div> : null}
    {svg ? <div className="space-y-3"><div className="max-w-md rounded-lg bg-white p-4" dangerouslySetInnerHTML={{__html:svg}}/><div className="flex gap-2"><Button type="button" variant="outline" onClick={()=>downloadText(svg,"env-qr.svg","image/svg+xml")}><Download className="size-4"/>Download SVG</Button><Button type="button" variant="outline" onClick={async()=>{try{await navigator.clipboard.writeText(svg)}catch{setError("Clipboard access is unavailable; use the download option instead.");}}}><Copy className="size-4"/>Copy SVG</Button></div></div> : null}
    {batch.length ? <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">{batch.map((src,i)=><div key={src} className="space-y-2 rounded-lg border p-2"><img src={src} alt={`QR ${i+1}`} className="w-full bg-white"/><Button type="button" variant="outline" className="w-full" onClick={async()=>downloadBlob(await (await fetch(src)).blob(),`env-qr-${i+1}.png`)}><Download className="size-4"/>PNG</Button></div>)}</div> : null}
  </div>;
}

export function BarcodeEngine({ format }: { format: string }) {
  const [value, setValue] = useState(() => initialBarcodeValue(format));
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
      const fmt = ({ean13:"EAN13",ean8:"EAN8",upca:"UPC",code128:"CODE128",code39:"CODE39",itf14:"ITF14",msi:"MSI",pharmacode:"pharmacode",codabar:"codabar",isbn:"EAN13",["isbn-barcode"]:"EAN13",["barcode-label-generator"]:"CODE128",["barcode-svg-generator"]:"CODE128"} as Record<string,string>)[format] || "CODE128";
      const clean = value.replace(/[- ]/g, "");
      JsBarcode(doc, format === "isbn" ? clean.replace(/^ISBN(?:-13)?:?/i, "") : clean, { format: fmt, displayValue: true, font: "monospace", height: 80, margin: 8, width: 2 });
      const markup = new XMLSerializer().serializeToString(doc);
      setSvg(markup);
    } catch (e) { setError(e instanceof Error ? e.message : "Invalid barcode value for this format."); }
  };

  return <div className="space-y-4">
    <label className="block space-y-1.5"><span className="text-sm font-medium">Value</span><input className="flex h-11 w-full rounded-md bg-surface px-3 text-sm shadow-[var(--shadow-border)]" value={value} onChange={(e)=>setValue(e.target.value)} /></label>
    <div className="flex gap-2"><Button type="button" onClick={run}>{["gtin-validator","ean13-check","upc-check","isbn-check"].includes(format) ? "Validate / Calculate" : "Generate barcode"}</Button><Button type="button" variant="outline" onClick={()=>{setValue(initialBarcodeValue(format));setError(null);setResult(null);setSvg("");}}>Reset</Button></div>
    <ErrorBanner message={error}/>
    {result ? <div className="rounded-lg border p-3 text-sm">{result}</div> : null}
    {svg ? <div className="space-y-3"><div className="overflow-x-auto rounded-lg bg-white p-4" dangerouslySetInnerHTML={{__html:svg}}/><div className="flex gap-2"><Button type="button" variant="outline" onClick={()=>downloadText(svg,"env-barcode.svg","image/svg+xml")}><Download className="size-4"/>Download SVG</Button></div></div> : null}
  </div>;
}
