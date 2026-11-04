import { useState } from "react";
import { Archive, Copy, Download, Share2, ShieldCheck } from "lucide-react";
import { strToU8, zipSync } from "fflate";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  generateGoogleSigningKey,
  type GoogleSigningKeyArtifacts,
  type GoogleSigningKeyInput,
} from "@/lib/engines/google-signing-key";

type FieldProps = { id: string; label: string; value: string; onChange: (value: string) => void; placeholder?: string; type?: string; required?: boolean; autoComplete?: string };
function Field({ id, label, value, onChange, placeholder, type = "text", required = false, autoComplete }: FieldProps) {
  return (
    <div className="min-w-0 space-y-1.5">
      <Label htmlFor={id}>{label}{required ? <span aria-hidden="true"> *</span> : null}</Label>
      <Input id={id} value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} type={type} autoComplete={autoComplete ?? "off"} required={required} maxLength={type === "password" ? 128 : undefined} />
    </div>
  );
}

function downloadFile(filename: string, contents: BlobPart, mime: string) {
  const blob = new Blob([contents], { type: mime });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.style.display = "none";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
}

async function copyText(value: string) {
  if (!navigator.clipboard?.writeText) throw new Error("Clipboard access is unavailable in this browser.");
  await navigator.clipboard.writeText(value);
}

