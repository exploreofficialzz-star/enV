export type BlogArticle = {
  slug: string;
  title: string;
  summary: string;
  category: string;
  publishedLabel: string;
  readingMinutes: number;
  sections: { heading: string; paragraphs: string[]; bullets?: string[] }[];
};

export const BLOG_ARTICLES: BlogArticle[] = [
  {
    slug: "a-more-private-way-to-use-online-tools",
    title: "A more private way to use everyday online tools",
    summary: "Why enV puts local processing, clear data-flow notices, and user control at the center of the toolkit.",
    category: "Privacy & trust",
    publishedLabel: "Product principles",
    readingMinutes: 4,
    sections: [
      { heading: "Privacy should be part of the product", paragraphs: ["A useful tool should explain what happens to your input before you rely on it. enV is designed around local-first utilities where practical, so simple transformations can happen on your device without uploading the content.", "Some features need a server, an AI provider, or a remote media processor. Those paths should be clearly identified, limited to the work requested, and covered by the applicable privacy notice."] },
      { heading: "Practical habits that help", paragraphs: ["Treat production credentials, private keys, health records, and confidential customer data carefully in any online tool."], bullets: ["Prefer a local tool when it can complete the task.", "Check the tool's processing notice before uploading a file.", "Share the minimum information needed to get the result.", "Report unexpected uploads or confusing privacy copy to support."] },
      { heading: "Our commitment", paragraphs: ["We aim to make the processing path understandable rather than asking people to trust a vague promise. Product claims must match the actual implementation, and any cloud-dependent capability should say so."] },
    ],
  },
  {
    slug: "how-env-tokens-are-designed-to-work",
    title: "How enV tokens are designed to work",
    summary: "A plain-language introduction to fractional token accounting, transparent estimates, and why prices remain provisional until verified.",
    category: "Tokens & billing",
    publishedLabel: "Token guide",
    readingMinutes: 5,
    sections: [
      { heading: "One wallet, understandable units", paragraphs: ["The proposed enV wallet uses a single cross-platform accounting ledger. A visible token is divided into 1,000 integer milli-token subunits internally so small charges can be represented without floating-point rounding errors.", "The current reference proposal is 100 tokens to US$1.00. This is a design reference, not a live sale, cash balance, guaranteed exchange rate, or promise of a local price."] },
      { heading: "Different work has different costs", paragraphs: ["A simple local calculation is not the same as a video conversion, cloud OCR job, or AI-agent workflow. Lightweight example rates are hypotheses. Cloud and AI prices require measured inputs, provider costs, retries, infrastructure fees, and margin checks before a real quote can be offered."] },
      { heading: "No surprise charging", paragraphs: ["The current release keeps purchases and automatic token deductions disabled. Before launch, every chargeable operation should show a meaningful estimate or maximum budget, use an idempotent ledger, and fail closed when the cost cannot be determined safely."] },
    ],
  },
  {
    slug: "offline-tools-and-wallet-safety",
    title: "Offline tools: keeping your work available and your wallet safe",
    summary: "How offline allowances and later synchronization should protect against double-spending without pretending lost records can be reconstructed.",
    category: "Security & reliability",
    publishedLabel: "Engineering notes",
    readingMinutes: 6,
    sections: [
      { heading: "Offline work needs a bounded allowance", paragraphs: ["When supported, enV can reserve a limited amount of the server-confirmed wallet for eligible offline operations. The device tracks those operations locally and immediately reduces its offline available amount.", "Cloud-dependent jobs cannot run without connectivity unless a supported on-device implementation exists. Operations with unpredictable costs should wait for an online estimate or have a strict, disclosed maximum."] },
      { heading: "Reconnect and reconcile", paragraphs: ["When the connection returns, the device submits durable transaction records. The server checks the allowance, pricing version, expiry, sequence, unique transaction IDs, and fixed-price tool registry before accepting records at most once.", "A device signature proves that a key signed a message; it does not prove the journal contains every operation. enV therefore must not release unused reserved tokens solely because the client signs a final checkpoint. A separate integrity verifier is required before final settlement."] },
      { heading: "What if local storage is cleared?", paragraphs: ["If unsynchronized records are deleted, the server cannot know the exact usage from those records alone. The safe response is to keep the unresolved reservation and offer a clear recovery process—not to automatically refund the allowance or invent a usage total.", "This reduces double-spending risk but can temporarily lock funds. Exact usage cannot be reconstructed after the evidence is destroyed. In the current implementation, final settlement remains blocked pending a verified native integrity/journal-completeness proof, and all offline token deductions are disabled in production."] },
    ],
  },
  {
    slug: "designing-tools-that-feel-simple",
    title: "Building a large toolkit without making it feel complicated",
    summary: "A look at enV's goal: fast one-shot utilities, consistent interfaces, and deeper studios when a task needs more power.",
    category: "Product & design",
    publishedLabel: "Design principles",
    readingMinutes: 3,
    sections: [
      { heading: "Fast for simple tasks", paragraphs: ["A broad catalogue is only useful if people can find the right tool quickly. Common actions should be obvious, results should be easy to copy or export, and explanations should appear when they help—not as walls of text before the task begins."] },
      { heading: "Depth when it matters", paragraphs: ["Some jobs need a complete studio with presets, detailed controls, history, and recovery. The interface should grow with the task rather than forcing every user into the most complicated workflow."] },
      { heading: "Accessibility is a baseline", paragraphs: ["Keyboard navigation, readable contrast, reduced-motion support, clear errors, and touch-friendly layouts should be built into the system rather than treated as last-minute polish."] },
    ],
  },
];

export function getBlogArticle(slug: string): BlogArticle | undefined {
  return BLOG_ARTICLES.find((article) => article.slug === slug);
}
