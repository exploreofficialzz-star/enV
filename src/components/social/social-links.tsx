import type { CSSProperties } from "react";

type SocialPlatform = "x" | "instagram" | "tiktok" | "youtube" | "facebook" | "whatsapp" | "linkedin" | "snapchat";

type SocialLink = {
  platform: SocialPlatform;
  label: string;
  detail: string;
  href?: string;
  iconBackground: string;
  iconColor: string;
};

const envLinks: SocialLink[] = [
  { platform: "x", label: "X", detail: "@envtoolz", href: "https://x.com/envtoolz", iconBackground: "#151515", iconColor: "#FFFFFF" },
  { platform: "instagram", label: "Instagram", detail: "@envtools.store", href: "https://www.instagram.com/envtools.store?dlrf=MWRreno0dTM1d3BhNw==", iconBackground: "#FCE7F3", iconColor: "#C13584" },
  { platform: "tiktok", label: "TikTok", detail: "@envtools.store", href: "https://www.tiktok.com/@envtools.store?_r=1&_t=ZS-9Ai1xRqMZjp", iconBackground: "#151515", iconColor: "#FFFFFF" },
  { platform: "youtube", label: "YouTube", detail: "@envtoolz", href: "https://www.youtube.com/@envtoolz", iconBackground: "#FEE2E2", iconColor: "#FF0033" },
  { platform: "facebook", label: "Facebook", detail: "Profile link coming soon", iconBackground: "#DBEAFE", iconColor: "#0866FF" },
];

const chasLinks: SocialLink[] = [
  { platform: "facebook", label: "Facebook", detail: "chAs Technologies LLC", href: "https://www.facebook.com/share/1GfoVk8MZK/", iconBackground: "#DBEAFE", iconColor: "#0866FF" },
  { platform: "tiktok", label: "TikTok", detail: "@chastechnologiesllc", href: "https://www.tiktok.com/@chastechnologiesllc", iconBackground: "#151515", iconColor: "#FFFFFF" },
  { platform: "x", label: "X", detail: "@chAstechllc", href: "https://x.com/chAstechllc", iconBackground: "#151515", iconColor: "#FFFFFF" },
  { platform: "whatsapp", label: "WhatsApp", detail: "Official channel", href: "https://whatsapp.com/channel/0029Vb8F1WH0QeacnxL5sN2L", iconBackground: "#DCFCE7", iconColor: "#128C7E" },
  { platform: "instagram", label: "Instagram", detail: "@chastechnologiesllc", href: "https://www.instagram.com/chastechnologiesllc?rpxt=MTJ0a2lwM2oyNzRobw==", iconBackground: "#FCE7F3", iconColor: "#C13584" },
  { platform: "linkedin", label: "LinkedIn", detail: "chAs Technologies LLC", href: "https://www.linkedin.com/in/chas-technologies-llc?utm_source=share_via&utm_content=profile&utm_medium=member_android", iconBackground: "#DBEAFE", iconColor: "#0A66C2" },
  { platform: "snapchat", label: "Snapchat", detail: "@chastechllc", href: "https://www.snapchat.com/add/chastechllc?share_id=4ULXY20944Q&locale=en-US", iconBackground: "#FFFC00", iconColor: "#111111" },
  { platform: "youtube", label: "YouTube", detail: "@chAsTechnologiesLLC", href: "https://www.youtube.com/@chAsTechnologiesLLC", iconBackground: "#FEE2E2", iconColor: "#FF0033" },
];

const iconStyle: CSSProperties = { display: "block", width: "22px", height: "22px" };