export function GoogleSigningKeyGenerator() {
  const [stage, setStage] = useState<"details" | "security" | "ready">("details");
  const [alias, setAlias] = useState("upload");
  const [commonName, setCommonName] = useState("");
  const [organization, setOrganization] = useState("");
  const [organizationalUnit, setOrganizationalUnit] = useState("");
  const [city, setCity] = useState("");
  const [state, setState] = useState("");
  const [country, setCountry] = useState("NG");
  const [keySize, setKeySize] = useState<GoogleSigningKeyInput["keySize"]>(2048);
  const [validityYears, setValidityYears] = useState("25");
  const [storePassword, setStorePassword] = useState("");
  const [confirmStorePassword, setConfirmStorePassword] = useState("");
  const [keyPassword, setKeyPassword] = useState("");
  const [confirmKeyPassword, setConfirmKeyPassword] = useState("");
  const [artifacts, setArtifacts] = useState<GoogleSigningKeyArtifacts | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [gradleKind, setGradleKind] = useState<"kotlin" | "groovy">("kotlin");

  const generate = async () => {
    setError(""); setNotice(""); setArtifacts(null);
    if (storePassword !== confirmStorePassword) { setError("The keystore passwords do not match."); return; }
    if (keyPassword !== confirmKeyPassword) { setError("The key passwords do not match."); return; }
    const years = Number(validityYears);
    setBusy(true);
    try {
      const result = await generateGoogleSigningKey({
        alias, commonName, organization, organizationalUnit, city, state, country: country.toUpperCase(),
        keySize, validityYears: years, storePassword, keyPassword,
      });
      setArtifacts(result);
      setStage("ready");
      setNotice("Upload keystore and certificate generated on this device. Nothing was uploaded.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The signing key could not be generated.");
    } finally {
      setBusy(false);
      setStorePassword(""); setConfirmStorePassword(""); setKeyPassword(""); setConfirmKeyPassword("");
    }
  };

  const reset = () => {
    setAlias("upload"); setCommonName(""); setOrganization(""); setOrganizationalUnit("");
    setCity(""); setState(""); setCountry("NG"); setKeySize(2048); setValidityYears("25");
    setStorePassword(""); setConfirmStorePassword(""); setKeyPassword(""); setConfirmKeyPassword("");
    setArtifacts(null); setError(""); setNotice(""); setStage("details");
  };

  const zipBytes = artifacts ? zipSync({
    "upload-keystore.jks": artifacts.keystore,
    "upload_certificate.pem": strToU8(artifacts.certificatePem),
    "release-signing.gradle.kts": strToU8(artifacts.gradleKotlin),
    "release-signing.gradle": strToU8(artifacts.gradleGroovy),
    "README.txt": strToU8("Android upload-key files generated locally by enV. The JKS is password-protected. Passwords are intentionally not included in this archive. Keep your passwords separately and never commit this archive to a public repository. Google Play App Signing is a separate Google-managed key.")
  }, { level: 6 }) : null;

  const shareZip = async () => {
    if (!zipBytes) return;
    const file = new File([zipBytes], "android-upload-key-package.zip", { type: "application/zip" });
    if (navigator.share && (!navigator.canShare || navigator.canShare({ files: [file] }))) {
      try { await navigator.share({ files: [file], title: "Android upload key" }); return; }
      catch (cause) { if (cause instanceof DOMException && cause.name === "AbortError") return; }
    }
    downloadFile(file.name, zipBytes, "application/zip");
  };

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-3 gap-1 rounded-lg border border-border bg-muted/40 p-1" role="group" aria-label="Signing key steps">
        {[{id:"details",label:"Details"},{id:"security",label:"Security"},{id:"ready",label:"Export"}].map((item) => (
          <button key={item.id} type="button" onClick={() => { if (item.id === "ready" && !artifacts) return; setStage(item.id as typeof stage); }} disabled={item.id === "ready" && !artifacts} aria-pressed={stage === item.id} className={`min-h-9 rounded-md px-2 text-xs font-medium transition-colors ${stage === item.id ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}>{item.label}</button>
        ))}
      </div>

      {stage === "details" ? <div className="space-y-3">
        <h3 className="text-sm font-semibold">Key details</h3>
        <div className="grid grid-cols-2 gap-2">
          <Field id="google-key-alias" label="Alias" value={alias} onChange={setAlias} placeholder="upload" required />
          <Field id="google-key-cn" label="Owner / publisher" value={commonName} onChange={setCommonName} placeholder="Your name or company" required />
          <Field id="google-key-country" label="Country" value={country} onChange={(value) => setCountry(value.toUpperCase().slice(0, 2))} placeholder="NG" required />
          <div className="min-w-0 space-y-1.5">
            <Label htmlFor="google-key-size">RSA key size</Label>
            <select id="google-key-size" value={keySize} onChange={(event) => setKeySize(Number(event.target.value) as GoogleSigningKeyInput["keySize"])} className="min-h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm">
              <option value={2048}>2048 bits · recommended minimum</option>
              <option value={3072}>3072 bits</option>
              <option value={4096}>4096 bits</option>
            </select>
          </div>
          <div className="min-w-0 space-y-1.5">
            <Label htmlFor="google-key-validity">Certificate validity</Label>
            <select id="google-key-validity" value={validityYears} onChange={(event) => setValidityYears(event.target.value)} className="min-h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm">
              {[10,15,20,25,30].map((years) => <option key={years} value={years}>{years} years</option>)}
            </select>
          </div>
        </div>
        <details className="rounded-lg border border-border px-3 py-2">
          <summary className="cursor-pointer text-xs font-medium">More certificate details</summary>
          <div className="grid grid-cols-2 gap-2 pt-3">
            <Field id="google-key-org" label="Organization" value={organization} onChange={setOrganization} placeholder="Company" />
            <Field id="google-key-ou" label="Unit" value={organizationalUnit} onChange={setOrganizationalUnit} placeholder="Mobile" />
            <Field id="google-key-city" label="City" value={city} onChange={setCity} placeholder="City" />
            <Field id="google-key-state" label="State / region" value={state} onChange={setState} placeholder="Region" />
          </div>
        </details>
      <div className="flex gap-2">
        <Button type="button" className="min-h-10 flex-1" onClick={() => setStage("security")}>Continue</Button>
        <Button type="button" variant="outline" className="min-h-10" onClick={reset}>Reset</Button>
      </div>
      </div> : null}

      {stage === "security" ? <div className="space-y-3">
        <h3 className="text-sm font-semibold">Set your passwords</h3>
        <p className="text-xs text-muted">12–128 characters. Use different passwords.</p>
        <div className="grid grid-cols-2 gap-2">
          <Field id="google-store-password" label="Keystore password" value={storePassword} onChange={setStorePassword} type="password" required autoComplete="new-password" />
          <Field id="google-store-password-confirm" label="Confirm keystore password" value={confirmStorePassword} onChange={setConfirmStorePassword} type="password" required autoComplete="new-password" />
          <Field id="google-key-password" label="Private key password" value={keyPassword} onChange={setKeyPassword} type="password" required autoComplete="new-password" />
          <Field id="google-key-password-confirm" label="Confirm private key password" value={confirmKeyPassword} onChange={setConfirmKeyPassword} type="password" required autoComplete="new-password" />
        </div>

      {error ? <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive" role="alert">{error}</div> : null}
      {notice ? <div className="rounded-lg border border-border bg-surface-2 p-3 text-sm" role="status">{notice}</div> : null}

      <div className="flex gap-2">
        <Button type="button" variant="outline" className="min-h-10" onClick={() => setStage("details")} disabled={busy}>Back</Button>
        <Button type="button" onClick={() => void generate()} disabled={busy || !commonName.trim() || !storePassword || !keyPassword} className="min-h-10 flex-1">
          <ShieldCheck className="mr-2 size-4" aria-hidden="true" />{busy ? "Generating…" : "Generate key"}
        </Button>
      </div>
      </div> : null}

      {artifacts && stage === "ready" ? (
        <section className="space-y-4 rounded-xl border border-border p-3 sm:p-4" aria-labelledby="google-signing-result">
          <div className="space-y-1">
            <h3 id="google-signing-result" className="text-sm font-semibold">Your signing files are ready</h3>
            <p className="text-xs text-muted">Alias: <span className="font-mono text-foreground">{artifacts.alias}</span> · RSA {keySize} · Valid until {new Date(artifacts.validUntil).toLocaleDateString()}</p>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Button type="button" onClick={() => zipBytes && downloadFile("android-upload-key-package.zip", zipBytes, "application/zip")} className="min-h-10"><Archive className="mr-2 size-4" />ZIP</Button>
            <Button type="button" variant="outline" onClick={() => void shareZip()} className="min-h-10"><Share2 className="mr-2 size-4" />More apps</Button>
            <Button type="button" variant="outline" onClick={() => downloadFile("upload-keystore.jks", new Uint8Array(artifacts.keystore).buffer, "application/octet-stream")} className="min-h-10"><Download className="mr-2 size-4" />JKS</Button>
            <Button type="button" variant="outline" onClick={() => downloadFile("upload_certificate.pem", artifacts.certificatePem, "application/x-pem-file")} className="min-h-10"><Download className="mr-2 size-4" />PEM</Button>
          </div>
          <p className="text-xs text-muted">Your device shows available storage apps with their official icons.</p>
          <details className="rounded-lg border border-border p-3">
            <summary className="cursor-pointer text-sm font-medium">Fingerprints</summary>
            <div className="space-y-2 pt-2">
              {[{label:"SHA-1",value:artifacts.sha1},{label:"SHA-256",value:artifacts.sha256}].map((item) => (
                <div key={item.label} className="space-y-1 rounded-lg bg-surface-2 p-2">
                  <div className="flex items-center justify-between gap-2"><span className="text-xs font-medium">{item.label}</span><Button type="button" size="sm" variant="ghost" onClick={() => void copyText(item.value).then(()=>setNotice(`${item.label} copied.`)).catch((cause)=>setError(cause instanceof Error?cause.message:"Could not copy fingerprint."))}><Copy className="mr-1.5 size-3.5" />Copy</Button></div>
                  <code className="block break-all text-xs leading-5">{item.value}</code>
                </div>
              ))}
            </div>
          </details>
          <details className="rounded-lg border border-border p-3">
            <summary className="cursor-pointer text-sm font-medium">Gradle configuration</summary>
            <div className="space-y-2 pt-2">
            <div className="flex flex-wrap items-center justify-between gap-2"><h4 className="text-sm font-semibold">Gradle signing configuration</h4><div className="flex gap-1"><Button type="button" size="sm" variant={gradleKind === "kotlin" ? "secondary" : "ghost"} onClick={()=>setGradleKind("kotlin")}>Kotlin DSL</Button><Button type="button" size="sm" variant={gradleKind === "groovy" ? "secondary" : "ghost"} onClick={()=>setGradleKind("groovy")}>Groovy</Button></div></div>
            <pre className="whitespace-pre-wrap break-words rounded-lg border border-border bg-surface-2 p-3 text-xs leading-5"><code>{gradleKind === "kotlin" ? artifacts.gradleKotlin : artifacts.gradleGroovy}</code></pre>
            <Button type="button" variant="outline" size="sm" onClick={() => void copyText(gradleKind === "kotlin" ? artifacts.gradleKotlin : artifacts.gradleGroovy).then(()=>setNotice("Gradle snippet copied.")).catch((cause)=>setError(cause instanceof Error?cause.message:"Could not copy configuration."))}><Copy className="mr-2 size-3.5" />Copy Gradle configuration</Button>
            </div>
          </details>
        </section>
      ) : null}

      {stage === "security" ? <p className="text-xs text-muted">Your private key stays on this device. Password fields clear after generation.</p> : null}
    </div>
  );
}
