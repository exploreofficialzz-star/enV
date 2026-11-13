# Celebrations category — competitive benchmark and implementation record

**Research checked:** 13 November 2026  
**Scope:** all 93 existing Celebrations catalog tools: 12 occasion families with the 93 IDs currently present in the generated catalog. No adjacent category is included.

## Competitor benchmark

| Workflow | Leading products reviewed | Strengths to match | Friction / opportunity for enV |
|---|---|---|---|
| Digital invitations and event pages | Partiful, Apple Invites, Paperless Post, Greenvelope, Evite, RSVPify | Strong visual invitations, shareable event pages, mobile-friendly RSVP, event details, guest instructions and calendar handoff | Guest accounts/app installs, confusing paid tiers or per-recipient credits, ads on free guest pages, unclear delivery vs. open status, and RSVP follow-up work |
| Greeting and interactive cards | Canva, Greetings Island, Hallmark eCards, Paperless Post | Fast occasion templates, personal message/photo editing, clear occasion navigation and simple sharing | Watermark surprises, premium-only assets, export limitations, overly generic designs and hard-to-find free/paid boundaries |
| Countdown and surprise experiences | Partiful, Apple Invites, event-page builders and e-card products | Distinct event identity, clear date/time, celebratory visual hierarchy and one-tap reveal | Pages can become difficult to revisit, require accounts, or work poorly on small screens |
| Memory pages | Partiful shared albums, Apple Invites Shared Albums, greeting-card and slideshow products | Photo collections, captions, mobile presentation and a keepsake users can revisit | Account-gated collection, privacy ambiguity, image size friction and fragile link-only experiences |
| Celebration quizzes | Interactive greeting and party-game products | Simple question/answer flows, immediate feedback and phone-friendly controls | Too much setup, inaccessible controls, and pages that require an app or account to participate |

## Evidence translated into product requirements

- **Design and export:** Canva and Greetings Island are good references for visual customization and quick personalization. Greetings Island's Trustpilot review summary is strongly positive overall but also records complaints about unexpected watermarks and restrictions. enV therefore generates unwatermarked, self-contained HTML and text exports; it does not silently downgrade an export.
- **Guest-first access:** Partiful advertises shareable links that work for guests without the app, and Apple Invites documents web access for guests on any device, with or without an Apple Account. enV exports portable pages that do not require an enV account or guest app.
- **Clear privacy:** Partiful documents controls for guest-list visibility, event approval and password protection. Apple documents host control over what invitees can see. enV does not host guest lists or collect guest responses in this local implementation; the exported page says so plainly.
- **Pricing and delivery transparency:** Paperless Post review feedback mentions confusing plan tiers and its coin system. Evite reviews include reports of spam-folder delivery problems, RSVP/headcount issues, ads and support friction. enV does not claim delivery, charge per recipient, show fake sent/open statuses or imply an RSVP was stored.
- **Real-world guest behavior:** Wedding-planning discussions report that email invitations can be missed, some guests prefer text links, and hosts still need to chase non-responses. enV provides a copyable portable page and space for the host's own response link/contact; it does not pretend that a static export tracks responses.
- **Phone and accessibility:** Make the output responsive, keyboard-operable, readable at narrow widths, safe under reduced-motion preferences, and usable without scripts for the main event information.

## Implemented capability contract

Every existing catalog ID maps to a dedicated experience variant and remains local/account-free:

1. **Page Generator** — occasion landing page with message, date, location, host and programme.
2. **Interactive Card** — revealable greeting/card with a personalized inner message.
3. **Invitation Generator** — event details, dress code, RSVP deadline and a user-supplied RSVP route.
4. **Countdown** — live local countdown calculated against an explicit IANA time zone; DST gaps and repeated local times are rejected.
5. **Memory Page** — personal memory text and up to eight locally embedded JPG/PNG/WebP/AVIF images in Web exports.
6. **Reveal Page** — accessible one-action reveal experience.
7. **Quiz Generator** — two to six choices, explicit correct answer and immediate local feedback.
8. **Surprise Page** — a one-tap reveal for a personal surprise.

All 12 occasion families use the same validated engine contract while keeping their exact, distinct catalog IDs. Android and iOS have separate Kotlin and Swift implementations and native interfaces; neither native app embeds the Web UI.

## Non-goals and truthful boundaries

This implementation prepares local assets. It does not send email/SMS/WhatsApp invitations, host a live event, maintain a guest list, collect RSVPs, sell tickets, authenticate invitees, store a shared album, or promise third-party delivery. Those capabilities require separately designed and consented provider infrastructure. A user-provided RSVP URL remains the user's destination; enV does not inspect or validate the downstream form.

## Source set (checked 13 November 2026)

- Partiful product listing and shareable guest links: https://apps.apple.com/us/app/partiful-party-invite-maker/id1662982304
- Partiful privacy and guest visibility controls: https://help.partiful.com/en-us/articles/15525648-how-does-partiful-protect-my-data
- Apple Invites host and guest workflows: https://support.apple.com/en-euro/guide/apple-invites/dev5266f8d6d/ios
- Apple Invites privacy: https://www.apple.com/legal/privacy/data/en/apple-invites/
- Greenvelope 2026 platform comparison: https://www.greenvelope.com/resources/best-digital-invitation-platforms/
- Paperless Post Trustpilot reviews: https://www.trustpilot.com/review/paperlesspost.com
- Evite Trustpilot reviews: https://www.trustpilot.com/review/www.evite.com
- Greetings Island Trustpilot reviews: https://www.trustpilot.com/review/greetingsisland.com
- Hallmark eCards occasion catalogue: https://www.hallmark.com/ecards/
- Reddit guest preferences and app/RSVP friction: https://www.reddit.com/r/wedding/comments/1vdxa7k/title_joy_vs_the_knot_vs_paperless_post_our/
- Reddit digital invite, watermark, RSVP and guest-channel experience: https://www.reddit.com/r/weddingplanning/comments/1odbent
- Reddit mobile/link vs. email guest preference: https://www.reddit.com/r/weddingplanning/comments/1xaj6gb/as_wedding_guest_would_you_prefer_receiving_rsvp/

Review platforms and community posts are self-selected feedback, not representative surveys. Recurring complaints are treated as testable product requirements rather than population-wide failure rates.