function SocialIcon({ platform }: { platform: SocialPlatform }) {
  return (
    <svg aria-hidden="true" focusable="false" viewBox="0 0 24 24" style={iconStyle} fill="currentColor">
      {platform === "x" && <path d="M18.9 1.1h3.7l-8.1 9.3L24 22.8h-7.4l-5.8-7.6-6.6 7.6H.5l8.6-9.8L0 1.1h7.6l5.2 6.9 6.1-6.9Zm-1.3 19.5h2L6.5 3.2H4.3l13.3 17.4Z" />}
      {platform === "instagram" && (
        <g fill="none" stroke="currentColor" strokeWidth="1.9">
          <rect x="3" y="3" width="18" height="18" rx="5" />
          <circle cx="12" cy="12" r="4.1" />
          <circle cx="17.6" cy="6.8" r="1" fill="currentColor" stroke="none" />
        </g>
      )}
      {platform === "tiktok" && <path d="M15.8 2h3.1c.2 2.6 1.7 4.2 4.1 4.7v3.2a10.1 10.1 0 0 1-4.2-1.3v7.2a6.4 6.4 0 1 1-6.4-6.4c.5 0 1 .1 1.4.2v3.4a3.1 3.1 0 1 0 1.9 2.8V2Z" />}
      {platform === "youtube" && (
        <>
          <path d="M23.2 7a3 3 0 0 0-2.1-2.1C19.2 4.4 12 4.4 12 4.4s-7.2 0-9.1.5A3 3 0 0 0 .8 7 31 31 0 0 0 .4 12a31 31 0 0 0 .4 5 3 3 0 0 0 2.1 2.1c1.9.5 9.1.5 9.1.5s7.2 0 9.1-.5a3 3 0 0 0 2.1-2.1 31 31 0 0 0 .4-5 31 31 0 0 0-.4-5Z" />
          <path d="m9.7 8.7 6 3.3-6 3.3V8.7Z" fill="#FFFFFF" />
        </>
      )}
      {platform === "facebook" && <path d="M13.6 22v-8.2h2.8l.4-3.2h-3.2V8.5c0-.9.3-1.6 1.6-1.6H17V4.1c-.3 0-1.3-.1-2.5-.1-2.5 0-4.2 1.5-4.2 4.3v2.3H7.5v3.2h2.8V22h3.3Z" />}
      {platform === "whatsapp" && (
        <path d="M12 2a9.7 9.7 0 0 0-8.3 14.7L2.4 21.6l5-1.3A9.8 9.8 0 1 0 12 2Zm0 17.8a8 8 0 0 1-4.1-1.1l-.3-.2-2.9.8.8-2.8-.2-.3A8 8 0 1 1 12 19.8Zm4.4-5.9c-.2-.1-1.3-.7-1.5-.8-.2-.1-.4-.1-.5.1s-.6.8-.8.9c-.1.2-.3.2-.5.1-.2-.1-1-.4-1.9-1.2-.7-.6-1.2-1.4-1.3-1.6-.1-.2 0-.4.1-.5l.4-.5c.1-.1.2-.3.2-.4.1-.2 0-.3 0-.5l-.7-1.7c-.2-.4-.3-.4-.5-.4h-.5c-.2 0-.4.1-.6.3-.2.2-.8.8-.8 1.9s.8 2.2.9 2.4c.1.2 1.6 2.5 3.8 3.4.5.2.9.4 1.2.4.5.2 1 .2 1.4.1.4-.1 1.3-.5 1.5-1.1.2-.5.2-1 .1-1.1-.1-.1-.2-.2-.5-.3Z" />
      )}
      {platform === "linkedin" && <path d="M20.4 20.4h-3.6v-5.6c0-1.3 0-3-1.8-3s-2.1 1.4-2.1 2.9v5.7H9.3V9h3.5v1.6h.1c.5-.9 1.6-1.9 3.3-1.9 3.6 0 4.3 2.4 4.3 5.5v6.2ZM5.4 7.4a2.1 2.1 0 1 1 0-4.2 2.1 2.1 0 0 1 0 4.2ZM7.2 20.4H3.6V9h3.6v11.4ZM22.2 0H1.8C.8 0 0 .8 0 1.8v20.4c0 1 .8 1.8 1.8 1.8h20.4c1 0 1.8-.8 1.8-1.8V1.8c0-1-.8-1.8-1.8-1.8Z" />}
      {platform === "snapchat" && <path d="M12 2.2c-3.3 0-5.3 2.7-5.3 6.1 0 .6.1 1.2.2 1.8-.6.2-1.3-.1-1.8-.5-.3-.2-.6-.2-.8.1-.2.2-.2.6.1.8.7.6 1.6.9 2.4.9-.1 1.5-.6 2.8-1.5 3.8-.6.6-1.2 1.1-2 1.4-.3.1-.4.4-.3.7.1.3.3.4.6.4 1.2.1 2 .5 2.5 1.3.2.4.5.8 1.2.7.5-.1 1.1-.4 1.7-.4.8 0 1.7.5 3 .5s2.2-.5 3-.5c.6 0 1.2.3 1.7.4.7.1 1-.3 1.2-.7.5-.8 1.3-1.2 2.5-1.3.3 0 .5-.2.6-.4.1-.3 0-.6-.3-.7-.8-.3-1.4-.8-2-1.4-.9-1-1.4-2.3-1.5-3.8.8 0 1.7-.3 2.4-.9.3-.2.3-.6.1-.8-.2-.3-.5-.3-.8-.1-.5.4-1.2.7-1.8.5.1-.6.2-1.2.2-1.8 0-3.4-2-6.1-5.3-6.1Z" />}
    </svg>
  );
}

function SocialCard({ item }: { item: SocialLink }) {
  const icon = (
    <span
      className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl"
      style={{ backgroundColor: item.iconBackground, color: item.iconColor }}
    >
      <SocialIcon platform={item.platform} />
    </span>
  );

  const cardContent = (
    <>
      {icon}
      <span className="min-w-0 flex-1">
        <span className="block font-semibold text-fg">{item.label}</span>
        <span className="mt-0.5 block truncate text-xs text-muted">{item.detail}</span>
      </span>
      {item.href ? <span className="text-muted transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" aria-hidden="true">↗</span> : null}
    </>
  );

  const className = "group flex min-w-0 items-center gap-3 rounded-xl border border-border bg-surface px-3 py-3 text-left transition-colors hover:border-accent/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50";

  if (!item.href) {
    return (
      <div className={className + " cursor-not-allowed opacity-75"} aria-disabled="true" title="Facebook link coming soon">
        {cardContent}
      </div>
    );
  }

  return (
    <a className={className} href={item.href} target="_blank" rel="noopener noreferrer" aria-label={`Open ${item.label} for ${item.detail} in a new tab`}>
      {cardContent}
    </a>
  );
}

export function SocialLinks({ brand }: { brand: "env" | "chas" }) {
  const isEnv = brand === "env";
  const items = isEnv ? envLinks : chasLinks;

  return (
    <section className="space-y-3" aria-labelledby={`social-${brand}-title`}>
      <div>
        <h2 id={`social-${brand}-title`} className="text-lg font-semibold text-fg">
          {isEnv ? "Follow enV" : "Follow chAs Technologies LLC"}
        </h2>
        <p className="mt-1 text-sm text-muted">
          {isEnv
            ? "Follow the enV channels for product updates, new tools, tips, and announcements."
            : "Connect with the team behind enV for company updates, partnerships, and news."}
        </p>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {items.map((item) => <SocialCard key={item.platform} item={item} />)}
      </div>
    </section>
  );
}
