# Celebrations category — competitive benchmark and acceptance record

**Research refreshed:** 14 November 2026  
**Scope:** all 93 current Celebrations catalog IDs, across 12 occasion families. No adjacent category is included.

## Competitive benchmark

| Product | Verified strengths | Verified constraints and opportunities for enV |
|---|---|---|
| Partiful | Shareable event link; guests can RSVP without installing the app; host controls for RSVP on/off, capacity, waitlists, +1s, guest approval, privacy, questions, ticketing, photo uploads and automated reminders | A managed event platform, not just an export tool. Host-side guest management, reminders, ticketing and shared photos require hosted event/account infrastructure. The product should not imply that a static exported page provides these features. |
| Apple Invites | Custom or generic backgrounds; host event creation and management; RSVP tracking and approval; shared albums/playlists; guests can access the event on the web with or without an Apple Account | Hosting requires an iCloud+ subscription. Some features vary by region, and shared albums/playlists have Apple-account/subscription conditions. |
| Paperless Post | Designed cards/flyers; tracks delivery/open/RSVP for invitations sent through its service; host tracking page, reminders, guest-list tools, and shareable-link option | Paid designs/features use Coins. Shareable-link guests are not visible on the tracking page until they RSVP, and opens for those links are not tracked. This is a real distinction to explain rather than promise parity with a managed sent-invite workflow. |
| Canva Invitations | Large customizable template library; user photos/assets; animation/icons; shareable links and one-page websites; print ordering, proofing and brand/resize tools | Strong design and print focus. Canva explicitly reserves Brand Kit and Magic Switch for Pro and print options vary by location and order. |
| Greetings Island | Large card and invitation selection, customization and saving/editing drafts; current Trustpilot snapshot is strongly positive overall | Reviews include an isolated report of an initial card not being delivered, while many recent reviews praise easy customization and the availability of free designs. Treat review-site material as self-selected feedback, not representative measurement. |
| Evite / other managed invitation products | Relevant benchmark class for hosted invitations, guest lists, RSVP and reminders | Do not infer current limitations from anecdotes alone. The current scope is local creation/export; hosted delivery and RSVP tracking need separate product and privacy design. |

## User feedback translated into testable requirements

- **Keep the action obvious.** A recent wedding-planning guest discussion preferred text links because email invitations can be missed or forgotten. A Paperless Post discussion described the ambiguity of a “View the card” action when the guest expected an invitation/RSVP action. Exported enV pages must use clear event language, visible date/time/location, an explicit user-supplied reply link or contact, and an RSVP deadline when provided.
- **Make the page revisitable.** Community feedback highlights the inconvenience of losing an invitation URL and needing the host to resend it. enV exports are standalone files the user can store or share again; they are not a hosted permanent event URL.
- **Do not overstate guest tracking.** Partiful and Apple Invites provide host-side guest/RSVP management; Paperless Post tracks sending/delivery/open/RSVP for its managed sends, with stated shareable-link limitations. enV must never display “sent”, “delivered”, “opened”, “attending”, or “RSVP received” unless a separately implemented provider service can prove that event.
- **Be explicit about link permissions.** A user-supplied RSVP link is a link to an external destination. It is not an enV RSVP form, guest list, waitlist, approval gate, or secure invite token.
- **Avoid confusing cost boundaries.** Paperless Post documents Coin-based paid designs/features, and Canva identifies Pro-only Brand Kit/Magic Switch features. enV local exports must not unexpectedly add a watermark or claim an external delivery/print service is included.
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

- Partiful — [Why use Partiful?](https://help.partiful.com/en-us/articles/15525594-why-use-partiful) (shareable links, RSVP tracking, reminders, guest visibility, photo uploads).
- Partiful — [Event Settings](https://help.partiful.com/en-us/articles/15525301-what-features-are-available-to-change-in-my-event-settings) (guest approval, RSVP toggles, +1s, privacy, questionnaires, photo album, tickets and reminders).
- Partiful — [RSVP types and controls](https://help.partiful.com/en-us/articles/15525368-how-do-i-modify-the-types-of-rsvps-that-are-allowed) (capacity, waitlist, +1 and invite controls).
- Apple — [Introduction to Apple Invites](https://support.apple.com/en-ca/guide/apple-invites/dev5266f8d6d/ios) (hosting and guest workflow, web access and RSVP).
- Apple — [Apple Invites privacy](https://www.apple.com/legal/privacy/data/en/apple-invites/) (iCloud+ hosting requirement, invitee data and shared album conditions).
- Paperless Post — [Tracking Responses](https://paperlesspost.zendesk.com/hc/en-us/articles/207620646-Tracking-Responses-Where-are-my-RSVPs) (managed-send tracking and shareable link behavior).
- Paperless Post — [Terms of Service](https://www.paperlesspost.com/terms-of-service) (tracking limitations and Coins pricing model).
- Canva — [Invitations](https://www.canva.com/invitations/) (templates, links, one-page websites, print and Pro features).
- Greetings Island — [Trustpilot review snapshot](https://www.trustpilot.com/review/greetingsisland.com) (4.8 TrustScore shown at research time; 2,426 reviews, with recent positive and individual mixed feedback).
- Reddit — [Guest preference: text versus email RSVP links](https://www.reddit.com/r/weddingplanning/comments/1xaj6gb/as_wedding_guest_would_you_prefer_receiving_rsvp/) (self-reported preference; a guest notes email can be missed or forgotten).
- Reddit — [Paperless Post invitation CTA confusion](https://www.reddit.com/r/weddingplanning/comments/1fi03jh) (self-reported issue distinguishing “View the card” from RSVP).
- Reddit — [Joy, The Knot and Paperless Post setup experience](https://www.reddit.com/r/wedding/comments/1vdxa7k/title_joy_vs_the_knot_vs_paperless_post_our/) (self-reported setup and guest-management trade-offs).

Review platforms and community discussions are self-selected evidence, not representative surveys. Treat recurring reports as hypotheses and acceptance-test prompts, not population-wide failure rates.
