import { createFileRoute, Link } from "@tanstack/react-router";
import { BookOpen, CircleHelp, Coins, LockKeyhole, WifiOff } from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";

export const Route = createFileRoute("/help")({ component: HelpCenter });

const topics = [
  { id: "getting-started", icon: BookOpen, title: "Getting started", items: [
    ["How do I find a tool?", "Use Search tools or browse the tool catalogue by category. Tool pages are designed to put the primary action and result first, with more detailed controls where a task needs them."],
    ["Do I need an account?", "Many local tools are designed to work without an account. Account-dependent features, cross-device wallet access, and future purchase workflows may require sign-in once securely configured."],
    ["Does every tool work offline?", "No. A tool that runs entirely on your device may work offline after the app and required assets are available. Cloud, AI-provider, remote media, and other server-dependent features need connectivity unless a documented on-device alternative exists."],
  ] },
  { id: "tokens", icon: Coins, title: "Tokens and costs", items: [
    ["What is an enV Token?", "It is a proposed prepaid usage-accounting unit for eligible enV operations—not an AI model token and not cash that can be withdrawn. The current reference proposal is 100 tokens to US$1.00, not an active offer or guaranteed regional price."],
    ["How much does a tool cost?", "Each tool's token page explains its provisional billing category, unit, and the information required to price it. Lightweight example rates remain hypotheses. Cloud and AI work must use measured inputs and defensible costs. Live charging is disabled in this release."],
    ["Will enV charge me without warning?", "Automatic token deductions and real-money purchases are disabled in this release. Before launch, chargeable work should present a clear estimate or maximum budget and use server-authoritative accounting."],
    ["Do tokens expire?", "The intended policy is for purchased tokens not to expire, subject to applicable law and platform rules. Final terms must be published before purchases are enabled. Promotional grants may have separate, clearly disclosed rules."],
  ] },
  { id: "offline", icon: WifiOff, title: "Offline work and sync", items: [
    ["What happens to offline usage?", "The planned flow reserves a bounded allowance before disconnection and synchronizes locally recorded operations later. The current code is still gated: offline token deductions are disabled in production, and a client-signed final checkpoint is not enough to prove that no records were omitted."],
    ["What if I clear storage before syncing?", "If unsynchronized records are destroyed, the server cannot reconstruct the exact usage. The allowance stays unresolved rather than being treated as unused. The current release keeps offline token charging disabled; before launch, enV needs a verified finalization process, clear recovery rules, and tests for cache clearing and reinstall."],
    ["Can I use the same offline allowance on multiple devices?", "Each device needs its own server-issued, bounded reservation from the same wallet. The same funds cannot be reserved twice. Synchronization is required before issuing more allowance when limits are reached."],
  ] },
  { id: "privacy-security", icon: LockKeyhole, title: "Privacy and account security", items: [
    ["Are my files uploaded?", "It depends on the tool. Local-first tools are designed to process data on-device. Cloud-dependent tools may send the necessary input to enV servers or an external provider; check the tool notice and Privacy page before use."],
    ["How does enV prevent fraud?", "The design uses server-authoritative balances, bounded reservations, idempotency, request/account/device rate limits, replay detection, fixed-price server lookups, and metadata-only security events. Offline finalization is deliberately blocked until independent journal-integrity verification is available. Purchase callbacks and promotional grants remain disabled until their provider checks are implemented. Shared IP addresses alone are not proof of abuse."],
    ["What should I send to support?", "Describe the tool, platform, approximate time, and any non-sensitive error code. Never email passwords, private keys, full payment-card details, or confidential file contents."],
  ] },
];

function HelpCenter() {
  return (
    <AppShell>
      <main className="mx-auto max-w-5xl px-4 py-8 sm:px-6 sm:py-12">
        <header className="max-w-3xl"><div className="mb-3 inline-flex items-center gap-2 rounded-full border border-border bg-surface-2 px-3 py-1 text-xs font-medium text-muted"><CircleHelp size={14} aria-hidden="true" /> enV Help Center</div><h1 className="text-3xl font-semibold tracking-tight text-fg sm:text-4xl">Answers, guides, and support</h1><p className="mt-4 text-base leading-7 text-muted">Straightforward answers about using enV, token accounting, offline behavior, privacy, and security.</p></header>
        <nav aria-label="Help topics" className="mt-6 flex flex-wrap gap-2">{topics.map((topic) => <a key={topic.id} href={`#${topic.id}`} className="rounded-full border border-border px-3 py-2 text-sm text-muted hover:bg-surface-2 hover:text-fg">{topic.title}</a>)}</nav>
        <div className="mt-8 space-y-5">{topics.map((topic) => { const Icon = topic.icon; return <section id={topic.id} key={topic.id} className="scroll-mt-24 rounded-2xl border border-border p-5 sm:p-6"><div className="flex items-center gap-3"><span className="grid size-10 place-items-center rounded-xl bg-surface-2 text-fg"><Icon size={20} aria-hidden="true" /></span><h2 className="text-xl font-semibold text-fg">{topic.title}</h2></div><div className="mt-4 divide-y divide-border">{topic.items.map(([question, answer]) => <details key={question} className="group py-4 first:pt-0 last:pb-0"><summary className="cursor-pointer list-none pr-6 font-medium text-fg marker:hidden after:float-right after:-mr-6 after:text-muted after:content-['+'] group-open:after:content-['−']">{question}</summary><p className="mt-3 max-w-3xl text-sm leading-6 text-muted">{answer}</p></details>)}</div></section>; })}</div>
        <section className="mt-8 rounded-2xl border border-border bg-surface-2 p-5 sm:p-6"><h2 className="font-semibold text-fg">Still need help?</h2><p className="mt-2 text-sm leading-6 text-muted">Our team can help with a specific tool, accessibility feedback, account questions, or a suspected security issue.</p><Link to="/contact" className="mt-4 inline-flex rounded-lg bg-accent px-4 py-2.5 text-sm font-semibold text-white hover:opacity-90">Contact enV support</Link></section>
      </main>
    </AppShell>
  );
}
