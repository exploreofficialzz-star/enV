import { useState } from "react";
import { Button } from "@/components/ui/button";
import { ErrorBanner } from "@/components/tools/error-banner";
import { FieldGrid, type UiField } from "@/components/engines/fields";
import { initialValues } from "@/components/engines/initial-values";
import { downloadBlob } from "@/lib/utils";
import { Download } from "lucide-react";

const FIELDS: Record<string, UiField[]> = {
  text: [{ name: "text", label: "Text or URL", type: "textarea", placeholder: "https://" }],
  wifi: [
    { name: "ssid", label: "Network name (SSID)", type: "text" },
    { name: "password", label: "Password", type: "text" },
    {
      name: "hidden",
      label: "Hidden",
      type: "select",
      options: [
        { value: "false", label: "Visible" },
        { value: "true", label: "Hidden" },
      ],
    },
  ],
  whatsapp: [
    { name: "phone", label: "Phone (with country code)", type: "text", placeholder: "15551234567" },
    { name: "text", label: "Message", type: "textarea" },
  ],
  email: [
    { name: "to", label: "Email", type: "text" },
    { name: "subject", label: "Subject", type: "text" },
    { name: "body", label: "Body", type: "textarea" },
  ],
  phone: [{ name: "phone", label: "Phone", type: "text" }],
  sms: [
    { name: "phone", label: "Phone", type: "text" },
    { name: "body", label: "Message", type: "textarea" },
  ],
  vcard: [
    { name: "name", label: "Name", type: "text" },
    { name: "phone", label: "Phone", type: "text" },
    { name: "email", label: "Email", type: "text" },
    { name: "org", label: "Organization", type: "text" },
  ],
  geo: [
    { name: "lat", label: "Latitude", type: "text" },
    { name: "lng", label: "Longitude", type: "text" },
  ],
  event: [
    { name: "title", label: "Title", type: "text" },
    { name: "start", label: "Start (YYYYMMDDTHHMMSS)", type: "text" },
    { name: "end", label: "End", type: "text" },
  ],
};

function payload(preset: string, v: Record<string, string>): string {
  switch (preset) {
    case "wifi":
      return `WIFI:T:WPA;S:${v.ssid};P:${v.password};H:${v.hidden === "true"};`;
    case "whatsapp":
      return `https://wa.me/${v.phone.replace(/\D/g, "")}?text=${encodeURIComponent(v.text || "")}`;
    case "email":
      return `mailto:${v.to}?subject=${encodeURIComponent(v.subject || "")}&body=${encodeURIComponent(v.body || "")}`;
    case "phone":
      return `tel:${v.phone}`;
    case "sms":
      return `sms:${v.phone}?body=${encodeURIComponent(v.body || "")}`;
    case "vcard":
      return `BEGIN:VCARD\nVERSION:3.0\nFN:${v.name}\nORG:${v.org}\nTEL:${v.phone}\nEMAIL:${v.email}\nEND:VCARD`;
    case "geo":
      return `geo:${v.lat},${v.lng}`;
    case "event":
      return `BEGIN:VEVENT\nSUMMARY:${v.title}\nDTSTART:${v.start}\nDTEND:${v.end}\nEND:VEVENT`;
    default:
      return v.text || "";
  }
}

export function QrEngine({ preset }: { preset: string }) {
  const fields = FIELDS[preset] ?? FIELDS.text;
  const [vals, setVals] = useState(() => initialValues(fields));
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const run = async () => {
    try {
      setError(null);
      const data = payload(preset, vals);
      if (!data.trim()) throw new Error("Enter something to encode.");
      const QR = await import("qrcode");
      const dataUrl = await QR.toDataURL(data, { width: 512, margin: 1, color: { dark: "#16181d", light: "#ffffff" } });
      setUrl(dataUrl);
    } catch (e) {
      setUrl(null);
      setError(e instanceof Error ? e.message : "Could not create a QR code.");
    }
  };

  return (
    <div className="space-y-4">
      <FieldGrid fields={fields} values={vals} onChange={(n, v) => setVals((o) => ({ ...o, [n]: v }))} />
      <Button type="button" onClick={run}>
        Generate QR
      </Button>
      <ErrorBanner message={error} />
      {url ? (
        <div className="flex flex-col items-start gap-3">
          <img src={url} alt="QR code" className="size-56 rounded-lg bg-white p-2" />
          <Button
            type="button"
            variant="outline"
            onClick={async () => {
              const res = await fetch(url);
              downloadBlob(await res.blob(), "env-qr.png");
            }}
          >
            <Download className="size-4" />
            Download PNG
          </Button>
        </div>
      ) : null}
    </div>
  );
}

export function BarcodeEngine({ format }: { format: string }) {
  const [value, setValue] = useState(format === "ean13" || format === "isbn" ? "9780143127741" : format === "upca" ? "036000291452" : "ENV-12345");
  const [error, setError] = useState<string | null>(null);
  const [svg, setSvg] = useState("");

  const run = async () => {
    try {
      setError(null);
      const JsBarcode = (await import("jsbarcode")).default;
      const doc = document.createElementNS("http://www.w3.org/2000/svg", "svg");
      const fmt = format === "isbn" ? "EAN13" : format === "ean13" ? "EAN13" : format === "upca" ? "UPC" : "CODE128";
      JsBarcode(doc, value.replace(/-/g, ""), { format: fmt, displayValue: true, font: "monospace", height: 80, margin: 8 });
      setSvg(new XMLSerializer().serializeToString(doc));
    } catch (e) {
      setSvg("");
      setError(e instanceof Error ? e.message : "Invalid barcode value for this format.");
    }
  };

  return (
    <div className="space-y-4">
      <label className="block space-y-1.5">
        <span className="text-sm font-medium">Value</span>
        <input
          className="flex h-11 w-full rounded-md bg-surface px-3 text-sm shadow-[var(--shadow-border)]"
          value={value}
          onChange={(e) => setValue(e.target.value)}
        />
      </label>
      <Button type="button" onClick={run}>
        Generate barcode
      </Button>
      <ErrorBanner message={error} />
      {svg ? <div className="overflow-x-auto rounded-lg bg-white p-4" dangerouslySetInnerHTML={{ __html: svg }} /> : null}
    </div>
  );
}
