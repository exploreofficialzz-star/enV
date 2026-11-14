# Celebrations category — competitive benchmark and acceptance record

**Research refreshed:** 14 November 2026  
**Scope:** all 93 current Celebrations catalog IDs, across 12 occasion families. No adjacent category is included.

## Competitive benchmark

| Product | Verified strengths | Verified constraints and opportunities for enV |
|---|---|---|
| Partiful | Shareable event pages; guests can receive a link by text or email; host controls include RSVP on/off, approval, capacity and waitlists, +1s, questionnaires, public/private and password settings, guest-list visibility, photo uploads, ticketing, payments, check-in staff and auto-reminders | A managed event platform, not just an export tool. Some controls are app-only: the RSVP-deadline guide says that setting is currently available in the app. Its automatic reminder schedule is host/event-service behavior, not something a downloaded file can reproduce. The product must not imply static exports provide these features. |
| Apple Invites | Hosts can create and manage events, customize background, description, date/time and location, invite guests, approve or deny RSVP requests, and collaborate on shared albums/playlists. Guests can use the web link with or without an Apple Account. | Hosting requires iCloud+. Guests without an Apple Account can RSVP but cannot add items to the shared album or playlist; collaborative playlists also have Apple Music subscription/profile conditions. Feature availability can vary by region. |
| Paperless Post | Designed cards/flyers; direct sends through its service support delivery/open/RSVP tracking and host tracking pages. Hosts can instead share a link through their own text, email or social channels. | A shareable link does not track sends or opens; guests appear on the tracking page after they RSVP. The share-link price follows the design's paid elements and may require Coins. Direct-sending tracking and share-link distribution are separate workflows. |
| Canva Invitations | Large customizable template library; photos, graphics, animation and icons; shareable online invitations and one-page websites; optional printed cards, proofing and multiple paper/finish choices. | Strong design and print focus. Brand Kit and Magic Switch are Pro features. Print availability, price and shipping depend on country, quantity and selected stock/finish. |
| Greetings Island | Large card and invitation selection with customization, photo/text personalization and downloadable designs; the current Trustpilot snapshot remains strongly positive overall. | Recent Trustpilot summaries praise template choice and personalization but also mention watermarks remaining on downloads or features perceived as unexpectedly restricted. Treat review-site material as self-selected feedback, not representative measurement. |
| Evite / other managed invitation products | Relevant benchmark class for hosted invitations, guest lists, RSVP and reminders | Do not infer current limitations from anecdotes alone. The current scope is local creation/export; hosted delivery and RSVP tracking need separate product and privacy design. |

## User feedback translated into testable requirements

- **Keep the action obvious.** In an October 2026 wedding-planning guest discussion, several participants preferred text links because email invitations can be missed or forgotten, while others preferred email for its ability to be marked important. A Paperless Post discussion described the ambiguity of a “View the card” action when the guest expected an invitation/RSVP action. Exported enV pages must use clear event language, visible date/time/location, an explicit user-supplied reply link or contact, and an RSVP deadline when provided.
- **Make the page revisitable.** Community feedback highlights the inconvenience of losing an invitation URL and needing the host to resend it. enV exports are standalone files the user can store or share again; they are not a hosted permanent event URL.
- **Do not overstate guest tracking.** Partiful and Apple Invites provide host-side guest/RSVP management; Paperless Post tracks sending/delivery/open/RSVP for its managed sends, with stated shareable-link limitations. enV must never display “sent”, “delivered”, “opened”, “attending”, or “RSVP received” unless a separately implemented provider service can prove that event.
- **Be explicit about link permissions.** A user-supplied RSVP link is a link to an external destination. It is not an enV RSVP form, guest list, waitlist, approval gate, or secure invite token.
- **Avoid confusing cost boundaries.** Paperless Post documents that share links for paid designs follow the price of their paid elements and can require Coins; Canva identifies Pro-only Brand Kit/Magic Switch features and country-dependent print pricing. enV local exports must not unexpectedly add a watermark or claim an external delivery/print service is included.
- **Make small-screen use reliable.** Responsive exported HTML, legible typography, keyboard-operable reveal/quiz controls, visible focus, semantic landmarks and reduced-motion handling are required.
- **Keep date semantics correct.** Store/interpret local wall time using an explicit IANA zone. Reject daylight-saving gaps and repeated wall times rather than silently shifting the event.
- **Preserve the offline privacy boundary.** User copy, invitation details, memories and photos are prepared locally. Do not send them to a backend as an incidental side effect.

## enV implementation contract

All 93 current catalog IDs remain active and have an exact ID-to-operation mapping in Web, Kotlin and Swift. The three mathematically possible but uncatalogued combinations stay rejected; a generic parser must not accidentally expose additional tools.

| Experience | Implemented behavior | Acceptance boundary |
|---|---|---|
| Page Generator | Occasion page, message, host/person, date/time, location and programme | Export must include the supplied event details and be independently viewable |
| Interactive Card | Personal message with one-action reveal | Reveal control is keyboard operable and works in the exported page |
| Invitation Generator | Event details, dress code, RSVP deadline, external RSVP URL or reply contact | Only http/https RSVP URLs may become clickable links; page states that enV does not collect replies |
| Countdown | Live countdown using an explicit IANA timezone | Past events become complete; DST gaps/repeats and invalid zones are rejected |
| Memory Page | Personal notes plus up to eight validated local photos | Reject unsupported formats and enforce per-photo/aggregate size limits; no upload occurs |
| Reveal Page | One-action message reveal | Main details remain readable without relying on animation |
| Quiz Generator | Two-to-six choices, required correct answer and local feedback | Answer must match a listed option; exported markup escapes user text |
| Surprise Page | One-action surprise reveal | No remote content, external account or hidden tracking |

