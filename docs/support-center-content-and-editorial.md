# enV support and editorial center

## Public routes

- `/blog` — editorial index and article cards.
- `/blog/$slug` — individual long-form article pages.
- `/help` — searchable-friendly help topics grouped by user task.
- `/tokens` — token model, provisional price principles, and tool catalogue search.
- `/tokens/$toolId` — a tool-specific billing profile explanation.
- `/pricing` — reference pricing and current billing status.

## Editorial policy

- Keep product facts separate from planned features. Never describe token purchases, rewards, automatic deductions, or offline token spending as live until verified end to end.
- Label estimates as provisional, and use exact units. A proposed USD reference value is not a cash balance or guaranteed regional price.
- Keep articles focused, scannable, accessible, and useful on small screens. Use descriptive headings, short paragraphs, semantic lists, and clear next steps.
- Explain data flows accurately. Do not claim every tool is offline or local if it uses a server/provider.
- Publish security guidance that helps users protect accounts without exposing exploit playbooks or internal thresholds that would help attackers evade controls.
- Each article should have an owner, review date, support link, and change review when product behavior changes. The starter articles in this package are product education, not dated news announcements.

## Suggested future content workflow

1. Draft from an approved product behavior or verified release note.
2. Check each statement against the implementation and feature flags.
3. Have product, security/privacy, and support review claims in their areas.
4. Add accessible metadata, unique slug, concise summary, category, and related help links.
5. Run the support-center consistency check and production build.
6. Publish only after the actual deployment includes the relevant feature and any needed legal/operational prerequisites.
