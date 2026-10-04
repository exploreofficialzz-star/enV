import { useState } from "react";
import { FieldGrid, type UiField } from "@/components/engines/fields";
import { initialValues } from "@/components/engines/initial-values";
import { Button } from "@/components/ui/button";

const THEMES: Record<string, { name: string; bg: string; bubbleMe: string; bubbleThem: string; meFg: string; themFg: string; header: string; radius: string }> = {
  whatsapp: { name: "WhatsApp", bg: "#ece5dd", bubbleMe: "#dcf8c6", bubbleThem: "#fff", meFg: "#111", themFg: "#111", header: "#075e54", radius: "12px" },
  imessage: { name: "iMessage", bg: "#000", bubbleMe: "#0b84ff", bubbleThem: "#2c2c2e", meFg: "#fff", themFg: "#fff", header: "#1c1c1e", radius: "18px" },
  "instagram-dm": { name: "Instagram", bg: "#000", bubbleMe: "#3797f0", bubbleThem: "#262626", meFg: "#fff", themFg: "#fff", header: "#000", radius: "22px" },
  messenger: { name: "Messenger", bg: "#fff", bubbleMe: "#0084ff", bubbleThem: "#e4e6eb", meFg: "#fff", themFg: "#050505", header: "#fff", radius: "18px" },
  telegram: { name: "Telegram", bg: "#0e1621", bubbleMe: "#2b5278", bubbleThem: "#182533", meFg: "#fff", themFg: "#fff", header: "#17212b", radius: "12px" },
  discord: { name: "Discord", bg: "#313338", bubbleMe: "#5865f2", bubbleThem: "#2b2d31", meFg: "#fff", themFg: "#dbdee1", header: "#2b2d31", radius: "8px" },
  snapchat: { name: "Snapchat", bg: "#fffc00", bubbleMe: "#fff", bubbleThem: "#fff", meFg: "#000", themFg: "#000", header: "#fffc00", radius: "16px" },
  "x-dm": { name: "X", bg: "#000", bubbleMe: "#1d9bf0", bubbleThem: "#202327", meFg: "#fff", themFg: "#e7e9ea", header: "#000", radius: "20px" },
  "google-messages": { name: "Messages", bg: "#fff", bubbleMe: "#d3e3fd", bubbleThem: "#f2f2f2", meFg: "#001d35", themFg: "#1f1f1f", header: "#fff", radius: "16px" },
  sms: { name: "SMS", bg: "#f2f2f2", bubbleMe: "#1982fc", bubbleThem: "#e5e5ea", meFg: "#fff", themFg: "#000", header: "#f9f9f9", radius: "16px" },
  signal: { name: "Signal", bg: "#1a1a1a", bubbleMe: "#2c6bed", bubbleThem: "#3b3b3b", meFg: "#fff", themFg: "#fff", header: "#121212", radius: "12px" },
  slack: { name: "Slack", bg: "#fff", bubbleMe: "#1264a3", bubbleThem: "#eee", meFg: "#fff", themFg: "#1d1c1d", header: "#350d36", radius: "8px" },
  "linkedin-dm": { name: "LinkedIn", bg: "#f3f2ef", bubbleMe: "#0a66c2", bubbleThem: "#fff", meFg: "#fff", themFg: "#000", header: "#fff", radius: "12px" },
  reddit: { name: "Reddit", bg: "#1a1a1b", bubbleMe: "#d93a00", bubbleThem: "#272729", meFg: "#fff", themFg: "#d7dadc", header: "#1a1a1b", radius: "8px" },
  tinder: { name: "Tinder", bg: "#111", bubbleMe: "#fe3c72", bubbleThem: "#222", meFg: "#fff", themFg: "#fff", header: "#111", radius: "16px" },
  "tiktok-chat": { name: "TikTok", bg: "#000", bubbleMe: "#fe2c55", bubbleThem: "#1f1f1f", meFg: "#fff", themFg: "#fff", header: "#000", radius: "12px" },
  threads: { name: "Threads", bg: "#000", bubbleMe: "#fff", bubbleThem: "#1e1e1e", meFg: "#000", themFg: "#fff", header: "#000", radius: "16px" },
  "ai-chat": { name: "AI chat", bg: "#0e1114", bubbleMe: "#0d9f8a", bubbleThem: "#171b1e", meFg: "#fff", themFg: "#eef0f2", header: "#171b1e", radius: "12px" },
  notification: { name: "Notification", bg: "#f2f2f7", bubbleMe: "#fff", bubbleThem: "#fff", meFg: "#000", themFg: "#000", header: "#f2f2f7", radius: "16px" },
};