Twelve occasion families use validated, occasion-specific labels and default copy. A shared validation/rendering contract is acceptable; the exact catalog IDs, native entry points and per-experience behavior must remain distinct and testable.

## Product gaps versus hosted leaders

This PR deliberately does **not** claim parity with hosted event products for:
- delivery of email/SMS/WhatsApp invitations or delivery/open telemetry;
- hosted event URLs, guest accounts, RSVP collection, approvals, capacity, waitlists or +1 management;
- automated reminders, text blasts, ticket sales, check-in or payment collection;
- collaborative/live shared albums or playlists;
- cross-device synchronized drafts or long-term hosted guest data.

Those are separate product capabilities with provider integrations, consent, abuse controls, retention/deletion rules, delivery-status semantics and a secure host/guest data model. Do not simulate them locally or imply that a downloadable HTML file is a live event service.

## Release gates and regression evidence

1. All 93 current catalog IDs remain active, exact-match routed and account-free for local execution.
2. Web, Kotlin and Swift reject the three uncatalogued combinations and unrelated tool IDs.
3. Local event-time parsing validates the IANA zone and rejects DST gaps/repetitions.
4. Exported user text is HTML-escaped; active RSVP URL schemes are rejected.
5. Quiz answer keys and choice counts are validated; photo formats/count/size limits are enforced.
6. Mobile layouts, keyboard focus, reduced-motion preference and the guest-response disclaimer are checked.
7. Full platform builds, native unit tests and simulator/emulator execution tests pass before merge.

## Sources checked 14 November 2026

- Partiful — [Event Settings](https://help.partiful.com/en-us/articles/15525301-what-features-are-available-to-change-in-my-event-settings) (updated 29 September 2026; guest approval, RSVP toggles, +1s, privacy, questionnaires, photo albums, tickets, check-in and reminders).
- Partiful — [RSVP types and controls](https://help.partiful.com/en-us/articles/15525368-how-do-i-modify-the-types-of-rsvps-that-are-allowed) (updated 14 August 2026; capacity, waitlist, +1 and invite controls).
- Partiful — [RSVP deadlines](https://help.partiful.com/en-us/articles/15525321-how-can-i-set-a-deadline-for-my-guests-to-rsvp-by) (deadline feature is currently app-only).
- Partiful — [Automatic reminders](https://help.partiful.com/en-us/articles/15525432-if-i-have-an-rsvp-deadline-on-my-event-when-do-guests-get-reminders) (published reminder timing and host-managed reminders).
- Apple — [Introduction to Apple Invites](https://support.apple.com/en-lamr/guide/apple-invites/dev5266f8d6d/ios) (host iCloud+ requirement, RSVP and web participation with or without an Apple Account).
- Apple — [Create an event in Apple Invites](https://support.apple.com/guide/apple-invites/create-an-event-dev1d1c7cb6b/ios) (custom backgrounds, details, shared albums and playlist subscription conditions).
- Apple — [RSVP to an event](https://support.apple.com/en-gb/guide/apple-invites/devc9d9cdbd5/ios) (guest web/app RSVP flow and limits for guests without an Apple Account).
- Paperless Post — [Shareable links](https://paperlesspost.zendesk.com/hc/en-us/articles/6500539332891-Get-a-Shareable-Link-to-send-via-text-message-social-media-or-from-your-own-email) (updated within two weeks of the research date; link distribution, no send/open tracking and Coins pricing for paid designs).
- Paperless Post — [Tracking Responses](https://paperlesspost.zendesk.com/hc/en-us/articles/207620646-Tracking-Responses-Where-are-my-RSVPs) (updated 6 July 2026; direct-send tracking and RSVP appearance for share links).
- Paperless Post — [Tracking Page statuses](https://paperlesspost.zendesk.com/hc/en-us/articles/211572806-What-do-the-statuses-on-my-Tracking-Page-mean) (opened versus viewed distinctions and email privacy caveat).
- Canva — [Invitations](https://www.canva.com/invitations/) (online links, one-page websites, templates, print delivery, Pro features and regional print limits).
- Canva — [Plans and pricing](https://www.canva.com/pricing/) (free and Pro feature boundaries).
- Greetings Island — [Trustpilot review snapshot](https://www.trustpilot.com/review/greetingsisland.com) (2,428 reviews shown at research time; strong recent sentiment plus watermark/feature-restriction complaints).
- Reddit — [Guest preference: text versus email RSVP links](https://www.reddit.com/r/weddingplanning/comments/1xaj6gb/as_wedding_guest_would_you_prefer_receiving_rsvp/) (20 October 2026; self-reported and mixed preference: some guests prefer text because email may be missed, while others prefer email).

- Reddit — [Paperless Post invitation CTA confusion](https://www.reddit.com/r/weddingplanning/comments/1fi03jh) (self-reported issue distinguishing “View the card” from RSVP).
- Reddit — [Joy, The Knot and Paperless Post setup experience](https://www.reddit.com/r/wedding/comments/1vdxa7k/title_joy_vs_the_knot_vs_paperless_post_our/) (self-reported setup and guest-management trade-offs).

Review platforms and community discussions are self-selected evidence, not representative surveys. Treat recurring reports as hypotheses and acceptance-test prompts, not population-wide failure rates.
