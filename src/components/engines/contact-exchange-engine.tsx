import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { CopyButton } from "@/components/tools/copy-button";
import { ResultPanel } from "@/components/engines/result-panel";
import { downloadText } from "@/lib/utils";

const PROFILE_KEY = "env-contact-exchange-profile-v1";

type ShareField = "fullName" | "phone" | "whatsapp" | "email" | "company" | "jobTitle" | "website" | "socialLinks" | "notes";
type Profile = Record<ShareField, string>;
type Participant = { participantId: string; card: Partial<Profile>; seenAt: number };
type NativeWebView = { postMessage: (message: string) => void };
type ContactExchangeWindow = Window & { ReactNativeWebView?: NativeWebView };

const FIELDS: { key: ShareField; label: string; placeholder: string; multiline?: boolean }[] = [
  { key: "fullName", label: "Full name", placeholder: "Alex Morgan" },
  { key: "phone", label: "Phone number", placeholder: "+1 555 010 1234" },
  { key: "whatsapp", label: "WhatsApp number", placeholder: "+1 555 010 1234" },
  { key: "email", label: "Email", placeholder: "alex@example.com" },
  { key: "company", label: "Company / business", placeholder: "Example Studio" },
  { key: "jobTitle", label: "Job title", placeholder: "Product designer" },
  { key: "website", label: "Website", placeholder: "https://example.com" },
  { key: "socialLinks", label: "Social links", placeholder: "https://linkedin.com/in/alex\nhttps://x.com/alex", multiline: true },
  { key: "notes", label: "Additional notes", placeholder: "Anything else you want to share…", multiline: true },
];

const EMPTY_PROFILE: Profile = Object.fromEntries(FIELDS.map(({ key }) => [key, ""])) as Profile;

function readStoredProfile(): Profile {
  if (typeof window === "undefined") return EMPTY_PROFILE;
  try {
    return { ...EMPTY_PROFILE, ...JSON.parse(window.localStorage.getItem(PROFILE_KEY) ?? "{}") };
  } catch {
    return EMPTY_PROFILE;
  }
}

function storeProfile(profile: Profile): boolean {
  try {
    window.localStorage.setItem(PROFILE_KEY, JSON.stringify(profile));
    return true;
  } catch {
    return false;
  }
}

function escapeVCard(value: string) {
  return value.replace(/[\\;,]/g, (match) => `\\${match}`).replace(/\r?\n/g, "\\n");
}

function selectedCard(profile: Profile, enabled: Set<ShareField>): Partial<Profile> {
  return Object.fromEntries([...enabled].filter((key) => profile[key].trim()).map((key) => [key, profile[key].trim()])) as Partial<Profile>;
}

function cardLabel(card: Partial<Profile>) {
  return card.fullName || "Unnamed contact";
}

function vCard(card: Partial<Profile>) {
  const lines = ["BEGIN:VCARD", "VERSION:3.0", `FN:${escapeVCard(card.fullName || "Unnamed contact")}`];
  if (card.phone) lines.push(`TEL;TYPE=CELL:${escapeVCard(card.phone)}`);
  if (card.whatsapp) lines.push(`item1.X-ABLABEL:WhatsApp`, `item1.X-ABTEL:${escapeVCard(card.whatsapp)}`);
  if (card.email) lines.push(`EMAIL:${escapeVCard(card.email)}`);
  if (card.company) lines.push(`ORG:${escapeVCard(card.company)}`);
  if (card.jobTitle) lines.push(`TITLE:${escapeVCard(card.jobTitle)}`);
  if (card.website) lines.push(`URL:${escapeVCard(card.website)}`);
  if (card.socialLinks) card.socialLinks.split(/\r?\n/).map((line) => line.trim()).filter(Boolean).forEach((line) => lines.push(`X-SOCIALPROFILE:${escapeVCard(line)}`));
  if (card.notes) lines.push(`NOTE:${escapeVCard(card.notes)}`);
  lines.push("END:VCARD");
  return lines.join("\r\n");
}

