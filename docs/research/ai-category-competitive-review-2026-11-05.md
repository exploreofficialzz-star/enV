# AI Category Competitive Review and Upgrade Plan

**Review date:** 5 November 2026  
**Scope:** all 28 active tools in the AI category, with implementation changes focused on the 13 local AI micro-tools.  
**Platforms:** Web (TypeScript), Android (Kotlin), iOS (Swift).  
**Evidence standard:** official product documentation for capabilities; public customer reviews and community threads for failure modes. User feedback is qualitative and is not treated as a statistically representative survey.

## 1. Category inventory

The shared catalog contains 28 active AI tools:

- Ad Copy Generator
- AI Meeting Agenda Generator
- Alt Text Helper
- Bio Generator
- Blog Outline Generator
- Call To Action Generator
- Caption Generator
- Content Brief Generator
- Email Draft Generator
- Expand Text Helper
- FAQ Generator
- Feature To Benefit Converter
- Idea Generator
- Meeting Action Item Formatter
- Meta Description Generator
- Product Description Generator
- Product Title Generator
- Prompt Generator
- Prompt Improver
- Pros And Cons Generator
- Resume Bullet Generator
- Rewrite Helper
- Shorten Text Helper
- Social Hook Generator
- TikTok Caption Helper
- Title Generator
- YouTube Description Helper
- YouTube Title Helper

The 13-tool micro-engine is deliberately exact-ID mapped. The other 15 tools remain on their separate existing AI engine routes; this work does not collapse them into a shared template or change their operation identifiers.

## 2. What the leading products do well

| Product | Documented strength | Product lesson for enV |
| --- | --- | --- |
| Claude Projects | Project knowledge can include documents, text, code and files; project instructions can define tone and role. Paid plans can expand project knowledge with RAG. | Reusable context should be explicit and user controlled, not guessed from a short topic field. |
| Notion AI | Users can edit selected text in context, ask questions against workspace pages, and accept, discard or retry AI changes. | Preserve the original and make edits reviewable; users should remain in control of applying changes. |
| Jasper | Brand Voice can be learned from writing samples; Style Guide rules cover terminology, punctuation, formatting and tone, and are applied during generation. | Separate audience, voice, style rules, approved facts and task instructions rather than relying on a single vague tone selector. |
| Grammarly | On-demand generative assistance supports composing, rewriting, ideating and replying, with context-aware suggestions intended to adapt to personal voice. | Editing should work on the supplied text and preserve the author's intent. |
| YouTube publishing rules | Video titles have a 100-character maximum; descriptions allow up to 5,000 bytes and can contain timestamp-based chapters. | Platform-aware helpers should validate hard limits and support real chapters and links. |

Official documentation:
- Claude Projects: https://support.claude.com/en/articles/9517075-what-are-projects
- Notion AI inline editing: https://www.notion.com/help/notion-ai-faqs
- Jasper Brand Voice: https://help.jasper.ai/hc/en-us/articles/55085106001051-Brand-Voice
- Jasper Style Guide: https://help.jasper.ai/hc/en-us/articles/25925092890011-Style-Guide
- Grammarly generative AI assistance: https://support.grammarly.com/hc/en-us/articles/14528857014285-Introducing-generative-AI-assistance
- YouTube video metadata limits: https://developers.google.com/youtube/data/reference/rest/v3/videos

## 3. Public feedback: repeated failure modes

These examples are signals to design against, not proof that every user has the same experience.

