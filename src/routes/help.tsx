import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
  ArrowRight,
  BookOpen,
  CircleHelp,
  Coins,
  CreditCard,
  LifeBuoy,
  LockKeyhole,
  Search,
  ShieldCheck,
  UserRound,
  WifiOff,
  Wrench,
  X,
} from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";

export const Route = createFileRoute("/help")({ component: HelpCenter });

const topics = [
  {
    id: "getting-started",
    icon: BookOpen,
    title: "Getting started",
    description: "Learn your way around enV and choose the right place to begin.",
    items: [
      {
        question: "What is enV?",
        answer:
          "enV is a toolkit browser designed to help you discover and use practical tools, utilities, and focused workspaces from one place. Depending on the tool, you may be able to calculate, convert, format, inspect, create, or prepare content without moving between several separate websites.",
      },
      {
        question: "How do I find the right tool?",
        answer:
          "Open the Tools catalogue to browse by category, or search using the task you want to complete rather than only a technical tool name. Open a result to read its description, review its inputs, and check any file, network, or processing requirements before you begin.",
      },
      {
        question: "How do I use a tool?",
        answer:
          "Choose a tool, provide the requested input, and review the available options before running it. Check the result before copying, downloading, or using it elsewhere. Complex tasks and tools that process files or contact a remote service may need additional time or permissions.",
      },
      {
        question: "Do I need an enV account?",
        answer:
          "Many tools are available without signing in. Features tied to an account, wallet, or cross-device access may require authentication. When a feature needs an account, enV should explain that requirement before you proceed; never create an account or share credentials on a third-party page claiming to represent enV.",
      },
      {
        question: "Where can I learn more than a quick answer?",
        answer:
          "Use the Blog & Guides section for longer walkthroughs and practical examples, and the Token Guide for explanations of the proposed usage-accounting model. A guide explains a workflow; the individual tool page remains the best place to check that tool's current inputs and limitations.",
      },
      {
        question: "Does every tool work offline?",
        answer:
          "No. Some tools can process inputs directly on your device, while other tools rely on a network connection, enV services, or an external provider. Offline availability depends on the particular tool and whether its required app code and assets are already available. Read the notice shown on the tool page instead of assuming that all tools are local or offline-capable.",
      },
    ],
  },
  {
    id: "tools-and-results",
    icon: Wrench,
    title: "Tools and results",
    description: "Understand inputs, output quality, file support, and tool errors.",
    items: [
      {
        question: "Why do two tools give different results?",
        answer:
          "Tools can use different methods, assumptions, formats, or third-party services. Results may also differ because of input values, rounding, file characteristics, selected options, or provider updates. Review the tool's description and settings, and independently verify important results before relying on them.",
      },
      {
        question: "Which file formats can I upload?",
        answer:
          "Supported formats vary by tool. Use the file picker and the accepted-format guidance on that tool's page; do not rename a file extension to make an unsupported file appear compatible. File size limits and processing requirements can also differ between tools.",
      },
      {
        question: "Why did a tool fail or return an empty result?",
        answer:
          "Check that required fields are complete, that the input matches the expected format, and that any file type and size limits are met. If the tool needs a network connection, check your connection and retry once. Where possible, test with a small, non-sensitive example. If the problem continues, contact support with the tool name and a non-sensitive error description.",
      },
      {
        question: "Are AI-generated results guaranteed to be correct?",
        answer:
          "No. AI-assisted outputs can be incomplete, inaccurate, outdated, or unsuitable for your specific context. Treat them as a starting point, review the output, and verify factual, technical, legal, financial, medical, or otherwise consequential information with an appropriate source or qualified professional.",
      },
      {
        question: "Can I use an output for commercial work?",
        answer:
          "That depends on the tool, the source material, any third-party provider terms, and the rights attached to your inputs and outputs. Review enV's Terms and any notices shown by the tool before using results commercially. You are responsible for confirming that you have the necessary rights and permissions.",
      },
      {
        question: "Can I suggest a new tool or report a tool issue?",
        answer:
          "Yes. Contact enV support with the tool name or a brief description of the task, what you expected to happen, and what happened instead. Suggestions are helpful when they explain the problem the tool would solve. Do not include passwords, private keys, confidential files, or other sensitive information in a report.",
      },
    ],
  },
  {
    id: "accounts-and-access",
    icon: UserRound,
    title: "Accounts and access",
    description: "Get help signing in and keeping your account under your control.",
    items: [
      {
        question: "I cannot sign in. What should I check?",
        answer:
          "Confirm that you are using the email address associated with your account and check for typing errors. Verify that your device has a working connection, then follow the password-recovery flow available from the sign-in screen if needed. Only enter credentials on the official enV site, and never share a one-time code or password with anyone offering support.",
      },
      {
        question: "What should I do if I forget my password?",
        answer:
          "Use the password-recovery option on the official sign-in page and follow the instructions sent to your account email. Check your spam or junk folder if the message does not appear. If recovery still fails, contact support from the email address associated with the account when possible, but do not send your password or verification codes.",
      },
      {
        question: "How can I help keep my account secure?",
        answer:
          "Use a unique, strong password and protect access to your email account. Keep your device and browser updated, sign out on shared devices, and avoid sharing verification codes. Be cautious of messages that create urgency or ask you to send credentials, recovery codes, payment information, or wallet details.",
      },
      {
        question: "Can I use enV on more than one device?",
        answer:
          "You can access the public website on supported devices, but account data and feature availability may vary by device and connection. Do not assume that local files, browser storage, unsynchronized work, or an offline allowance will automatically transfer between devices. Confirm that important work has safely synced or been exported before switching devices or clearing data.",
      },
      {
        question: "How do I request account or personal-data help?",
        answer:
          "Contact enV support from the Contact page and explain the request without including passwords, payment-card details, or private documents. Support may need enough information to verify account ownership before discussing account-specific matters. Any request will be handled according to the applicable privacy notice and legal requirements.",
      },
    ],
  },
  {
    id: "tokens-and-wallet",
    icon: Coins,
    title: "Tokens and wallet",
    description: "Understand token terminology, costs, balances, and what is not live yet.",
    items: [
      {
        question: "What is an enV Token?",
        answer:
          "An enV Token is the proposed usage-accounting unit for eligible enV operations. It is not the same as a language-model token, a cryptocurrency, or cash that can automatically be withdrawn. The current reference proposal of 100 tokens to US$1.00 is illustrative only; it is not an active offer, guaranteed exchange rate, or promise of a regional price.",
      },
      {
        question: "How much does a tool cost?",
        answer:
          "The Token Guide and a tool's billing information explain the proposed unit and factors that may affect usage. The amount can depend on the kind of operation, measured inputs, or other explicitly disclosed usage factors. Treat illustrative examples as estimates, not as a final quote. Check the current tool page and pricing information for the latest published status.",
      },
      {
        question: "Will enV deduct tokens automatically?",
        answer:
          "Automatic token deductions are disabled in this release, and live charging is not enabled. Do not treat a displayed example rate or proposed wallet balance as proof that a chargeable transaction has occurred. Before billing is enabled, users should receive clear pricing information and an appropriate confirmation or budget control for chargeable work.",
      },
      {
        question: "Can I buy tokens or make a real-money payment now?",
        answer:
          "Real-money token purchases are disabled in this release. Do not send money to an individual or use an unofficial payment link claiming to add enV tokens. Purchase options, applicable fees, regional prices, and payment terms must be displayed through an official enV flow before purchases are enabled.",
      },
      {
        question: "Do tokens expire, and can they be refunded?",
        answer:
          "The final purchase, expiry, refund, and withdrawal terms must be published before paid tokens are offered. The intended design has been to avoid expiry for purchased tokens, but that is not a finalized contractual policy. Promotional grants may have different disclosed conditions. As purchases are currently disabled, do not rely on draft examples as a promise of future terms.",
      },
      {
        question: "How do referral rewards, bonuses, or tagging rewards work?",
        answer:
          "Reward and referral concepts may appear in product planning or interface designs, but that does not mean a program is active or that a reward has been earned. Rely only on an official, published program page with eligibility rules, calculation details, limits, and terms. Do not pay a third party to unlock a reward or disclose your credentials to claim one.",
      },
      {
        question: "What should I do if my wallet information looks wrong?",
        answer:
          "Check that you are signed in to the intended account and refresh the wallet page once. Do not make repeated payments or rely on a provisional display as proof of a completed transaction. Contact support with the approximate time, the page involved, and a non-sensitive description of what looks incorrect. Never send full card details or account secrets.",
      },
    ],
  },
  {
    id: "offline-and-sync",
    icon: WifiOff,
    title: "Offline work and syncing",
    description: "Know what can remain on your device and how to protect unsynced work.",
    items: [
      {
        question: "What happens when my connection drops?",
        answer:
          "A tool that is already available and designed for local processing may continue to work. Tools that require a server, AI provider, remote content, or network validation may stop or offer reduced functionality. Keep a copy of important results when the tool supports export, and wait for a confirmed save or sync before closing a workflow that depends on remote services.",
      },
      {
        question: "What if I clear storage before syncing?",
        answer:
          "Clearing browser or app storage can permanently remove local records, settings, cached assets, and work that has not synchronized. The server cannot reliably reconstruct information that never reached it, so clearing storage must not be treated as a way to cancel or prove the absence of usage. enV's offline token deductions are disabled in this release. Before clearing site data, export important work if possible and confirm that any sync indicator shows completion.",
      },
      {
        question: "Can I spend wallet tokens while offline?",
        answer:
          "Offline token deductions are disabled in this release. The proposed offline-wallet design requires bounded server-issued allowances and independent verification of the final usage journal before a charge could be finalized. A local record or client-reported checkpoint alone is not sufficient to authorize a final deduction.",
      },
      {
        question: "Will my offline work automatically appear on every device?",
        answer:
          "Not necessarily. Browser or device storage is local unless a specific feature provides confirmed synchronization. Before changing devices, reinstalling, signing out, or clearing data, export work where possible and confirm any available sync state. Avoid assuming that an offline allowance or unsynchronized record can be recovered from another device.",
      },
      {
        question: "What if syncing appears stuck?",
        answer:
          "Restore a stable connection and give the relevant page a chance to retry. Avoid clearing storage, uninstalling the app, or repeatedly resetting the workflow while local records may still be needed. If the problem persists, contact support with the tool or page name, approximate time, device/browser, and any non-sensitive error message.",
      },
    ],
  },
  {
    id: "privacy-and-security",
    icon: ShieldCheck,
    title: "Privacy and security",
    description: "Learn how to make informed choices about inputs, data, and suspicious activity.",
    items: [
      {
        question: "Are my files uploaded to a server?",
        answer:
          "It depends on the tool. A local-first tool may process an input on your device, while a cloud-dependent tool may send the necessary data to enV infrastructure or an external service. Review the tool-specific notice and the Privacy page before submitting anything confidential. If the destination or processing path is unclear, do not upload sensitive material until you have confirmed how it will be handled.",
      },
      {
        question: "What does local-first mean?",
        answer:
          "Local-first describes a design that prefers on-device processing where practical; it does not mean every feature is offline, that no telemetry exists, or that no data is ever sent to a server. Processing depends on the individual tool and its dependencies. The relevant tool notice and privacy disclosures should take precedence over broad descriptions.",
      },
      {
        question: "How does enV prevent fraud?",
        answer:
          "The billing design relies on server-authoritative balances, bounded reservations, idempotent transaction handling, appropriate rate limits, replay detection, and server-side billing profiles. Offline finalization is blocked until independent journal-integrity verification is available, and purchase callbacks or promotional grants must remain disabled until their checks are implemented. These controls reduce risk but cannot guarantee that every fraudulent attempt will be prevented.",
      },
      {
        question: "What information should I never send to support?",
        answer:
          "Never send passwords, one-time codes, private keys, recovery codes, full payment-card numbers, security answers, or confidential file contents through ordinary email or public messages. Support usually needs the page or tool name, the approximate time, device/browser details, and a description or screenshot with personal information removed.",
      },
      {
        question: "What should I do about a suspicious message or payment request?",
        answer:
          "Do not click unfamiliar payment links, share a verification code, or send money to an individual. Verify the request through the official enV site and contact support using the Contact page. If you have shared a password, change it through the official site and secure the associated email account; contact your payment provider if payment information may have been exposed.",
      },
      {
        question: "Can I control what information I submit?",
        answer:
          "Yes. Choose a tool appropriate for the sensitivity of the task, submit only the minimum information needed, and avoid uploading material you are not authorized to share. When a tool offers local processing or a way to use sample data, consider that option. Review the Privacy page and any tool-specific notice before proceeding.",
      },
    ],
  },
  {
    id: "troubleshooting-and-accessibility",
    icon: CircleHelp,
    title: "Troubleshooting and accessibility",
    description: "Try practical checks before reporting an issue, without losing local work.",
    items: [
      {
        question: "A page is blank, slow, or will not finish loading. What should I do?",
        answer:
          "Check your connection, wait briefly, and reload the page once. Make sure your browser is up to date and temporarily test whether a privacy extension or content blocker is preventing a required script from loading. If you have unsynchronized work, avoid clearing site data as an early troubleshooting step. Record the page name and any non-sensitive error text if the issue continues.",
      },
      {
        question: "A download, copy action, or file operation does not work.",
        answer:
          "Check the browser's download permissions and clipboard permissions, and confirm that the output was actually generated. For file operations, verify that the format is supported and try a smaller sample if appropriate. If you use a mobile browser, check its download location and any permission prompt before repeating the operation.",
      },
      {
        question: "How do I report a bug usefully?",
        answer:
          "Tell us what you were trying to do, the tool or page name, the steps that led to the issue, what you expected, and what happened instead. Include your device and browser and any non-sensitive error message. A screenshot can help, but remove email addresses, private data, payment details, and confidential content before sending it.",
      },
      {
        question: "Does enV support keyboard navigation and assistive technology?",
        answer:
          "The interface should use semantic controls and visible focus states so that common tasks can be navigated with a keyboard and read by assistive technology. Support varies by individual tool and browser. If a control is difficult to reach, label the page and control, describe the barrier, and contact support so the issue can be investigated.",
      },
      {
        question: "Why does the mobile layout or a control look different?",
        answer:
          "Some controls adapt to available screen size, touch input, or browser capabilities. Try a current browser and a normal page zoom setting first. If a button overlaps text, a menu cannot be reached, or a task becomes impossible on mobile, report the page, device size, and the action you could not complete.",
      },
    ],
  },
  {
    id: "support-and-feedback",
    icon: LifeBuoy,
    title: "Support and feedback",
    description: "Find the right support route and send the details needed to help.",
    items: [
      {
        question: "How do I contact enV support?",
        answer:
          "Open the Contact page and use the enV product support contact for help with tools, bugs, accessibility, account questions, or feedback. For business proposals and company-related matters, use the separate company contact shown there. Using the correct route helps your message reach the right team.",
      },
      {
        question: "What should I include in a support request?",
        answer:
          "Include a clear subject, the page or tool name, the task you attempted, the approximate time and time zone, your device/browser, and any non-sensitive error message. Explain what you expected and what happened instead. Share only the minimum information needed to investigate; never include credentials, complete payment details, or confidential inputs.",
      },
      {
        question: "How quickly will I receive a reply?",
        answer:
          "Response times can vary with message volume, issue complexity, and whether additional details are required. enV does not promise a fixed response time on this page. For an urgent account or payment-security concern, explain the risk clearly in the subject while still avoiding sensitive information.",
      },
      {
        question: "Where can I find official product information?",
        answer:
          "Use the enV website navigation for the Tools catalogue, Token Guide, Pricing, Blog & Guides, Privacy, Terms, and Contact pages. Treat messages from unofficial accounts, copied pages, or third parties as unverified until you confirm the information through an official enV page.",
      },
      {
        question: "Can I give feedback on this Help Center?",
        answer:
          "Yes. Tell us which answer was unclear, what you were trying to find, and what information would have helped. Feedback is especially useful when it identifies an inaccurate instruction, a missing topic, or a product change that the documentation does not yet explain.",
      },
    ],
  },
];

