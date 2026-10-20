export type BlogArticle = {
  slug: string;
  title: string;
  summary: string;
  category: string;
  publishedLabel: string;
  sections: { heading: string; paragraphs: string[]; bullets?: string[] }[];
};

export const BLOG_ARTICLES: BlogArticle[] = [
  {
    slug: "a-more-private-way-to-use-online-tools",
    title: "A privacy-first approach to everyday online tools",
    summary: "How enV aims to make processing choices clear, favor on-device work where practical, and set accurate expectations when a feature depends on a server or external provider.",
    category: "Privacy & trust",
    publishedLabel: "Privacy & product principles",
    sections: [
      {
        heading: "Privacy begins with a clear processing path",
        paragraphs: [
          "People should understand how a tool handles their input before they submit it. When a task can run entirely in the browser, local processing can reduce unnecessary data transfer and keep the work on the device.",
          "Not every workflow can run locally. Features that rely on a server, an AI provider, or a remote media processor need a different disclosure. The interface should identify the dependency, explain the relevant data flow, and point to the applicable privacy information.",
        ],
      },
      {
        heading: "Choose the right tool for the information",
        paragraphs: [
          "The right processing choice depends on both the task and the sensitivity of the material. A public sample is different from a customer export, a private document, or a production credential. Convenience should not replace that judgment.",
        ],
        bullets: [
          "Prefer an on-device option when it meets the task's requirements.",
          "Review the tool's current processing notice before submitting a file or text.",
          "Provide only the information needed to produce the result.",
          "Avoid entering passwords, private keys, payment details, or confidential records unless the tool is explicitly designed and approved for that use.",
        ],
      },
      {
        heading: "Product claims must match the implementation",
        paragraphs: [
          "Privacy is more than a reassuring label. It depends on what the software actually does, which services it calls, and what information those services receive. Local-first design is useful where it is technically appropriate, but it should never be used to imply that every feature runs offline.",
          "enV's standard should be straightforward: explain the processing path accurately, keep disclosures close to the relevant action, and update the wording when the implementation changes. Clear limits help people make informed decisions.",
        ],
      },
    ],
  },
  {
    slug: "how-env-tokens-are-designed-to-work",
    title: "Understanding enV tokens, estimates, and charges",
    summary: "An accessible overview of fractional accounting, task-based costs, and the safeguards needed before token pricing can be treated as a live quote.",
    category: "Tokens & billing",
    publishedLabel: "Token guide",
    sections: [
      {
        heading: "One wallet, precise accounting",
        paragraphs: [
          "The enV token design uses a shared accounting model across supported platforms. Internally, a visible token can be represented as 1,000 integer milli-token units. Integer subunits make small amounts easier to record consistently without relying on floating-point arithmetic.",
          "A reference example of 100 tokens to US$1.00 has been used to explain the arithmetic. It is a design reference, not a guaranteed exchange rate, a promise of redemption, or a statement of local-currency pricing. Any live price must be confirmed by the applicable billing interface.",
        ],
      },
      {
        heading: "The cost depends on the work",
        paragraphs: [
          "A local calculation, a large video conversion, a cloud OCR request, and an AI workflow can have very different operating costs. A reliable estimate must reflect the actual operation rather than assigning a price solely because two tools appear in the same catalogue.",
          "Before a production quote is displayed, the calculation should account for relevant input size, provider pricing, retries, infrastructure, and the limits of the service. When a cost cannot be determined reliably, the interface should say so instead of presenting a false level of precision.",
        ],
      },
      {
        heading: "Charging requires clear safeguards",
        paragraphs: [
          "A user should see the expected charge—or a meaningful maximum—before approving a billable operation. Transactions must be recorded in a server-controlled ledger, and retries must not create duplicate charges. Errors and interrupted requests must leave the account in a consistent, explainable state.",
          "Token amounts, purchase availability, and automatic deductions should only be described as live capabilities when the corresponding billing and settlement paths are enabled and verified. Documentation and interface copy must reflect the actual release, not a planned design.",
        ],
      },
    ],
  },
  {
    slug: "offline-tools-and-wallet-safety",
    title: "Designing offline workflows that protect wallet integrity",
    summary: "How bounded offline allowances, duplicate-resistant synchronization, and honest recovery behavior can reduce financial risk when a device reconnects.",
    category: "Security & reliability",
    publishedLabel: "Engineering notes",
    sections: [
      {
        heading: "Offline access needs a clear limit",
        paragraphs: [
          "Offline token use should be available only for operations that are explicitly supported. A server-confirmed allowance can reserve a defined amount for eligible work, while the device tracks local transactions and reduces the remaining allowance as each operation is recorded.",
          "An allowance is not a promise that every tool works without a connection. Cloud-dependent jobs still need a working service unless an equivalent on-device implementation exists. Operations with unpredictable costs should require an online quote or an explicit maximum.",
        ],
      },
      {
        heading: "Synchronize records without double-counting",
        paragraphs: [
          "When the device reconnects, it should submit durable transaction records for server-side validation. The server needs to check the allowance, pricing version, expiry, sequence, transaction identifiers, and allowed tool registry before accepting each record once.",
          "A digital signature can show that a key signed a message, but it does not prove that a local journal contains every transaction. Unused funds should not be released simply because a device signs a final checkpoint; settlement requires a trustworthy check that the record set is complete.",
        ],
      },
      {
        heading: "Recovery must reflect the evidence available",
        paragraphs: [
          "If unsynchronized local records are deleted, the server cannot infer exact usage from records it never received. Automatically refunding the full allowance would risk ignoring operations that occurred, while inventing an exact usage total would be equally unsafe.",
          "The responsible recovery path is to keep the unresolved reservation visible and provide a defined support or verification process. That may temporarily make the amount unavailable, but it is more transparent than promising a refund the available evidence cannot justify. Offline deductions and final settlement should remain disabled until the required integrity checks have been implemented and verified end to end.",
        ],
      },
    ],
  },
  {
    slug: "designing-tools-that-feel-simple",
    title: "A large toolkit with a simpler user experience",
    summary: "How consistent navigation, focused one-step utilities, and deeper workspaces can help enV serve a broad range of tasks without overwhelming people.",
    category: "Product & design",
    publishedLabel: "Design principles",
    sections: [
      {
        heading: "Help people start with the task",
        paragraphs: [
          "A broad catalogue is useful only when people can find the right tool without guessing. Search should recognize familiar names and practical goals, while categories and status labels should help people narrow the choices. Each listing should explain the tool's purpose in language people can act on.",
          "For common jobs, the first useful action should be obvious. Keep required inputs visible, explain constraints before they cause errors, and make completed results easy to review, copy, or export.",
        ],
      },
      {
        heading: "Let complex workflows grow naturally",
        paragraphs: [
          "Some tasks are best handled in a single focused screen. Others need presets, detailed controls, revision history, and recovery options. The interface should expose the simplest useful path first, then make advanced capabilities available when the task calls for them.",
          "Consistent labels, spacing, and feedback reduce the effort of learning each new tool. Shared patterns should make the toolkit feel coherent without forcing different kinds of work into an identical workflow.",
        ],
      },
      {
        heading: "Accessibility is part of the experience",
        paragraphs: [
          "Keyboard navigation, readable contrast, reduced-motion support, clear error messages, and touch-friendly controls should be considered from the beginning. A control is not truly simple if people cannot discover it, operate it, or understand its state.",
          "The quality bar is practical: test common journeys on small and large screens, verify visible focus and useful labels, and check that errors explain how to recover. A consistent interface should make the next step clearer for as many people as possible.",
        ],
      },
    ],
  },
];

export function getBlogArticle(slug: string): BlogArticle | undefined {
  return BLOG_ARTICLES.find((article) => article.slug === slug);
}
