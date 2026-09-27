/** Optional ad region. Empty until an ad provider is configured. */
export function AdSlot({ slot }: { slot: "header" | "tool" | "sidebar" | "footer" }) {
  return <aside data-ad-slot={slot} className="hidden" aria-hidden="true" />;
}