const FIELDS: UiField[] = [
  { name: "them", label: "Other person", type: "text", defaultValue: "Alex" },
  { name: "me", label: "You", type: "text", defaultValue: "You" },
  {
    name: "lines",
    label: "Messages (prefix with me: or them:)",
    type: "textarea",
    defaultValue: "them: Are you free Thursday?\nme: Yes — 3pm works.\nthem: Perfect, see you then.",
  },
];

export function MockupEngine({ variant }: { variant: string }) {
  const theme = THEMES[variant] ?? THEMES.whatsapp;
  const [vals, setVals] = useState(() => initialValues(FIELDS));
  const lines = (vals.lines || "")
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => {
      const me = /^me:\s*/i.test(l);
      const them = /^them:\s*/i.test(l);
      return { me: me || !them, text: l.replace(/^(me|them):\s*/i, "") };
    });

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
      <div className="space-y-4">
        <p className="rounded-md bg-warn/15 px-3 py-2 text-xs text-fg">
          DEMO / MOCKUP / FICTIONAL — for storytelling, education, prototyping, and parody. Not authentic evidence.
        </p>
        <FieldGrid fields={FIELDS} values={vals} onChange={(n, v) => setVals((o) => ({ ...o, [n]: v }))} />
        <Button
          type="button"
          variant="outline"
          onClick={() => window.print()}
        >
          Print / Save as PDF
        </Button>
      </div>
      <div className="mx-auto w-full max-w-[320px]">
        <div className="overflow-hidden rounded-[28px] shadow-[var(--shadow-border)]" style={{ background: theme.bg }}>
          <div className="px-4 py-3 text-sm font-medium" style={{ background: theme.header, color: "#fff" }}>
            {vals.them || theme.name}
            <span className="mt-0.5 block text-[10px] tracking-wide uppercase opacity-80">Demo mockup</span>
          </div>
          <div className="flex min-h-80 flex-col gap-2 p-3">
            {lines.map((l, i) => (
              <div key={i} className={l.me ? "self-end max-w-[80%]" : "self-start max-w-[80%]"}>
                <p
                  className="px-3 py-2 text-[13px] leading-5"
                  style={{
                    background: l.me ? theme.bubbleMe : theme.bubbleThem,
                    color: l.me ? theme.meFg : theme.themFg,
                    borderRadius: theme.radius,
                  }}
                >
                  {l.text}
                </p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

const POSTS: Record<string, { platform: string; handle: string }> = {
  "instagram-post": { platform: "Instagram", handle: "@studio" },
  "tiktok-post": { platform: "TikTok", handle: "@studio" },
  "x-post": { platform: "X", handle: "@studio" },
  "facebook-post": { platform: "Facebook", handle: "Studio" },
  "linkedin-post": { platform: "LinkedIn", handle: "Studio" },
  "reddit-post": { platform: "Reddit", handle: "u/studio" },
  "youtube-community": { platform: "YouTube", handle: "Studio" },
  "threads-post": { platform: "Threads", handle: "@studio" },
};

export function PostEngine({ variant }: { variant: string }) {
  const meta = POSTS[variant] ?? { platform: "Post", handle: "@studio" };
  const [name, setName] = useState("Studio");
  const [body, setBody] = useState("A labeled fictional post for mockups and thumbnails.");
  return (
    <div className="space-y-4">
      <p className="rounded-md bg-warn/15 px-3 py-2 text-xs">DEMO / MOCKUP / FICTIONAL</p>
      <FieldGrid
        fields={[
          { name: "name", label: "Display name", type: "text" },
          { name: "body", label: "Post text", type: "textarea" },
        ]}
        values={{ name, body }}
        onChange={(n, v) => (n === "name" ? setName(v) : setBody(v))}
      />
      <article className="mx-auto max-w-md rounded-xl bg-surface p-4 shadow-[var(--shadow-border)]">
        <p className="text-[10px] font-medium uppercase tracking-wide text-subtle">{meta.platform} mockup</p>
        <p className="mt-2 text-sm font-semibold">
          {name} <span className="font-normal text-muted">{meta.handle}</span>
        </p>
        <p className="mt-2 text-sm leading-6">{body}</p>
        <p className="mt-3 text-xs text-subtle">2h · Fictional</p>
      </article>
    </div>
  );
}