const quickLinks = [
  {
    to: "/tools",
    title: "Explore tools",
    description: "Browse utilities and focused workspaces.",
    icon: Wrench,
  },
  {
    to: "/tokens/guide",
    title: "Token Guide",
    description: "Understand proposed usage and cost factors.",
    icon: Coins,
  },
  {
    to: "/pricing",
    title: "Pricing",
    description: "Review published pricing and billing status.",
    icon: CreditCard,
  },
  {
    to: "/account",
    title: "Account",
    description: "Open account and sign-in options.",
    icon: UserRound,
  },
  {
    to: "/blog",
    title: "Blog & Guides",
    description: "Read practical walkthroughs and explainers.",
    icon: BookOpen,
  },
  {
    to: "/contact",
    title: "Contact support",
    description: "Send product feedback or ask for help.",
    icon: LifeBuoy,
  },
];

function HelpCenter() {
  const [search, setSearch] = useState("");
  const [activeTopic, setActiveTopic] = useState("all");
  const normalizedQuery = search.trim().toLowerCase();

  const filteredTopics = useMemo(
    () =>
      topics
        .filter((topic) => activeTopic === "all" || topic.id === activeTopic)
        .map((topic) => ({
          ...topic,
          items: topic.items.filter((item) => {
            if (!normalizedQuery) return true;
            return (topic.title + " " + item.question + " " + item.answer)
              .toLowerCase()
              .includes(normalizedQuery);
          }),
        }))
        .filter((topic) => topic.items.length > 0),
    [activeTopic, normalizedQuery],
  );

  const resultCount = filteredTopics.reduce((total, topic) => total + topic.items.length, 0);

  function clearSearch() {
    setSearch("");
    setActiveTopic("all");
  }

  return (
    <AppShell>
      <main className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6 sm:py-12 lg:px-8">
        <section className="relative overflow-hidden rounded-3xl border border-border bg-surface-2 px-5 py-8 sm:px-8 sm:py-10 lg:px-10 lg:py-12">
          <div aria-hidden="true" className="pointer-events-none absolute -right-12 -top-16 size-56 rounded-full border-[28px] border-accent/10 sm:-right-8 sm:-top-20 sm:size-72" />
          <div className="relative max-w-3xl">
            <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-border bg-surface px-3 py-1.5 text-xs font-semibold tracking-wide text-muted">
              <CircleHelp size={15} aria-hidden="true" />
              enV HELP CENTER
            </div>
            <h1 className="text-3xl font-semibold tracking-tight text-fg sm:text-4xl lg:text-5xl">
              How can we help you?
            </h1>
            <p className="mt-4 max-w-2xl text-base leading-7 text-muted sm:text-lg">
              Find clear answers about tools, accounts, tokens, offline work, and privacy. Search the
              guide or browse topics to get to the information you need.
            </p>
            <form
              className="mt-7 flex max-w-2xl items-center gap-3 rounded-2xl border border-border bg-surface px-4 py-3 shadow-sm focus-within:border-accent focus-within:ring-2 focus-within:ring-accent/15"
              role="search"
              onSubmit={(event) => {
                event.preventDefault();
                document.getElementById("help-answers")?.scrollIntoView({ behavior: "smooth", block: "start" });
              }}
            >
              <Search size={20} className="shrink-0 text-muted" aria-hidden="true" />
              <label className="sr-only" htmlFor="help-search">
                Search help articles
              </label>
              <input
                id="help-search"
                type="search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search accounts, tools, tokens, privacy..."
                className="min-w-0 flex-1 bg-transparent text-sm text-fg outline-none placeholder:text-muted sm:text-base"
                autoComplete="off"
              />
              {search && (
                <button
                  type="button"
                  onClick={clearSearch}
                  aria-label="Clear search"
                  className="grid size-8 shrink-0 place-items-center rounded-lg text-muted transition hover:bg-surface-2 hover:text-fg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                >
                  <X size={16} aria-hidden="true" />
                </button>
              )}
              <button
                type="submit"
                className="hidden min-h-10 shrink-0 items-center gap-2 rounded-xl bg-accent px-4 text-sm font-semibold text-white transition hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent sm:inline-flex"
              >
                Search
              </button>
            </form>
            <p className="mt-3 text-xs leading-5 text-muted">
              Search updates results as you type. No question is sent to an external service.
            </p>
          </div>
        </section>

        <section className="mt-8" aria-labelledby="popular-topics-heading">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 id="popular-topics-heading" className="text-xl font-semibold text-fg">
                Browse popular topics
              </h2>
              <p className="mt-1 text-sm leading-6 text-muted">Start with the area closest to your question.</p>
            </div>
            {(search || activeTopic !== "all") && (
              <button
                type="button"
                onClick={clearSearch}
                className="text-sm font-semibold text-accent underline-offset-4 hover:underline"
              >
                Clear filters
              </button>
            )}
          </div>
          <div className="mt-4 flex gap-2 overflow-x-auto pb-2">
            <button
              type="button"
              onClick={() => setActiveTopic("all")}
              aria-pressed={activeTopic === "all"}
              className={
                "min-h-10 shrink-0 rounded-full border px-4 text-sm font-medium transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent " +
                (activeTopic === "all"
                  ? "border-accent bg-accent text-white"
                  : "border-border bg-surface text-muted hover:bg-surface-2 hover:text-fg")
              }
            >
              All topics
            </button>
            {topics.map((topic) => (
              <button
                type="button"
                key={topic.id}
                onClick={() => setActiveTopic(topic.id)}
                aria-pressed={activeTopic === topic.id}
                className={
                  "min-h-10 shrink-0 rounded-full border px-4 text-sm font-medium transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent " +
                  (activeTopic === topic.id
                    ? "border-accent bg-accent text-white"
                    : "border-border bg-surface text-muted hover:bg-surface-2 hover:text-fg")
                }
              >
                {topic.title}
              </button>
            ))}
          </div>
        </section>

        <section className="mt-8" aria-labelledby="quick-links-heading">
          <div className="mb-4">
            <h2 id="quick-links-heading" className="text-xl font-semibold text-fg">
              Quick links
            </h2>
            <p className="mt-1 text-sm leading-6 text-muted">
              Go straight to the enV page that can help you move forward.
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {quickLinks.map((item) => {
              const Icon = item.icon;
              return (
                <Link
                  key={item.to}
                  to={item.to}
                  className="group flex min-h-[104px] items-start gap-3 rounded-2xl border border-border bg-surface p-4 transition hover:border-accent/50 hover:bg-surface-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                >
                  <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-surface-2 text-fg">
                    <Icon size={19} aria-hidden="true" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center justify-between gap-2 font-semibold text-fg">
                      {item.title}
                      <ArrowRight
                        size={15}
                        aria-hidden="true"
                        className="shrink-0 text-muted transition group-hover:translate-x-0.5 group-hover:text-accent"
                      />
                    </span>
                    <span className="mt-1 block text-sm leading-5 text-muted">{item.description}</span>
                  </span>
                </Link>
              );
            })}
          </div>
        </section>

        <section id="help-answers" className="mt-10 scroll-mt-24" aria-labelledby="help-answers-heading">
          <div className="flex flex-col gap-2 border-b border-border pb-5 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-accent">Help articles</p>
              <h2 id="help-answers-heading" className="mt-2 text-2xl font-semibold tracking-tight text-fg">
                Browse answers
              </h2>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-muted">
                Practical guidance written around current product behavior, with planned features clearly
                distinguished from features that are available today.
              </p>
            </div>
            <p className="text-sm text-muted" aria-live="polite" aria-atomic="true">
              {resultCount} {resultCount === 1 ? "answer" : "answers"} found
            </p>
          </div>

          {filteredTopics.length > 0 ? (
            <div className="mt-5 space-y-4">
              {filteredTopics.map((topic) => {
                const Icon = topic.icon;
                return (
                  <section
                    id={topic.id}
                    key={topic.id}
                    aria-labelledby={topic.id + "-heading"}
                    className="scroll-mt-24 rounded-2xl border border-border bg-surface p-5 sm:p-6"
                  >
                    <div className="flex items-start gap-3">
                      <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-surface-2 text-fg">
                        <Icon size={20} aria-hidden="true" />
                      </span>
                      <div className="min-w-0">
                        <h3 id={topic.id + "-heading"} className="text-lg font-semibold text-fg">
                          {topic.title}
                        </h3>
                        <p className="mt-1 text-sm leading-6 text-muted">{topic.description}</p>
                      </div>
                    </div>
                    <div className="mt-4 divide-y divide-border border-t border-border">
                      {topic.items.map((item) => (
                        <details
                          key={item.question}
                          className="group py-4 last:pb-0"
                          open={Boolean(normalizedQuery)}
                        >
                          <summary className="flex cursor-pointer list-none items-start justify-between gap-4 py-1 font-medium leading-6 text-fg marker:hidden focus-visible:rounded focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent [&::-webkit-details-marker]:hidden">
                            <span>{item.question}</span>
                            <span
                              aria-hidden="true"
                              className="mt-0.5 grid size-6 shrink-0 place-items-center rounded-full border border-border text-muted transition group-open:rotate-45 group-open:bg-surface-2"
                            >
                              <span className="text-lg leading-none">+</span>
                            </span>
                          </summary>
                          <p className="max-w-4xl pb-1 pt-3 text-sm leading-7 text-muted">{item.answer}</p>
                        </details>
                      ))}
                    </div>
                  </section>
                );
              })}
            </div>
          ) : (
            <div className="mt-5 rounded-2xl border border-dashed border-border bg-surface p-8 text-center sm:p-12">
              <span className="mx-auto grid size-12 place-items-center rounded-2xl bg-surface-2 text-muted">
                <Search size={21} aria-hidden="true" />
              </span>
              <h3 className="mt-4 text-lg font-semibold text-fg">No matching answers</h3>
              <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-muted">
                Try a shorter search term or browse all topics. You can also contact support if the answer
                you need is not covered here.
              </p>
              <div className="mt-5 flex flex-wrap justify-center gap-3">
                <button
                  type="button"
                  onClick={clearSearch}
                  className="min-h-11 rounded-xl border border-border px-4 text-sm font-semibold text-fg transition hover:bg-surface-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                >
                  Browse all answers
                </button>
                <Link
                  to="/contact"
                  className="inline-flex min-h-11 items-center rounded-xl bg-accent px-4 text-sm font-semibold text-white transition hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                >
                  Contact support
                </Link>
              </div>
            </div>
          )}
        </section>

        <section className="mt-10 rounded-2xl border border-border bg-surface-2 p-5 sm:p-7">
          <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3">
              <span className="grid size-11 shrink-0 place-items-center rounded-xl border border-border bg-surface text-fg">
                <LifeBuoy size={21} aria-hidden="true" />
              </span>
              <div>
                <h2 className="text-lg font-semibold text-fg">Still need a hand?</h2>
                <p className="mt-2 max-w-2xl text-sm leading-6 text-muted">
                  Contact the enV team for product support, bug reports, account questions, or accessibility
                  feedback. Please leave passwords, verification codes, and payment secrets out of your message.
                </p>
              </div>
            </div>
            <Link
              to="/contact"
              className="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-xl bg-accent px-4 py-2.5 text-sm font-semibold text-white transition hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
            >
              Contact enV support
              <ArrowRight size={16} aria-hidden="true" />
            </Link>
          </div>
        </section>
      </main>
    </AppShell>
  );
}