| Source | Reported user experience | enV regression / design response |
| --- | --- | --- |
| G2 Jasper review, 19 Sep 2026 | One reviewer praised speed and output quality but said the result rarely sounded like their brand. | Avoid claiming brand matching from a tone dropdown; ask for actual audience, points and constraints. |
| Capterra Jasper review, 15 Jul 2025 | A reviewer cited hallucinations, generic or repetitive content and price/value concerns. | Do not invent FAQ answers, product outcomes, evidence, metrics or claims when a user has not supplied them. |
| Reddit / Notion, 15 Feb 2026 | Users described destructive edits that removed content despite instructions to preserve it; a commenter recommended asking for suggestions rather than automatic edits. | Keep source inputs separate from the output draft; make generated output editable; provide reset and clear controls. |
| Reddit / Grammarly, 7 Aug 2026 | Users reported unwanted corrections, repeated correction loops and suggestions that damaged sentences or voice. | Never silently mutate source text. Make the final copy a deliberate user action and keep the original inputs intact. |
| Reddit / Notion, 11 Sep 2026 | A user found more value in searching and summarizing their own workspace context than in generic drafting. | Prioritize context-aware, input-grounded jobs over adding more generic one-click text templates. |
| WIRED, 11 Mar 2026 | Grammarly's discontinued Expert Review feature drew criticism for presenting simulated advice through real people's identities without permission. | Do not imitate named writers, claim endorsement, or attribute invented advice to real people. |

Feedback links:
- G2 Jasper reviews: https://www.g2.com/products/jasper-ai/reviews?page=4&qs=pros-and-cons
- Capterra Jasper reviews: https://www.capterra.com/p/217242/Jasper/reviews/
- Notion destructive-edit discussion: https://www.reddit.com/r/Notion/comments/1r56alr/notion_ai_is_garbage/
- Notion context-search discussion: https://www.reddit.com/r/Notion/comments/1wdoe35/notion_ai_finally_clicked_for_me_once_i_stopped/
- Grammarly rewrite-quality discussion: https://www.reddit.com/r/Grammarly/comments/1viaes3/has_grammarly_suddenly_gotten_worse/
- WIRED Expert Review coverage: https://www.wired.com/story/grammarly-is-facing-a-class-action-lawsuit-over-its-ai-expert-review-feature/

## 4. Product decisions shipped in this branch

### 4.1 Grounding and input quality

- FAQ output now uses only exact question/answer pairs supplied by the user. Missing answers are marked for review instead of being replaced with generic pseudo-answers.
- Feature-to-benefit output pairs each feature with a corresponding supplied customer outcome and an evidence prompt. It no longer invents the same benefit for every feature.
- Meeting action items parse Owner | Action | Due date | Priority; missing owners and due dates remain visibly unresolved, and status is never inferred.
- Pros/cons output distinguishes supplied evidence from unanswered questions and assumptions.
- Expansion and blog-outline helpers expose context, examples, editorial angle and next-step inputs. They explicitly identify placeholders that must be replaced before publication.
- Line-based fields preserve commas inside a question or item. Commas are not treated as implicit record separators where the UI says one item per line.

### 4.2 Control and review

- Generated output is editable on Web, Android and iOS before copying.
- Reset edits restores the last generated draft; Clear removes the current output.
- Source fields remain intact when the generated draft is edited.
- The deterministic/local execution disclosure is retained. The tools do not claim to call a hosted LLM or to have performed fact-checking.

### 4.3 Platform-aware output

- YouTube title suggestions are capped at 100 characters, with word-boundary truncation where practical.
- YouTube descriptions accept actual points, timestamps/chapters, links and a user-supplied call to action.
- Meeting agendas distribute a user-selected total duration across topics, including remainder minutes, and finish with an owner/deadline review.

### 4.4 Native parity

The exact 13-tool micro-engine is kept in TypeScript, Kotlin and Swift. Its field names, input semantics and regression scenarios are tested independently on each platform. The remaining 15 AI-category tools retain their dedicated native and Web engine mappings.

## 5. Verification and limits

The implementation is a deterministic local drafting engine, not a foundation model. It can enforce structure, constraints and user-supplied facts, but it cannot independently research a topic, verify a claim, infer unseen image content, or learn a persistent brand voice from examples. These capabilities must not be claimed until a properly sourced model/backend and consent-aware context store are implemented.

"Outperform" should be validated through reproducible tasks rather than marketing claims. The acceptance suite should compare:
1. factual fidelity to the supplied brief;
2. preservation of source meaning and text;
3. adherence to output limits and format;
4. usefulness of missing-information warnings;
5. editing, reset, copy and export reliability;
6. exact output parity for the same inputs across Web, Android and iOS.

A category-level production release is contingent on the catalog gate, native-coverage guard, platform tests and builds all passing. The presence of a category card alone is not proof of production readiness.
