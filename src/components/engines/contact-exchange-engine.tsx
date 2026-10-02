import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { CopyButton } from "@/components/tools/copy-button";
import { ResultPanel } from "@/components/engines/result-panel";
import { downloadText } from "@/lib/utils";

const PROFILE_KEY = "env-contact-exchange-profile-v1";
const SESSION_KEY = "env-contact-exchange-session-v1";
const CHANNEL_NAME = "env-contact-exchange-v1";
const SESSION_TTL = 5 * 60 * 1000;

type ShareField = "fullName" | "phone" | "whatsapp" | "email" | "company" | "jobTitle" | "website" | "socialLinks" | "notes";
type Profile = Record<ShareField, string>;
type Participant = { participantId: string; card: Partial<Profile>; seenAt: number };
type ExchangeMessage =
  | { type: "hello"; sessionId: string; participantId: string; card: Partial<Profile>; sentAt: number }
  | { type: "card"; sessionId: string; participantId: string; card: Partial<Profile>; sentAt: number }
  | { type: "leave"; sessionId: string; participantId: string };

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

function newId(prefix: string) {
  return `${prefix}-${crypto.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`}`;
}

function getSession() {
  if (typeof window === "undefined") return null;
  try {
    const value = JSON.parse(window.localStorage.getItem(SESSION_KEY) ?? "null") as { sessionId: string; expiresAt: number } | null;
    return value && value.expiresAt > Date.now() ? value : null;
  } catch {
    return null;
  }
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
  const [enabled, setEnabled] = useState<Set<ShareField>>(new Set(["fullName", "phone", "email"]));
  const [active, setActive] = useState(false);
  const [sessionId, setSessionId] = useState("");
  const [participantId, setParticipantId] = useState("");
  const [participants, setParticipants] = useState<Record<string, Participant>>({});
  const [notice, setNotice] = useState("Set up your card, choose the fields allowed to share, then press Exchange.");

  useEffect(() => {
    setProfile(readStoredProfile());
    if (typeof window !== "undefined") {
      try {
        const storedEnabled = JSON.parse(window.localStorage.getItem(`${PROFILE_KEY}-fields`) ?? "null");
        if (Array.isArray(storedEnabled)) setEnabled(new Set(storedEnabled));
      } catch { /* Use the safe defaults. */ }
    }
  }, []);

  const card = useMemo(() => selectedCard(profile, enabled), [enabled, profile]);
  const cardReady = Object.keys(card).length > 0;
  const exchangeCards = Object.values(participants).filter((participant) => participant.participantId !== participantId);

  useEffect(() => {
    if (!active || !sessionId || !participantId || typeof window === "undefined") return;
    const channel = "BroadcastChannel" in window ? new BroadcastChannel(CHANNEL_NAME) : null;
    const message: ExchangeMessage = { type: "hello", sessionId, participantId, card, sentAt: Date.now() };
    channel?.postMessage(message);
    const onMessage = (event: MessageEvent<ExchangeMessage>) => {
      const incoming = event.data;
      if (!incoming || incoming.sessionId !== sessionId || incoming.participantId === participantId) return;
      if (incoming.type === "leave") {
        setParticipants((current) => {
          const next = { ...current };
          delete next[incoming.participantId];
          return next;
        });
        return;
      }
      setParticipants((current) => ({ ...current, [incoming.participantId]: { participantId: incoming.participantId, card: incoming.card, seenAt: Date.now() } }));
      if (incoming.type === "hello") channel?.postMessage({ type: "card", sessionId, participantId, card, sentAt: Date.now() } satisfies ExchangeMessage);
      setNotice("Connected — authorized contact cards are exchanged automatically with active participants.");
    };
    channel?.addEventListener("message", onMessage);
    const heartbeat = window.setInterval(() => channel?.postMessage({ type: "card", sessionId, participantId, card, sentAt: Date.now() } satisfies ExchangeMessage), 30_000);
    return () => {
      window.clearInterval(heartbeat);
      channel?.postMessage({ type: "leave", sessionId, participantId } satisfies ExchangeMessage);
      channel?.close();
    };
  }, [active, card, participantId, sessionId]);

  const updateProfile = (key: ShareField, value: string) => {
    setProfile((current) => {
      const next = { ...current, [key]: value };
      window.localStorage.setItem(PROFILE_KEY, JSON.stringify(next));
      return next;
    });
  };

  const toggleField = (key: ShareField) => {
    setEnabled((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key); else next.add(key);
      window.localStorage.setItem(`${PROFILE_KEY}-fields`, JSON.stringify([...next]));
      return next;
    });
  };

  const toggleExchange = () => {
    if (active) {
      setActive(false);
      setParticipants({});
      setNotice("Exchange stopped. Nothing is shared while Exchange is off.");
      return;
    }
    if (!cardReady) {
      setNotice("Add at least one value and enable that field before exchanging.");
      return;
    }
    const current = getSession();
    const nextSession = current?.sessionId ?? newId("session");
    window.localStorage.setItem(SESSION_KEY, JSON.stringify({ sessionId: nextSession, expiresAt: Date.now() + SESSION_TTL }));
    setSessionId(nextSession);
    setParticipantId(newId("participant"));
    setParticipants({});
    setActive(true);
    setNotice("Searching for active Exchange participants…");
  };

  return <div className="space-y-6">
    <div className="rounded-xl border border-border bg-surface-2 p-4">
      <p className="text-sm font-semibold">Instant Contact Exchange</p>
      <p className="mt-1 text-sm text-muted">Configure once. Only the fields you enable are shared, and only while you deliberately keep Exchange active.</p>
      <p className="mt-2 text-xs text-subtle">Browser transport: active same-origin tabs/windows use a temporary local session. Native nearby Bluetooth/Wi‑Fi transport belongs in the mobile implementation and is not simulated here.</p>
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
