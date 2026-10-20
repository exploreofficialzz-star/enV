type SocialPlatform = "x" | "instagram" | "tiktok" | "youtube" | "facebook" | "whatsapp" | "linkedin" | "snapchat";

type SocialLink = { platform: SocialPlatform; label: string; href?: string };

const envLinks: SocialLink[] = [
  { platform: "x", label: "X", href: "https://x.com/envtoolz" },
  { platform: "instagram", label: "Instagram", href: "https://www.instagram.com/envtools.store?dlrf=MWRreno0dTM1d3BhNw==" },
  { platform: "tiktok", label: "TikTok", href: "https://www.tiktok.com/@envtools.store?_r=1&_t=ZS-9Ai1xRqMZjp" },
  { platform: "youtube", label: "YouTube", href: "https://www.youtube.com/@envtoolz" },
  { platform: "facebook", label: "Facebook" },
];

const chasLinks: SocialLink[] = [
  { platform: "facebook", label: "Facebook", href: "https://www.facebook.com/share/1GfoVk8MZK/" },
  { platform: "tiktok", label: "TikTok", href: "https://www.tiktok.com/@chastechnologiesllc" },
  { platform: "x", label: "X", href: "https://x.com/chAstechllc" },
  { platform: "whatsapp", label: "WhatsApp", href: "https://whatsapp.com/channel/0029Vb8F1WH0QeacnxL5sN2L" },
  { platform: "instagram", label: "Instagram", href: "https://www.instagram.com/chastechnologiesllc?rpxt=MTJ0a2lwM2oyNzRobw==" },
  { platform: "linkedin", label: "LinkedIn", href: "https://www.linkedin.com/in/chas-technologies-llc?utm_source=share_via&utm_content=profile&utm_medium=member_android" },
  { platform: "snapchat", label: "Snapchat", href: "https://www.snapchat.com/add/chastechllc?share_id=4ULXY20944Q&locale=en-US" },
  { platform: "youtube", label: "YouTube", href: "https://www.youtube.com/@chAsTechnologiesLLC" },
];

export function SocialLinks({ brand }: { brand: "env" | "chas" }) {
  const isEnv = brand === "env";
  const owner = isEnv ? "enV" : "chAs Technologies LLC";
  const items = isEnv ? envLinks : chasLinks;
  const description = isEnv
    ? "Follow the enV channels for product updates, new tools, tips, and announcements."
    : "Connect with the team behind enV for company updates, partnerships, and news.";

  return (
    <section className="space-y-3" aria-label={`Official social links for ${owner}`}>
      <h2 className="text-lg font-semibold text-fg">
        {isEnv ? "Follow enV" : "Follow chAs Technologies LLC"}
      </h2>
      <p className="max-w-3xl text-sm leading-6 text-muted">{description}</p>
      <div
        className="flex w-full flex-wrap items-center gap-1 sm:gap-1.5"
        role="list"
        aria-label={`Social platforms for ${owner}`}
      >
        {items.map((item) => {
          const icon = (
            <img
              src={`/social-icons/${item.platform}.svg`}
              alt=""
              aria-hidden="true"
              width={48}
              height={48}
              loading="lazy"
              className="h-4 w-4 object-contain dark:invert sm:h-[18px] sm:w-[18px]"
            />
          );
          if (!item.href) {
            return (
              <span
                key={item.platform}
                role="listitem"
                className="inline-flex h-7 w-7 shrink-0 cursor-not-allowed items-center justify-center rounded-md opacity-40 sm:h-8 sm:w-8"
                aria-label={`The ${item.label} profile for ${owner} has not been linked yet`}
                title={`${item.label} profile link coming soon`}
              >
                {icon}
              </span>
            );
          }
          return (
            <a
              key={item.platform}
              role="listitem"
              href={item.href}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={`Follow ${owner} on ${item.label}`}
              title={item.label}
              className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-fg outline-offset-2 transition-opacity hover:opacity-60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent sm:h-8 sm:w-8"
            >
              {icon}
            </a>
          );
        })}
      </div>
    </section>
  );
}