function ReceivedContact({ participantId, card }: { participantId: string; card: Partial<Profile> }) {
  const contactCard = vCard(card);
  const filename = `${(card.fullName || "contact").toLowerCase().replace(/[^a-z0-9]+/g, "-")}.vcf`;
  return <div key={participantId} className="rounded-xl border border-border p-4">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <div>
        <p className="font-semibold">{cardLabel(card)}</p>
        <p className="text-xs text-subtle">Temporary participant · authorized fields only</p>
      </div>
      <div className="flex gap-2">
        <CopyButton text={contactCard} />
        <Button type="button" variant="outline" size="sm" onClick={() => downloadText(contactCard, filename, "text/vcard")}>Save vCard</Button>
      </div>
    </div>
    <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
      {Object.entries(card).map(([key, value]) => <div key={key}>
        <dt className="text-xs text-subtle">{FIELDS.find((field) => field.key === key)?.label ?? key}</dt>
        <dd>{value}</dd>
      </div>)}
    </dl>
  </div>;
}

export function ContactExchangeEngine() {
  const [profile, setProfile] = useState<Profile>(EMPTY_PROFILE);
  const [profileHydrated, setProfileHydrated] = useState(false);
  const [enabled, setEnabled] = useState<Set<ShareField>>(new Set(["fullName", "phone", "email"]));
  const [active, setActive] = useState(false);
  const [participantId, setParticipantId] = useState("");
  const [participants, setParticipants] = useState<Record<string, Participant>>({});
  const [notice, setNotice] = useState("Set up your card, choose the fields allowed to share, then press Exchange.");
  const [nativeAvailable, setNativeAvailable] = useState(false);
  const profileRef = useRef(profile);
  profileRef.current = profile;

  useEffect(() => {
    const storedProfile = readStoredProfile();
    profileRef.current = storedProfile;
    setProfile(storedProfile);
    setProfileHydrated(true);
    if (typeof window !== "undefined") {
      setNativeAvailable(Boolean((window as ContactExchangeWindow).ReactNativeWebView));
      try {
        const storedEnabled = JSON.parse(window.localStorage.getItem(`${PROFILE_KEY}-fields`) ?? "null");
        if (Array.isArray(storedEnabled)) setEnabled(new Set(storedEnabled));
      } catch { /* Use the safe defaults. */ }
    }
  }, []);

  useEffect(() => {
    if (!profileHydrated) return undefined;
    const timeout = window.setTimeout(() => {
      if (!storeProfile(profile)) {
        setNotice("Contact details are available for this session, but browser storage is unavailable on this device.");
      }
    }, 250);
    return () => window.clearTimeout(timeout);
  }, [profile, profileHydrated]);

  useEffect(() => () => { storeProfile(profileRef.current); }, []);

  useEffect(() => {
    if (!nativeAvailable) return undefined;
    const onNativeMessage = (event: MessageEvent<string>) => {
      let payload: { type?: string; event?: { type?: string; data?: { participantId?: string; card?: string; message?: string } } };
      try { payload = JSON.parse(event.data); } catch { return; }
      if (payload.type !== "env-contact-exchange-event") return;
      const nativeEvent = payload.event;
      if (!nativeEvent) return;
      if (nativeEvent.type === "active") {
        setActive(true);
        if (nativeEvent.data?.participantId) setParticipantId(nativeEvent.data.participantId);
        setNotice("Searching for active nearby Exchange participants…");
      } else if (nativeEvent.type === "permission-needed") {
        setNotice("Nearby permissions are required. Grant them in the system prompt, then press Exchange again.");
      } else if (nativeEvent.type === "connected") {
        setNotice("Connected — authorized contact cards are exchanged automatically with active nearby participants.");
      } else if (nativeEvent.type === "contact-received" && nativeEvent.data?.participantId && nativeEvent.data.card) {
        try {
          const received = JSON.parse(nativeEvent.data.card) as Partial<Profile>;
          setParticipants((current) => ({ ...current, [nativeEvent.data!.participantId!]: { participantId: nativeEvent.data!.participantId!, card: received, seenAt: Date.now() } }));
          setNotice("Contact received from an active nearby participant.");
        } catch { setNotice("A nearby participant sent an invalid contact card."); }
      } else if (nativeEvent.type === "stopped") {
        setActive(false);
        setParticipants({});
        setNotice("Exchange stopped. Nothing is shared while Exchange is off.");
      } else if (nativeEvent.type === "error") {
        setNotice(nativeEvent.data?.message || "Nearby exchange encountered an error.");
      }
    };
    window.addEventListener("message", onNativeMessage);
    return () => window.removeEventListener("message", onNativeMessage);
  }, [nativeAvailable]);

  const card = useMemo(() => selectedCard(profile, enabled), [enabled, profile]);
  const cardReady = Object.keys(card).length > 0;
  const exchangeCards = Object.values(participants).filter((participant) => participant.participantId !== participantId);

  const updateProfile = (key: ShareField, value: string) => {
    setProfile((current) => ({ ...current, [key]: value }));
  };

  const toggleField = (key: ShareField) => {
    setEnabled((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key); else next.add(key);
      try {
        window.localStorage.setItem(`${PROFILE_KEY}-fields`, JSON.stringify([...next]));
      } catch {
        setNotice("Your selected fields are available for this session, but browser storage is unavailable.");
      }
      return next;
    });
  };

  const toggleExchange = () => {
    if (!nativeAvailable) {
      setNotice("Phone-to-phone Exchange is available in the enV Android/iOS app. The web version only configures and exports your card.");
      return;
    }
    if (active) {
      (window as ContactExchangeWindow).ReactNativeWebView?.postMessage(JSON.stringify({ type: "env-contact-exchange-stop" }));
      setActive(false);
      setParticipants({});
      setNotice("Exchange stopped. Nothing is shared while Exchange is off.");
      return;
    }
    if (!cardReady) {
      setNotice("Add at least one value and enable that field before exchanging.");
      return;
    }
    (window as ContactExchangeWindow).ReactNativeWebView?.postMessage(JSON.stringify({ type: "env-contact-exchange-start", profile: JSON.stringify(profile), fields: [...enabled] }));
    setNotice("Requesting nearby permissions and starting Exchange…");
  };

  return <div className="space-y-6">
    <div className="rounded-xl border border-border bg-surface-2 p-4">
      <p className="text-sm font-semibold">Instant Contact Exchange</p>
      <p className="mt-1 text-sm text-muted">Configure once. Only the fields you enable are shared, and only while you deliberately keep Exchange active.</p>
      <p className="mt-2 text-xs text-subtle">{nativeAvailable ? "Native transport: encrypted Android Nearby Connections or iOS MultipeerConnectivity over the best available nearby path." : "Web mode: configure and export your card here. Open the enV Android/iOS app for encrypted phone-to-phone Exchange."}</p>
    </div>

    <section className="space-y-4">
      <div><h3 className="text-base font-semibold">1. Your contact card</h3><p className="text-sm text-muted">Values are stored locally in this browser.</p></div>
      <div className="grid gap-4 sm:grid-cols-2">
        {FIELDS.map(({ key, label, placeholder, multiline }) => <div key={key} className="space-y-2">
          <Label htmlFor={`contact-${key}`}>{label}</Label>
          {multiline ? <Textarea id={`contact-${key}`} value={profile[key]} onChange={(event) => updateProfile(key, event.target.value)} placeholder={placeholder} /> : <Input id={`contact-${key}`} value={profile[key]} onChange={(event) => updateProfile(key, event.target.value)} placeholder={placeholder} />}
          <label className="flex items-center gap-2 text-xs text-muted"><input type="checkbox" checked={enabled.has(key)} onChange={() => toggleField(key)} /> Allow this field during Exchange</label>
        </div>)}
      </div>
    </section>

    <section className="rounded-xl border border-border p-4">
      <div className="flex flex-wrap items-center justify-between gap-3"><div><h3 className="text-base font-semibold">2. Exchange</h3><p className="text-sm text-muted">{notice}</p></div><Button type="button" onClick={toggleExchange} variant={active ? "outline" : "default"}>{active ? "Stop Exchange" : "Exchange"}</Button></div>
      <ResultPanel items={[{ label: "Allowed fields", value: `${Object.keys(card).length} selected`, primary: true }, { label: "Active participants", value: String(exchangeCards.length + (active ? 1 : 0)) }, { label: "Session", value: active ? "Temporary and active" : "Off" }]} />
    </section>

    {exchangeCards.length ? <section className="space-y-3">
      <div><h3 className="text-base font-semibold">Received contacts</h3><p className="text-sm text-muted">No per-person confirmation is required after Exchange is activated.</p></div>
      {exchangeCards.map((participant) => <ReceivedContact key={participant.participantId} participantId={participant.participantId} card={participant.card} />)}
    </section> : null}

    {cardReady ? <div className="flex flex-wrap gap-2"><Button type="button" variant="outline" onClick={() => downloadText(vCard(card), "my-contact.vcf", "text/vcard")}>Export my vCard</Button><CopyButton text={vCard(card)} /></div> : null}
  </div>;
}
