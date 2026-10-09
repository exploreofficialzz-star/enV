# Native / Web System Parity Audit

**Audit scope:** source-level comparison of the web implementation with Android and iOS implementations across six screen families.

**Overall conclusion:** **Parity is partial; this audit does not establish full parity.** Several contracts are aligned (catalog ranking logic for the common pool, typography declarations in most surfaces, card geometry, navigation intent, validation, and core AI request shapes), but there are confirmed P1/P2/P3 gaps in responsive geometry, catalog scope, search interaction, native state/error handling, accessibility semantics, footer/information behavior, assistant cancellation, and structured AI results.

## Executive summary

| Screen / surface | Status | Main confirmed gaps |
|---|---|---|
| Home | Partial | Hero/search width and scale; native-filtered suggestion pool; search semantics and empty-state surface; vertical rhythm; footer layout/count/year; catalog loading states; draft persistence policy |
| Search and browsing | Gap | Native-filtered tool universe; SearchBox interaction mismatch; category back affordance; global Search presentation/width; gutters; Tools labels; loading/error state; URL-vs-native state model |
| Tool detail shell | Partial | Availability labels; recent-tool persistence; form radius/elevation/background; native error announcement semantics |
| Assistant chat | Gap | Responsive panel/bubble geometry; iOS Outfit scale; cancellation/Stop; New-chat enablement; composer semantics; error/timeout taxonomy; live-region/selectability; retention; recommendation nesting |
| Contextual AI assist | Partial | Android wide-field layout; panel elevation/radius; Android typography guarantee; structured result hierarchy/copy; MIME fallback; error/timeout; availability cache refresh |
| Account and information screens | Partial | Android legal mailto links; Android return-tab behavior; responsive footer; dynamic year; About emphasis; no-mail-handler fallback |

**Priority interpretation:** P1 = material product, interaction, or result-set mismatch; P2 = meaningful visual, accessibility, resilience, or state-contract mismatch; P3 = lower-impact consistency or refresh behavior. Priority is the audit's remediation priority, not a claim about user impact measured at runtime.

## Confirmed gaps

The following are **confirmed implementation differences in the inspected source**. They are not speculative visual findings. Where runtime validation is still needed, that is called out separately.

### 1. Home — partial parity

#### P1 — Responsive hero width and Outfit/geometry scale

- **Web:** Home content is capped at 1152px, while the search and headline are each capped at `max-w-3xl` (768px). The hero logo is 142x56 on mobile and 163x64 at `sm`; search height is 64px on mobile and 72px at `sm`, with 16px/18px search text. Evidence: `/home/ubuntu/enV/src/routes/index.tsx:24-37`; `/home/ubuntu/enV/src/components/brand/logo.tsx:7-35`.
- **Native:** Android and iOS cap the parent at 1152px but put the search/headline at the full content width. Both retain a 142x56 hero and 64px search at all widths; title scales 24/36. Evidence: `/home/ubuntu/enV/apps/android/app/src/main/java/com/chastech/env/MainActivity.kt:265-266,306-343,363`; `/home/ubuntu/enV/apps/ios/enV/ContentViews.swift:33-55,89-94,122-127`.
- **Recommended action:** Add a shared native Home inner max width of 768px, apply the equivalent `>=640` 163x64 hero and 72px search values, and cap the headline to the same inner width while retaining mobile values.

#### P1 — Suggestion ranking/search pool

- **Web:** Home suggestions call `searchTools(getAllTools(), q, 8)`, so web-runtime-only catalog entries participate. Evidence: `/home/ubuntu/enV/src/components/tools/search-box.tsx:48,128-163`; `/home/ubuntu/enV/src/lib/search.ts:56-87`; `/home/ubuntu/enV/src/lib/registry.ts:8-14`.
- **Native:** Android `Catalog.fromJson` and iOS `Catalog.nativeFacing` remove the eight `NativeCopy.webRuntimeOnly` IDs before Home search. Native Home then calls `webSearch` on the filtered catalog. Evidence: `/home/ubuntu/enV/apps/android/app/src/main/java/com/chastech/env/data/NativeCopy.kt:9-21`; `/home/ubuntu/enV/apps/android/app/src/main/java/com/chastech/env/data/CatalogModels.kt:74-98,111-131`; `/home/ubuntu/enV/apps/android/app/src/main/java/com/chastech/env/MainActivity.kt:314`; `/home/ubuntu/enV/apps/ios/enV/CatalogCore.swift:153-170,175-219`; `/home/ubuntu/enV/apps/ios/enV/ContentViews.swift:22`.
- **Confirmed example:** For query `media`, web ranks `media-capability-checker` and `mediarecorder-support-checker` in its top eight; those cannot appear in native Home suggestions. The current empty-query top 12 happens to match because none of the eight filtered entries is in the popularity top 12; the confirmed divergence is for typed queries, not current Trending ordering.
- **Recommended action:** Choose one contract: expose web-runtime entries as non-executable native reference results, or make web search use the native-eligible pool. If filtering is intentional, label/document platform-specific pools and test query parity.

#### P2 — Search accessibility semantics

- **Web:** The inline field has `role=search`, a screen-reader label `Search tools` associated with input `env-search`, an explicit `Search all tools` button label, and a live-suggestion listbox. Evidence: `/home/ubuntu/enV/src/components/tools/search-box.tsx:69-107,128-163`; `/home/ubuntu/enV/src/routes/index.tsx:38-46`.
- **Native:** Android applies `contentDescription` only to the trailing icon; its `BasicTextField` has no corresponding explicit label/role. iOS labels the trailing button `Search`, but the Home `TextField` has no explicit accessibility label and suggestions have no listbox/row semantics in source. Evidence: `/home/ubuntu/enV/apps/android/app/src/main/java/com/chastech/env/MainActivity.kt:327-342`; `/home/ubuntu/enV/apps/ios/enV/ContentViews.swift:38-49,56-81`.
- **Recommended action:** Add a native label/hint such as `Search tools`, expose a search region where supported, add consistent list/row semantics, and align the icon action label to `Search all tools`.

#### P2 — Live suggestion empty-state and surface behavior

- **Web:** For a nonblank no-match query, the surfaced absolute listbox remains visible with the no-match message and `See more results`. Evidence: `/home/ubuntu/enV/src/components/tools/search-box.tsx:128-163`.
- **Native:** Both native Homes show a no-match message but omit `See more results` in the empty-result branch. Android renders suggestions/no-match directly without the web dropdown card/background/listbox surface; iOS wraps the block in a card but has no listbox semantics. Evidence: `/home/ubuntu/enV/apps/android/app/src/main/java/com/chastech/env/MainActivity.kt:345-357`; `/home/ubuntu/enV/apps/ios/enV/ContentViews.swift:56-81`.
- **Recommended action:** Match the web state contract: use a surfaced Android suggestion panel, retain the see-more action for zero results if that is canonical, and add consistent list semantics.

#### P2 — Inter-section vertical rhythm

- **Web:** The hero/title section ends with `pb-10` (40px) before Trending; heading-to-grid is `mt-4` (16px). Evidence: `/home/ubuntu/enV/src/routes/index.tsx:24,53-60,65-74`.
- **Native:** Android separates hero and Trending by 24px; iOS uses 28px. Card/grid internal gaps otherwise align at 12px. Evidence: `/home/ubuntu/enV/apps/android/app/src/main/java/com/chastech/env/MainActivity.kt:316,366-369`; `/home/ubuntu/enV/apps/ios/enV/ContentViews.swift:32-34,97-103`.
- **Recommended action:** Adopt one shared Home section rhythm (40px if web is canonical), or deliberately update/document the contract and add breakpoint checks.

#### P2 — Footer responsive layout and placement

- **Web:** `AppShell` renders a separate footer after main; at `md` it becomes a four-column grid with a two-column brand span, 12px vertical padding, and a separate copyright/count bar. Evidence: `/home/ubuntu/enV/src/components/layout/app-shell.tsx:5-12`; `/home/ubuntu/enV/src/components/layout/footer.tsx:17-62`.
- **Native:** Android and iOS embed `WebHomeFooter` inside Home scroll content and keep one vertical column at every width; iOS also caps Home content at 1152px. Evidence: `/home/ubuntu/enV/apps/android/app/src/main/java/com/chastech/env/MainActivity.kt:382,415-433`; `/home/ubuntu/enV/apps/ios/enV/ContentViews.swift:120-127,222-252`.
- **Recommended action:** Implement a responsive native footer at the regular/desktop breakpoint and decide explicitly whether footer ownership is Home content or app shell.

#### P2 — Footer counts/date and native catalog scope

- **Web:** Uses `activeCount()` over the full web catalog (active or beta) and computes the current year at render time. Evidence: `/home/ubuntu/enV/src/lib/registry.ts:12-14,76-82`; `/home/ubuntu/enV/src/components/layout/footer.tsx:18-27,54-59`.
- **Native:** Android count is `catalog.counts.active` over the native-filtered catalog; iOS `nativeFacing` computes nonplanned native entries. Both hard-code `© 2026`. Evidence: `/home/ubuntu/enV/apps/android/app/src/main/java/com/chastech/env/data/CatalogModels.kt:83-97`; `/home/ubuntu/enV/apps/android/app/src/main/java/com/chastech/env/MainActivity.kt:418,431-432`; `/home/ubuntu/enV/apps/ios/enV/CatalogCore.swift:155-169`; `/home/ubuntu/enV/apps/ios/enV/ContentViews.swift:230,248-249`.
- **Current-data implication:** The checked shared catalog contains 10,000 active entries and the native filter removes eight, so the current source yields 10,000 web versus 9,992 native, subject to the platform count contracts.
- **Recommended action:** Use a shared platform-aware count contract (or intentionally display native-available count) and derive the copyright year at runtime.

#### P2 — Catalog loading/error behavior

- **Web:** Home synchronously imports the registry and has no loading, retry, or catalog-failure branch. Evidence: `/home/ubuntu/enV/src/lib/registry.ts:1-14`; `/home/ubuntu/enV/src/routes/index.tsx:11-61`.
- **Native:** Android blocks Home behind `NativeLaunchScreen` while the bundled catalog loads and shows `CatalogFailureScreen` with Retry on failure. iOS overlays `NativeLaunchView` / `CatalogFailureView` from `CatalogStore.loadState`. Evidence: `/home/ubuntu/enV/apps/android/app/src/main/java/com/chastech/env/MainActivity.kt:163-203`; `/home/ubuntu/enV/apps/ios/enV/CatalogCore.swift:249-300`; `/home/ubuntu/enV/apps/ios/enV/enVApp.swift:97-103,241-263`.
- **Recommended action:** If parity requires equivalent resilience, add explicit web loading/error states; otherwise document this as a native-bundled-catalog-only contract.

#### P2 — Home draft state persistence/reset

- **Web:** Home search is local React `useState`, with no persistence; submit trims only for the URL query. Evidence: `/home/ubuntu/enV/src/routes/index.tsx:13-20`; `/home/ubuntu/enV/src/components/tools/search-box.tsx:78-95`.
- **Native:** Android uses `rememberSaveable` for `homeQuery`; iOS uses `@State searchText` and an `AppStorage`-driven Home identity reset when navigating from ToolDetail. No implementation uses durable user storage for the Home draft. Evidence: `/home/ubuntu/enV/apps/android/app/src/main/java/com/chastech/env/MainActivity.kt:211-214,280,305`; `/home/ubuntu/enV/apps/ios/enV/ContentViews.swift:14-22,30-43,134-135`; `/home/ubuntu/enV/apps/ios/enV/ToolViews.swift:79-100`.
- **Recommended action:** Define one draft policy (retain across tabs/back or clear on Home navigation) and implement it consistently.

### 2. Search and browsing — gap

#### P1 — Tool universe / ranking result set

- **Web:** Search and Tools index use the complete registry; ranking includes category, subcategory, keywords, tags, and ID in the haystack. Evidence: `/home/ubuntu/enV/src/lib/registry.ts:1-10`; `/home/ubuntu/enV/src/lib/search.ts:42-87`.
- **Native:** Android removes every `NativeCopy.isWebRuntimeOnly` tool from `catalog.tools` and keeps them only as related references; iOS `Catalog.nativeFacing` performs the same filtering. Search/Tools call `webSearch` on the filtered native catalog. Evidence: `/home/ubuntu/enV/apps/android/app/src/main/java/com/chastech/env/data/CatalogModels.kt:74-98`; `/home/ubuntu/enV/apps/android/app/src/main/java/com/chastech/env/MainActivity.kt:445-448,602`; `/home/ubuntu/enV/apps/ios/enV/CatalogCore.swift:153-170`; `/home/ubuntu/enV/apps/ios/enV/ContentViews.swift:281-287,481`.
- **Recommended action:** Expose the same universe to native browsing/search or explicitly define web-runtime-only exclusion and shared platform counts/empty states.

#### P1 — Search field interaction contract

- **Web:** Shared `SearchBox` computes up to eight ranked suggestions when focused/queried, renders suggestions plus `See more results`, and on Enter opens the first result when available, otherwise `/search?q=...`. It is used by the global Search and Tools index. Evidence: `/home/ubuntu/enV/src/components/tools/search-box.tsx:48-65,79-95,128-163`; `/home/ubuntu/enV/src/routes/search.tsx:24-29`; `/home/ubuntu/enV/src/routes/tools/index.tsx:35-42`.
- **Native:** Android SearchScreen uses an `OutlinedTextField` with no suggestion/dropdown or Enter navigation contract; Android Tools uses a `BasicTextField` that only updates query. iOS Search uses system `.searchable` live results and iOS Tools uses a plain `TextField` with no suggestions. Evidence: `/home/ubuntu/enV/apps/android/app/src/main/java/com/chastech/env/MainActivity.kt:562-572,599-635,1377-1380`; `/home/ubuntu/enV/apps/ios/enV/ContentViews.swift:304-317,476-537`.
- **Recommended action:** Either implement ranked suggestions and first-result Enter natively, or change web SearchBox behavior on these pages to match native live-result behavior.

#### P1 — Category navigation and back affordance

- **Web:** Category route renders content under AppShell but has no in-page back-to-all-tools control; visible global navigation remains available. Evidence: `/home/ubuntu/enV/src/routes/tools/$category.tsx:1-7`; `/home/ubuntu/enV/src/routes/tools/$category/index.tsx:21-49`; `/home/ubuntu/enV/src/components/layout/header.tsx:4-54`.
- **Native:** Android has an explicit ArrowLeft labeled Back to all tools and intercepts system back to clear category. iOS uses NavigationStack back navigation. Evidence: `/home/ubuntu/enV/apps/android/app/src/main/java/com/chastech/env/MainActivity.kt:223-226,437-440,504-523`; `/home/ubuntu/enV/apps/ios/enV/ContentViews.swift:326-346,396-462`.
- **Recommended action:** Add a web back-to-all-tools affordance while preserving browser history, or document global Tools as the intentional substitute.

#### P1 — Global Search presentation, labels, and width

- **Web:** Search page visibly includes `Search tools` heading/description and a large SearchBox with dynamic `Search N tools…` placeholder, 56px height, full rounding, and `max-w-2xl`. Evidence: `/home/ubuntu/enV/src/routes/search.tsx:24-29`; `/home/ubuntu/enV/src/components/tools/search-box.tsx:16,104-124`.
- **Native:** Android displays heading/description but its field advertises `Search names, descriptions, tags` and is a full-width padded 12dp `OutlinedTextField`. iOS SearchView renders only SearchResultsView in NavigationStack; its system `.searchable` prompt is `Search names, descriptions, keywords, tags`, without the matching visible heading/description in result content. Evidence: `/home/ubuntu/enV/apps/android/app/src/main/java/com/chastech/env/MainActivity.kt:610-614,1377-1380`; `/home/ubuntu/enV/apps/ios/enV/ContentViews.swift:465-473,476-537`.
- **Recommended action:** Align prompt/accessibility label, add the iOS heading/description if required, and either constrain native Search to web `max-w-2xl` or remove the web-only constraint.

#### P2 — Search-page gutters and vertical geometry

- **Web:** Search uses max-w-6xl, `px-4` then `sm:px-6`, `py-10`, and places the field after `mt-6`; the `sm` gutter is 24px. Evidence: `/home/ubuntu/enV/src/routes/search.tsx:25-29`.
- **Native:** Android uses 16dp horizontal and 28dp vertical LazyColumn padding. iOS uses 16pt content padding and its system search is outside that content. Native therefore stays at 16pt/16dp where web changes to 24px and begins 12–24px higher. Evidence: `/home/ubuntu/enV/apps/android/app/src/main/java/com/chastech/env/MainActivity.kt:605-614`; `/home/ubuntu/enV/apps/ios/enV/ContentViews.swift:484-528`.
- **Recommended action:** Use the same 16/24 responsive gutter and 40px top rhythm natively, or make web Search use native rhythm.

#### P2 — Tools-index field labels

- **Web:** Shared default SearchBox uses a `Search N tools…` placeholder and screen-reader label `Search tools`. Evidence: `/home/ubuntu/enV/src/routes/tools/index.tsx:35-42`; `/home/ubuntu/enV/src/components/tools/search-box.tsx:16,104-107`.
- **Native:** Android visibly says `Search` and uses `Search` as semantic description; iOS visibly says `Search` and labels accessibility as `Search all tools`. Evidence: `/home/ubuntu/enV/apps/android/app/src/main/java/com/chastech/env/MainActivity.kt:562-570`; `/home/ubuntu/enV/apps/ios/enV/ContentViews.swift:304-311`.
- **Recommended action:** Adopt a shared Tools-index prompt/accessibility label such as `Search tools`, or make web use the short native label.

#### P2 — Loading/failure states

- **Web:** Browsing routes synchronously import a static registry and have no loading, retry, or catalog-load error branches. Evidence: `/home/ubuntu/enV/src/lib/registry.ts:1-10`; `/home/ubuntu/enV/src/routes/search.tsx:17-45`; `/home/ubuntu/enV/src/routes/tools/index.tsx:20-89`; `/home/ubuntu/enV/src/routes/tools/$category/index.tsx:13-49`.
- **Native:** Android has explicit launch/loading and failure-with-Retry states; iOS uses `CatalogStore.loadState` with NativeLaunchView/CatalogFailureView. Evidence: `/home/ubuntu/enV/apps/android/app/src/main/java/com/chastech/env/MainActivity.kt:164-203`; `/home/ubuntu/enV/apps/ios/enV/enVApp.swift:97-103`; `/home/ubuntu/enV/apps/ios/enV/CatalogCore.swift:249-264`.
- **Recommended action:** Add an equivalent web contract only if asynchronous loading is expected; otherwise document the static web versus bundled-native distinction.

#### P2 — Query/state persistence model

- **Web:** Search and Tools queries are URL `q` parameters; typing navigates with `replace:true`, making query state deep-linkable and reloadable. Evidence: `/home/ubuntu/enV/src/routes/search.tsx:10-12,17-29`; `/home/ubuntu/enV/src/routes/tools/index.tsx:12-14,20-42`.
- **Native:** Android keeps tab/query/category/detail state in `rememberSaveable`; iOS keeps shared query in RootTabView `@State` and selected tab in `@AppStorage`. Native query state is not represented as a URL/deep-link contract. Evidence: `/home/ubuntu/enV/apps/android/app/src/main/java/com/chastech/env/MainActivity.kt:210-225`; `/home/ubuntu/enV/apps/ios/enV/enVApp.swift:62-89`.
- **Recommended action:** Decide whether URL persistence is web-only; if parity requires restorable links, add native deep-link routing, otherwise document the platform-specific model.

### 3. Tool detail shell — partial parity

#### P2 — Availability labeling

- **Web:** Detail shell renders title/description and only adds `ComingSoonBadge` for planned tools; active tools have no online/local availability label. Evidence: `/home/ubuntu/enV/src/components/tools/tool-shell.tsx:54-62`; `/home/ubuntu/enV/src/components/tools/tool-engine.tsx:46-54`.
- **Native:** ToolCard labels supported tools `ONLINE`, locally executable tools `ON DEVICE`, planned tools `Coming soon`, and unsupported tools `WEB ONLY`. Native detail fallback states show Coming soon/Web only, while supported detail forms have no equivalent status line. Evidence: `/home/ubuntu/enV/apps/ios/enV/ToolViews.swift:27-34,123-143`; `/home/ubuntu/enV/apps/android/app/src/main/java/com/chastech/env/MainActivity.kt:745-755`.
- **Recommended action:** Add web availability/status badges or remove card-only native labels; if retained, show ONLINE/ON DEVICE in supported native detail headers.

#### P2 — Recent-tool persistence

- **Web:** Mounting ToolShell records the current tool in a bounded recent list of up to 24 IDs. Evidence: `/home/ubuntu/enV/src/components/tools/tool-shell.tsx:24-32`; `/home/ubuntu/enV/src/lib/storage.ts:3-6,96-100`.
- **Native:** Android and iOS detail screens do not record recents; settings show the same placeholder text. Native stores inspected persist favorites/theme but have no recent-tool key or recorder. Evidence: `/home/ubuntu/enV/apps/android/app/src/main/java/com/chastech/env/MainActivity.kt:663`; `/home/ubuntu/enV/apps/ios/enV/ContentViews.swift:605`; `/home/ubuntu/enV/apps/android/app/src/main/java/com/chastech/env/data/FavoritesStore.kt:6-27`; `/home/ubuntu/enV/apps/ios/enV/CatalogCore.swift:267-323`.
- **Important scope note:** The web detail shell records up to 24 recent IDs, but `/history` still renders only “Recently used tools will appear here.” This is a storage-contract divergence, not a current visible History-list difference.
- **Status:** The pending follow-up persists a deduplicated, newest-first 24-ID list on Android/iOS detail entry. The History screen remains the identical placeholder because that is still the web behavior.
- **Recommended action:** Verify persistence after app relaunch and keep History list rendering out of scope until the web `/history` route uses the recent state.

#### P2 — Form-surface geometry

- **Web:** Tool form shell is `rounded-2xl` (32px), `bg-surface`, p-4/p-6 at `sm`, with shadow-border and no explicit border. Evidence: `/home/ubuntu/enV/src/components/tools/tool-shell.tsx:84-86`; `/home/ubuntu/enV/src/styles.css:57-67`.
- **Native:** Android and iOS use 16dp/pt radius with explicit border. Android uses background rather than surface and pads 16/24; iOS uses envSurface and the same padding. Evidence: `/home/ubuntu/enV/apps/android/app/src/main/java/com/chastech/env/MainActivity.kt:738-744`; `/home/ubuntu/enV/apps/ios/enV/ToolViews.swift:146-150`.
- **Recommended action:** Align native to web 32 radius/shadow or change web to native 16 radius/border; explicitly decide Android surface versus background token.

#### P2 — Error announcement semantics

- **Web:** Shared ErrorBanner uses `role=alert`; backend loading disables Run and changes its label to `Running…`. Evidence: `/home/ubuntu/enV/src/components/tools/error-banner.tsx:1-8`; `/home/ubuntu/enV/src/components/engines/backend-tool-engine.tsx:5`.
- **Native:** Android backend errors are plain colored Text; iOS backend errors are plain red footnote Text. Neither has an explicit accessibility error/alert semantic in source, although both disable Run and change the working label. Evidence: `/home/ubuntu/enV/apps/android/app/src/main/java/com/chastech/env/NativeBackendToolForm.kt:126-175,187-200`; `/home/ubuntu/enV/apps/ios/enV/ToolViews.swift:348-397,723-739`.
- **Recommended action:** Add platform-equivalent error announcements/alert semantics while preserving the matching loading/disabled behavior.

### 4. Assistant chat — gap

#### P1 — Responsive geometry and layout

- **Native:** Android uses full available width with 16dp horizontal padding, a weighted LazyColumn, no bounded conversation panel, and cards at 92% width. Evidence: `/home/ubuntu/enV/apps/android/app/src/main/java/com/chastech/env/AssistantScreen.kt:201-225,232-246`.
- **Native:** iOS uses 16pt horizontal padding and an unconstrained scroll area; message/recommendation content is capped at 520pt rather than using the web panel/bubble geometry. Evidence: `/home/ubuntu/enV/apps/ios/enV/AssistantChat.swift:151-180,193-235,275-283`.
- **Web reference:** The audit identifies a web panel/bubble geometry contract (including a 48rem panel and max-height behavior) that has no shared native equivalent; exact web lines should be rechecked during implementation because the supplied audit did not repeat them in this gap entry.
- **Recommended action:** Implement the web geometry contract natively where responsive parity is required, or document mobile-specific geometry and validate narrow, tablet, and wide screenshots.

#### P1 — Typography / Outfit scale

- **Native:** Android applies bundled Outfit through Material typography. iOS AssistantChat uses SwiftUI system styles (`.title2`, `.body`, `.caption`, `.footnote`) rather than the explicit Outfit custom fonts used elsewhere. Evidence: `/home/ubuntu/enV/apps/android/app/src/main/java/com/chastech/env/ui/Theme.kt:13-18,56-73`; `/home/ubuntu/enV/apps/ios/enV/AssistantChat.swift:157,186-190,228,247,257-265`; comparison: `/home/ubuntu/enV/apps/ios/enV/ContentViews.swift:38-40`.
- **Recommended action:** Use Outfit and explicit assistant scale/weights in iOS, then validate Dynamic Type against web/Android.

#### P1 — Pending and cancellation states

- **Native:** Android exposes Thinking/Stop but `AssistantScreen` calls `NativeAiClient.run` without passing a `RequestHandle`; the handle is the mechanism that disconnects `HttpURLConnection`. Evidence: `/home/ubuntu/enV/apps/android/app/src/main/java/com/chastech/env/AssistantScreen.kt:155-187,248-253`; `/home/ubuntu/enV/apps/android/app/src/main/java/com/chastech/env/NativeAiClient.kt:25-41,67-71`.
- **Native:** iOS shows ProgressView and Thinking but no in-screen Stop; it cancels on disappear/new chat. Evidence: `/home/ubuntu/enV/apps/ios/enV/AssistantChat.swift:227-231,285-289,349-384`.
- **Recommended action:** Pass the Android request handle through execution and add an accessible iOS Stop control with non-error cancellation semantics matching web.

#### P2 — New-chat interaction semantics

- **Native:** Android and iOS disable New chat when messages are empty or sending. Evidence: `/home/ubuntu/enV/apps/android/app/src/main/java/com/chastech/env/AssistantScreen.kt:210-218`; `/home/ubuntu/enV/apps/ios/enV/AssistantChat.swift:160-164`.
- **Recommended action:** Either match native guards on web or allow busy/empty reset consistently and test cancellation/reset behavior.

#### P2 — Prompt/input semantics and composer presentation

- **Native:** Android and iOS omit `enV` from the placeholder. Android uses 1–4 lines and a text `Send`; iOS uses a 1–4-line TextField and arrow/hourglass icon. Native specifies IME/onSubmit send but no web-equivalent Shift+Enter rule. Evidence: `/home/ubuntu/enV/apps/android/app/src/main/java/com/chastech/env/AssistantScreen.kt:266-279`; `/home/ubuntu/enV/apps/ios/enV/AssistantChat.swift:256-273`.
- **Recommended action:** Align copy and send affordance semantics or define platform-specific rules; test Enter, Shift+Enter, IME send, trimming, 3,000-character truncation, and busy disablement.

#### P1 — Error normalization and timeout behavior

- **Web/server reference:** Server task timeout is 45s; web/iOS client deadline is 75s. Evidence: `/home/ubuntu/enV/src/lib/ai/server/tasks/assistant.ts:47-56`; web client lines are listed in the audit source set.
- **Native:** Android maps some non-2xx JSON errors but lets configuration/network exceptions escape and uses 15s connect/90s read timeouts; the screen displays exception text. iOS maps HTTP envelope messages but surfaces URLSession/localized errors and uses a 75s timeout. Evidence: `/home/ubuntu/enV/apps/android/app/src/main/java/com/chastech/env/NativeAiClient.kt:72-88,148-173`; `/home/ubuntu/enV/apps/android/app/src/main/java/com/chastech/env/AssistantScreen.kt:179-183,257-263`; `/home/ubuntu/enV/apps/ios/enV/AssistantChat.swift:105-123,363-368`.
- **Recommended action:** Share a native error taxonomy/messages with web, normalize transport/timeout/configuration failures, and align client deadlines with the server contract.

#### P2 — Accessible interaction and message semantics

- **Web/native difference:** Web has explicit ARIA attributes; iOS enables `textSelection`; Android has no equivalent selectable modifier in the inspected assistant source. Neither native source adds a conversation log/live-region equivalent. Evidence: `/home/ubuntu/enV/apps/android/app/src/main/java/com/chastech/env/AssistantScreen.kt:221-255`; `/home/ubuntu/enV/apps/ios/enV/AssistantChat.swift:181-191`.
- **Recommended action:** Add native announcements/collection semantics for new replies and copy/select support on Android; verify TalkBack/VoiceOver and icon-only labels.

#### P2 — Conversation retention/persistence

- **Native:** Android owns assistant messages at EnVApp level; iOS owns them at RootTabView level, preserving them while switching tabs during app lifetime. Neither cited owner uses durable storage. Evidence: `/home/ubuntu/enV/apps/android/app/src/main/java/com/chastech/env/MainActivity.kt:210-229,281`; `/home/ubuntu/enV/apps/ios/enV/enVApp.swift:62-80`.
- **Web:** Web state is screen-component-level and no local/session storage is cited. Evidence: `/home/ubuntu/enV/src/routes/assistant.tsx:1-189`.
- **Recommended action:** Define retention explicitly; lift web state to a shared store if tab-return retention is canonical, or reset native state on equivalent navigation.

#### P2 — Recommendation response structure

- **Native:** Android/iOS render recommendation cards outside the assistant message bubble as separate full-width-ish cards. Evidence: `/home/ubuntu/enV/apps/android/app/src/main/java/com/chastech/env/AssistantScreen.kt:232-246,286-300`; `/home/ubuntu/enV/apps/ios/enV/AssistantChat.swift:199-219`.
- **Recommended action:** Align recommendation nesting/card grouping or document the native separate-card treatment and validate long descriptions/wide screens.

### 5. Contextual AI assist — partial parity

#### P2 — Responsive field hierarchy / width

- **Web:** At `sm` (640px), textarea/image/audio fields span both grid columns; ordinary fields use two columns. Evidence: `/home/ubuntu/enV/src/components/ai/ai-assist-panel.tsx:179-182`.
- **Native (initial audit):** Android used only `fields.chunked(columns)` and did not test field kind, so topic/SQL/JSON textareas and image/audio controls did not span both columns. iOS already implements the wide rule. Evidence: `/home/ubuntu/enV/apps/android/app/src/main/java/com/chastech/env/NativeAiAssistPanel.kt:246-265`; `/home/ubuntu/enV/apps/ios/enV/ToolViews.swift:1691-1692,1829-1833`.
- **Status:** The current working tree groups Android textarea/image/audio controls across both columns at >=640dp, flushes short rows around wide fields, and includes a `check:native-ai` regression assertion. Runtime/screenshot verification remains.
- **Recommended action:** Verify TalkBack, layout at 640/768dp, and long localized/validation content on Android.

For the structured result hierarchy finding below, the current working tree also adds labeled Breakdown/Warnings/Structure/Alt text sections, suggested-test caveats, metadata, and per-entry Copy controls for regex, SQL, JSON, and image alt-text outputs on Android and iOS. The `check:native-ai` guard now checks all result-kind routes and section labels. Native compile/XCTest/simulator verification remains pending before this batch is considered resolved.

#### P2 — Panel geometry / elevation

- **Web:** Panel uses `rounded-2xl` plus `shadow-[var(--shadow-border)]`; theme 2xl radius is 32px. Evidence: `/home/ubuntu/enV/src/components/ai/ai-assist-panel.tsx:168-170`; `/home/ubuntu/enV/src/styles.css:57-67`.
- **Native (initial audit):** Android and iOS used 16-point rounded rectangles with borders and no shadow. Evidence: `/home/ubuntu/enV/apps/android/app/src/main/java/com/chastech/env/NativeAiAssistPanel.kt:232-238`; `/home/ubuntu/enV/apps/ios/enV/ToolViews.swift:1868-1871`.
- **Status:** Pending working-tree changes align the native outer radius to 32dp/pt and guard it in `check:native-ai`; shadows remain lighter/different and need screenshot verification.
- **Recommended action:** Verify native border/shadow perception at mobile and tablet widths.

#### P2 — Typography / Outfit scale

- **Web:** Globally loads Outfit; panel uses explicit 18px heading, 14px body, and 12px disclaimer classes. Evidence: `/home/ubuntu/enV/src/styles.css:3-39,109-112`; `/home/ubuntu/enV/src/components/ai/ai-assist-panel.tsx:170-177,220-222`.
- **Native:** Android panel delegates to Material `titleMedium/bodySmall/labelSmall/bodyMedium` without an explicit Outfit family or equivalent numeric sizes. iOS explicitly uses Outfit and 18/14/13/12 sizes. Evidence: `/home/ubuntu/enV/apps/android/app/src/main/java/com/chastech/env/NativeAiAssistPanel.kt:240-245,309-313,343-379`; `/home/ubuntu/enV/apps/ios/enV/ToolViews.swift:1823-1828,1856-1863,1884-1908`.
- **Recommended action:** Define/apply shared Outfit and explicit panel sizes in Android.

#### P1 — Structured result hierarchy and copy affordances

- **Web:** Dedicated semantic result views use separate sections, headings, lists/code, warnings, and for alt text separate Alt text, Longer description, Text found, copy buttons, and character metadata. Evidence: `/home/ubuntu/enV/src/components/ai/ai-results.tsx:107-193,197-217`.
- **Native:** Android flattens non-caption/title/transcript results to one formatted Text plus one Copy; iOS similarly renders one formatted TextEditor plus one Copy. Evidence: `/home/ubuntu/enV/apps/android/app/src/main/java/com/chastech/env/NativeAiAssistPanel.kt:473-479`; `/home/ubuntu/enV/apps/android/app/src/main/java/com/chastech/env/NativeAiEngine.kt:243-258`; `/home/ubuntu/enV/apps/ios/enV/ToolViews.swift:1963-1978,1339-1379`.
- **Recommended action:** Implement result-kind views, code/list styling, metadata, and per-block copy actions natively; retain combined export only as an additional affordance.

#### P2 — File preparation MIME contract

- **Web:** Image preparation accepts only browser-reported MIME values in three image MIME constants. Evidence: `/home/ubuntu/enV/src/lib/ai/client/ai-client.ts:202-205`.
- **Native:** Android derives an accepted image MIME from a valid filename extension when source MIME is absent/unsupported; iOS also accepts extension-only images when MIME is empty. Evidence: `/home/ubuntu/enV/apps/android/app/src/main/java/com/chastech/env/NativeAiClient.kt:91-102`; `/home/ubuntu/enV/apps/ios/enV/ToolViews.swift:1423-1429`.
- **Recommended action:** Adopt one shared rule: add extension fallback to web or require/validate the same MIME rule natively.

#### P2 — Error and timeout contract

- **Web:** Client has a 75s run deadline and normalizes cancellation, timeout, and network failures to stable `AiClientError` codes/messages. Evidence: `/home/ubuntu/enV/src/lib/ai/client/ai-client.ts:39,70-86`; `/home/ubuntu/enV/src/lib/ai/client/use-ai-task.ts:26-30`.
- **Native:** Android uses 15s connect/90s read timeouts and displays uncaught throwable messages for non-API failures; iOS uses a 90s URLSession timeout and displays `localizedDescription`. Evidence: `/home/ubuntu/enV/apps/android/app/src/main/java/com/chastech/env/NativeAiClient.kt:148-169`; `/home/ubuntu/enV/apps/android/app/src/main/java/com/chastech/env/NativeAiAssistPanel.kt:296-300`; `/home/ubuntu/enV/apps/ios/enV/ToolViews.swift:1452-1462,1932-1940`.
- **Recommended action:** Centralize timeout values and map native transport failures to stable cancellation/timeout/network messages while retaining retry metadata.

#### P3 — Availability refresh behavior

- **Web:** Availability responses share a global 60-second cache. Evidence: `/home/ubuntu/enV/src/lib/ai/client/ai-client.ts:39-41,122-149`; `/home/ubuntu/enV/src/lib/ai/client/use-ai-task.ts:50-63`.
- **Native:** Android and iOS perform a direct availability request once per panel/task effect and do not use the same cache. Evidence: `/home/ubuntu/enV/apps/android/app/src/main/java/com/chastech/env/NativeAiAssistPanel.kt:206-207`; `/home/ubuntu/enV/apps/ios/enV/ToolViews.swift:1796-1802`.
- **Recommended action:** Match the 60s cache semantics or document/test the intentionally different refresh contract.

### 6. Account and information screens — partial parity

#### P1 — Android mailto/link behavior and accessibility

- **Web:** Legal pages expose clickable underlined mailto anchors for account requests, contact addresses, Terms questions, and Responsible Use reporting. Evidence: `/home/ubuntu/enV/src/routes/privacy.tsx:42,53`; `/home/ubuntu/enV/src/routes/terms.tsx:55`; `/home/ubuntu/enV/src/routes/responsible-use.tsx:32`; `/home/ubuntu/enV/src/routes/contact.tsx:14-22`.
- **Android:** EmailAction uses `ACTION_SENDTO` mailto in About/Pricing/Contact, but Privacy/Terms/Responsible Use addresses are plain Text literals with no click/URL annotation. Evidence: `/home/ubuntu/enV/apps/android/app/src/main/java/com/chastech/env/NativeInformationScreen.kt:107-165,203-206,230,235,256,286`.
- **iOS:** Corresponding locations use SwiftUI Link/LocalizedStringKey mailto links. Evidence: `/home/ubuntu/enV/apps/ios/enV/ContentViews.swift:836-842,910,945,978,983,1007,1043`.
- **Recommended action:** Render Android legal-page addresses as annotated/clickable mailto text, with the same visible treatment as web/iOS.

#### P1 — Android navigation return state

- **Android:** System Back restores the tab captured in `informationReturnTab`, but the visible information-page ArrowLeft callback only clears `showInformation` from the Account branch. Opening About/legal content from Home/footer or another tab can therefore leave the selected tab at Account when tapping the arrow. Evidence: `/home/ubuntu/enV/apps/android/app/src/main/java/com/chastech/env/MainActivity.kt:217-227,285-294`; `/home/ubuntu/enV/apps/android/app/src/main/java/com/chastech/env/NativeInformationScreen.kt:63-66`.
- **iOS:** Done dismisses the fullScreenCover back to the underlying selected tab. Evidence: `/home/ubuntu/enV/apps/ios/enV/enVApp.swift:54-59,94-96`; `/home/ubuntu/enV/apps/ios/enV/ContentViews.swift:708-749`.
- **Web:** Information pages are distinct routes under AppShell; browser history governs return. Evidence: `/home/ubuntu/enV/src/components/layout/info-page.tsx:3-10`; `/home/ubuntu/enV/src/components/layout/header.tsx:4-54`.
- **Recommended action:** Use one Android close/back callback that restores `informationReturnTab`, or use a back-stack entry shared by toolbar and system back.

#### P2 — Footer responsive layout and typography

- **Web:** Footer is a max-width 6xl grid and switches to four columns at `md`; headings are uppercase, `text-xs`, tracking-wider, with responsive bottom metadata. Evidence: `/home/ubuntu/enV/src/components/layout/footer.tsx:20-60`.
- **Native:** Android and iOS remain a single vertical column at every width. Android uses fillMaxWidth/spacing 16; iOS uses a VStack spacing 14 with plain 14-point headings. Evidence: `/home/ubuntu/enV/apps/android/app/src/main/java/com/chastech/env/MainActivity.kt:416,415-433`; `/home/ubuntu/enV/apps/ios/enV/ContentViews.swift:222-251`.
- **Recommended action:** Add a width-aware native grid and match heading style/spacing, or explicitly document the mobile-first native footer contract.

#### P2 — Footer year contract

- **Web:** Computes `new Date().getFullYear()` at render time. Evidence: `/home/ubuntu/enV/src/components/layout/footer.tsx:54-58`.
- **Native:** Android and iOS hard-code `© 2026`. Evidence: `/home/ubuntu/enV/apps/android/app/src/main/java/com/chastech/env/MainActivity.kt:431`; `/home/ubuntu/enV/apps/ios/enV/ContentViews.swift:248`.
- **Recommended action:** Compute the current calendar year natively or centralize footer copy. The current year coincides in 2026; the gap is future-year behavior.

#### P3 — About emphasis/semantic typography

- **Web:** The company name is semantically emphasized with `strong`. Evidence: `/home/ubuntu/enV/src/routes/about.tsx:23-26`.
- **Android:** The same paragraph is passed as an unformatted String and rendered as one bodyLarge Text, losing the emphasis. Evidence: `/home/ubuntu/enV/apps/android/app/src/main/java/com/chastech/env/NativeInformationScreen.kt:98-101,309-313`.
- **iOS:** Preserves markdown bold through LocalizedStringKey. Evidence: `/home/ubuntu/enV/apps/ios/enV/ContentViews.swift:827-830`.
- **Recommended action:** Use AnnotatedString/span or separate labeled text in Android.

#### P2 — No-mail-handler error state on Android

- **Android:** EmailAction checks `resolveActivity` and otherwise does nothing; there is no visible error, fallback, or disabled-state path. Evidence: `/home/ubuntu/enV/apps/android/app/src/main/java/com/chastech/env/NativeInformationScreen.kt:162-165`.
- **Web/iOS:** Expose mailto links to the browser/platform mail handler. Evidence: web route anchors and `/home/ubuntu/enV/apps/ios/enV/ContentViews.swift:945`.
- **Recommended action:** Show a copy-address/share fallback or explanatory message when no mail handler resolves.

## Verified matches

These are **source-confirmed matches or materially aligned contracts**, not a claim that rendered/runtime parity is complete.

### Cross-cutting

- Outfit is the declared family across web, Android, and iOS in the audited surfaces. Web loads weights 400/500/600/700; Android registers the same weights and maps Material typography; iOS uses explicit Outfit fonts in most audited views. Evidence: `/home/ubuntu/enV/src/styles.css:1-40`; `/home/ubuntu/enV/apps/android/app/src/main/java/com/chastech/env/ui/Theme.kt:13-18,56-73`; iOS `ContentViews.swift` and `ToolViews.swift` references listed below.
- Core card geometry is materially aligned across discovery/detail surfaces: 16px padding, 36px icon tiles, 12px radius, title/description spacing, two-line descriptions, and arrow/status spacing. Evidence: web `/home/ubuntu/enV/src/components/tools/tool-card.tsx:19-44`; Android `/home/ubuntu/enV/apps/android/app/src/main/java/com/chastech/env/MainActivity.kt:387-400,576-585`; iOS `/home/ubuntu/enV/apps/ios/enV/ContentViews.swift:180-201`; `/home/ubuntu/enV/apps/ios/enV/ToolViews.swift:27-34`.
- Shared search ranking math is materially aligned for the shared native-eligible pool: trim/lowercase, exact/prefix/contains, synonym expansion, token/haystack scoring, popularity contribution, and eight-result Home limit. Evidence: `/home/ubuntu/enV/src/lib/search.ts:26-87`; `/home/ubuntu/enV/apps/android/app/src/main/java/com/chastech/env/data/CatalogModels.kt:101-131`; `/home/ubuntu/enV/apps/ios/enV/CatalogCore.swift:174-220`.
- Tool navigation intent is aligned: web canonical links, Android detail-stack callbacks, and iOS NavigationLink destinations. Evidence: web `/home/ubuntu/enV/src/components/tools/tool-card.tsx:19-24`; Android `/home/ubuntu/enV/apps/android/app/src/main/java/com/chastech/env/MainActivity.kt:223-228,280,387-400`; iOS `/home/ubuntu/enV/apps/ios/enV/ContentViews.swift:183-195,207-219`.

### Home

- Home title scale is aligned at compact 24px/sp/pt and wider 36px/sp/pt: web `text-2xl sm:text-4xl`, Android 24sp/36sp, iOS 24/36. Evidence: `/home/ubuntu/enV/src/routes/index.tsx:53-58`; `/home/ubuntu/enV/apps/android/app/src/main/java/com/chastech/env/MainActivity.kt:363`; `/home/ubuntu/enV/apps/ios/enV/ContentViews.swift:89-94`.
- Trending grid breakpoints and visible limits align: one column below 640, two at 640, three at 768; six versus twelve cards. Evidence: `/home/ubuntu/enV/src/routes/index.tsx:71-73`; `/home/ubuntu/enV/apps/android/app/src/main/java/com/chastech/env/MainActivity.kt:306-313,369-373`; `/home/ubuntu/enV/apps/ios/enV/ContentViews.swift:140-164`.
- Search draft/update versus submit intent aligns on Home: local draft, up to eight suggestions, Enter/search submits, selecting a suggestion opens the tool. Evidence: web `/home/ubuntu/enV/src/routes/index.tsx:15-20` and `/home/ubuntu/enV/src/components/tools/search-box.tsx:78-95,136-162`; Android `/home/ubuntu/enV/apps/android/app/src/main/java/com/chastech/env/MainActivity.kt:280-283,327-355`; iOS `/home/ubuntu/enV/apps/ios/enV/ContentViews.swift:38-75`.
- Header destinations and accessibility labels are aligned in intent across web, Android, and iOS: Home, Saved tools, Tools, More options, AI assistant, Account, Search tools, and Pricing. Evidence: web `/home/ubuntu/enV/src/components/layout/header.tsx:8-48`; Android `/home/ubuntu/enV/apps/android/app/src/main/java/com/chastech/env/MainActivity.kt:233-258`; iOS `/home/ubuntu/enV/apps/ios/enV/enVApp.swift:107-151`.
- Home preview actions align: AI assistant destination/tab, `Total token = 100` without action, and See more tools navigation. Evidence: `/home/ubuntu/enV/src/routes/index.tsx:49-50,74`; `/home/ubuntu/enV/apps/android/app/src/main/java/com/chastech/env/MainActivity.kt:359-379`; `/home/ubuntu/enV/apps/ios/enV/ContentViews.swift:82-117`.

### Search and browsing

- Tools grouping preserves declared category order and drops empty groups on web/Android/iOS; category names, descriptions, and icon identifiers come from shared metadata. Evidence: web `/home/ubuntu/enV/src/routes/tools/index.tsx:27-32,49-62`, `/home/ubuntu/enV/src/data/categories.ts:3-177`; Android `/home/ubuntu/enV/apps/android/app/src/main/java/com/chastech/env/MainActivity.kt:445-487`; iOS `/home/ubuntu/enV/apps/ios/enV/ContentViews.swift:283-345`.
- Progressive reveal counts align: Search starts at 24 and adds 24; Tools starts at 3/category and adds 6; Category starts at 6 and adds 6. Query/category changes reset reveal state. Evidence: web `/home/ubuntu/enV/src/routes/search.tsx:15-23,29,37-41`; `/home/ubuntu/enV/src/routes/tools/index.tsx:17-32,49-80`; `/home/ubuntu/enV/src/routes/tools/$category/index.tsx:13-20,34-44`; Android `/home/ubuntu/enV/apps/android/app/src/main/java/com/chastech/env/MainActivity.kt:442-447,473-497,599-632`; iOS `/home/ubuntu/enV/apps/ios/enV/ContentViews.swift:279-312,326-371,396-450,476-537`.
- Search/Tools/Category responsive grid breakpoints align at 640/1024 and native content max width aligns with web 1152px. Evidence: web routes listed above; Android `/home/ubuntu/enV/apps/android/app/src/main/java/com/chastech/env/MainActivity.kt:266,444,603-605,512-517`; iOS `/home/ubuntu/enV/apps/ios/enV/ContentViews.swift:150-158,347-379,428-456`.
- Empty-state copy is aligned for blank Search, no Search matches, Tools no matches, and empty Category. Evidence: web `/home/ubuntu/enV/src/routes/search.tsx:30-41`; Android `/home/ubuntu/enV/apps/android/app/src/main/java/com/chastech/env/MainActivity.kt:615-626,463-467,533-537`; iOS `/home/ubuntu/enV/apps/ios/enV/ContentViews.swift:323-325,420-426,486-506`.
- Category ordering matches: popularity descending then name. Evidence: web `/home/ubuntu/enV/src/routes/tools/$category/index.tsx:13-16`; Android `/home/ubuntu/enV/apps/android/app/src/main/java/com/chastech/env/MainActivity.kt:506-510`; iOS `/home/ubuntu/enV/apps/ios/enV/CatalogCore.swift:308-313`.

### Tool detail shell

- Title/category/description shell structure is materially aligned: Home/Tools/category/name breadcrumb, 44x44 icon tile, responsive 24/30 title scale, description, disclaimer placement. Evidence: web `/home/ubuntu/enV/src/components/tools/tool-shell.tsx:37-62`; Android `/home/ubuntu/enV/apps/android/app/src/main/java/com/chastech/env/MainActivity.kt:713-735,785-796`; iOS `/home/ubuntu/enV/apps/ios/enV/ToolViews.swift:94-109,191-210`.
- Favorite behavior and persistence align: web localStorage, Android SharedPreferences, iOS UserDefaults. Evidence: web `/home/ubuntu/enV/src/components/tools/tool-shell.tsx:64-80`, `/home/ubuntu/enV/src/lib/storage.ts:85-93`; Android `FavoritesStore.kt:6-18`, `MainActivity.kt:805-808`; iOS `CatalogCore.swift:315-321`, `ToolViews.swift:213-228`.
- Disclaimer strings are mirrored for health, finance, earnings, mockup, and estimate. Evidence: web `/home/ubuntu/enV/src/lib/content.ts:3-17`; Android `/home/ubuntu/enV/apps/android/app/src/main/java/com/chastech/env/data/CatalogModels.kt:161-168`; iOS `/home/ubuntu/enV/apps/ios/enV/CatalogCore.swift:106-115`.
- Responsive shell width/padding and Outfit scales are intentionally close: web max 1024px with 16/24 horizontal and 32/40 vertical padding; Android/iOS max 1024 with corresponding compact/regular values and 640/size-class switching. Evidence: web `/home/ubuntu/enV/src/components/tools/tool-shell.tsx:37`, `/home/ubuntu/enV/src/styles.css:38`; Android `/home/ubuntu/enV/apps/android/app/src/main/java/com/chastech/env/MainActivity.kt:705-710`; iOS `/home/ubuntu/enV/apps/ios/enV/ToolViews.swift:81-92,181-185`.
- Breadcrumb and related-tool navigation are functionally represented in all three. Evidence: web `/home/ubuntu/enV/src/components/tools/tool-shell.tsx:38-52,95-110`; Android `/home/ubuntu/enV/apps/android/app/src/main/java/com/chastech/env/MainActivity.kt:223-225,268-277,766-778`; iOS `/home/ubuntu/enV/apps/ios/enV/ToolViews.swift:98-104,167-179`.
- Backend loading/error/output contracts broadly align: forms clear output, disable Run, show Running/Processing, and surface failures; document forms provide reset and file-save/export affordances. Evidence: web `/home/ubuntu/enV/src/components/engines/backend-tool-engine.tsx:5`; Android `/home/ubuntu/enV/apps/android/app/src/main/java/com/chastech/env/NativeBackendToolForm.kt:126-200`; iOS `/home/ubuntu/enV/apps/ios/enV/ToolViews.swift:348-435`.

### Assistant chat

- All platforms submit `assistant.chat` with messages and bounded candidate metadata; server caps messages at 12, history at 12,000 chars, candidates at 8, and each user message at 3,000 chars. Evidence: web `/home/ubuntu/enV/src/lib/ai/contracts.ts:28-45,83-97`, `/home/ubuntu/enV/src/lib/ai/server/tasks/assistant.ts:8-36`; Android `/home/ubuntu/enV/apps/android/app/src/main/java/com/chastech/env/AssistantScreen.kt:69-72,144-153,190-198`; iOS `/home/ubuntu/enV/apps/ios/enV/AssistantChat.swift:136-149,292-347`.
- Active/beta candidate pool, synonym/token scoring, popularity tie-break, and eight-candidate limit align. Evidence: web `/home/ubuntu/enV/src/lib/search.ts:3-24,56-87`; Android `/home/ubuntu/enV/apps/android/app/src/main/java/com/chastech/env/AssistantScreen.kt:74-120`; iOS `/home/ubuntu/enV/apps/ios/enV/AssistantChat.swift:140-149,303-336`.
- Recommendation IDs are constrained to submitted candidates and planned tools are excluded; server caps output recommendations at three. Evidence: web `/home/ubuntu/enV/src/routes/assistant.tsx:61-69,126-138`; Android `/home/ubuntu/enV/apps/android/app/src/main/java/com/chastech/env/AssistantScreen.kt:173-177,232-246`; iOS `/home/ubuntu/enV/apps/ios/enV/AssistantChat.swift:356-361`; server `/home/ubuntu/enV/src/lib/ai/server/tasks/assistant.ts:33-36,107-112`.
- All platforms trim submitted draft, clear it after submission, disable sending while pending, auto-scroll, and expose retry after non-cancellation failure. Evidence: web `/home/ubuntu/enV/src/routes/assistant.tsx:47-49,82-91,155-182`; Android `/home/ubuntu/enV/apps/android/app/src/main/java/com/chastech/env/AssistantScreen.kt:140-153,190-199,248-263`; iOS `/home/ubuntu/enV/apps/ios/enV/AssistantChat.swift:236-241,338-373`.
- Empty-state/primary labels align: `What can I help with?`, `You`, `enV`, and `Thinking…`. Evidence: web `/home/ubuntu/enV/src/routes/assistant.tsx:118-124,133,145-150`; Android `/home/ubuntu/enV/apps/android/app/src/main/java/com/chastech/env/AssistantScreen.kt:227-252`; iOS `/home/ubuntu/enV/apps/ios/enV/AssistantChat.swift:169-177,186-189,227-231`.

### Contextual AI assist

- Feature coverage, titles/descriptions, action labels, result kinds, field names, required flags, length/range limits, option sets, defaults, consent requirements, and file accept descriptions align across registries. Evidence: web `/home/ubuntu/enV/src/lib/ai/features.ts:70-185`; Android `/home/ubuntu/enV/apps/android/app/src/main/java/com/chastech/env/NativeAiAssistPanel.kt:85-161`; iOS `/home/ubuntu/enV/apps/ios/enV/ToolViews.swift:1706-1729`.
- Fixed input mapping matches for caption/title, regex, SQL, JSON, image alt text, and transcript, including whitespace/file fields. Evidence: web `/home/ubuntu/enV/src/lib/ai/features.ts:220-255`; Android `/home/ubuntu/enV/apps/android/app/src/main/java/com/chastech/env/NativeAiEngine.kt:177-224`; iOS `/home/ubuntu/enV/apps/ios/enV/ToolViews.swift:1309-1335`.
- Consent, required/length/numeric/file validation and consent copy align. Evidence: web `/home/ubuntu/enV/src/components/ai/ai-assist-panel.tsx:60-61,83-90,194-199`; Android `/home/ubuntu/enV/apps/android/app/src/main/java/com/chastech/env/NativeAiAssistPanel.kt:229-230,274-285,385-401`; iOS `/home/ubuntu/enV/apps/ios/enV/ToolViews.swift:1779-1793,1838-1855`.
- Submission uses `/api/ai/run`, parses result/warnings/request metadata, and all surfaces show warnings; loading, Cancel, and file-preparation states are present. Evidence: web `/home/ubuntu/enV/src/lib/ai/client/ai-client.ts:70-105`, `/home/ubuntu/enV/src/components/ai/ai-assist-panel.tsx:201-235`; Android `/home/ubuntu/enV/apps/android/app/src/main/java/com/chastech/env/NativeAiClient.kt:67-89`, `/home/ubuntu/enV/apps/android/app/src/main/java/com/chastech/env/NativeAiAssistPanel.kt:280-315,479`; iOS `/home/ubuntu/enV/apps/ios/enV/ToolViews.swift:1404-1420,1842-1866,1978`.
- Image downscaling/re-encoding attempts and 2.4MB image / 2.8MB audio limits match; audio extension aliases and SRT/VTT transcript export exist across web/native. Evidence: web `/home/ubuntu/enV/src/lib/ai/client/ai-client.ts:193-224`, `/home/ubuntu/enV/src/components/ai/ai-results.tsx:221-246`; Android `/home/ubuntu/enV/apps/android/app/src/main/java/com/chastech/env/NativeAiClient.kt:91-137`, `/home/ubuntu/enV/apps/android/app/src/main/java/com/chastech/env/NativeAiAssistPanel.kt:455-471,483-497`; iOS `/home/ubuntu/enV/apps/ios/enV/ToolViews.swift:1423-1450,1963-1977,1982-1990`.

### Account and information screens

- Canonical account copy matches: no account is required. Evidence: web `/home/ubuntu/enV/src/routes/account.tsx:3`; Android `/home/ubuntu/enV/apps/android/app/src/main/java/com/chastech/env/MainActivity.kt:650-663`; iOS `/home/ubuntu/enV/apps/ios/enV/ContentViews.swift:602-603,708-760`.
- All audited information-page titles/routes are present: About, Pricing, Contact, Account, Privacy, Terms, Disclaimer, Responsible Use. Evidence: Android `/home/ubuntu/enV/apps/android/app/src/main/java/com/chastech/env/NativeInformationScreen.kt:47-80`; iOS `/home/ubuntu/enV/apps/ios/enV/ContentViews.swift:712-765`; corresponding web route files under `/home/ubuntu/enV/src/routes/`.
- Canonical body copy, company/contact details, pricing values/disclaimer, legal prose, and footer labels are materially duplicated. Evidence: web About `/home/ubuntu/enV/src/routes/about.tsx:8-37`; Android `/home/ubuntu/enV/apps/android/app/src/main/java/com/chastech/env/NativeInformationScreen.kt:88-114`; iOS `/home/ubuntu/enV/apps/ios/enV/ContentViews.swift:817-849` and related ranges.
- Information-page geometry aligns: max width 768, 16px/pt horizontal and 40px/pt vertical padding, 30px/pt semibold title, and 12px/pt content spacing. Evidence: web `/home/ubuntu/enV/src/components/layout/info-page.tsx:5-9`; Android `/home/ubuntu/enV/apps/android/app/src/main/java/com/chastech/env/NativeInformationScreen.kt:61-68`; iOS `/home/ubuntu/enV/apps/ios/enV/ContentViews.swift:727-740`.
- Contact responsive behavior aligns: two columns at 640px/sm on web and Android; iOS uses ViewThatFits horizontal/stacked variants. Evidence: web `/home/ubuntu/enV/src/routes/contact.tsx:10-24`; Android `/home/ubuntu/enV/apps/android/app/src/main/java/com/chastech/env/NativeInformationScreen.kt:123-134`; iOS `/home/ubuntu/enV/apps/ios/enV/ContentViews.swift:926-935`.
- Section spacing/width and most accessibility affordances align in source: information sections use 8px internal spacing and 12px outer spacing; web header, Android navigation/back, and iOS buttons/links provide labels/focus/navigation affordances. Evidence: web `/home/ubuntu/enV/src/components/layout/info-page.tsx:8`; Android `/home/ubuntu/enV/apps/android/app/src/main/java/com/chastech/env/NativeInformationScreen.kt:61-82,309-326,63-66`; iOS `/home/ubuntu/enV/apps/ios/enV/ContentViews.swift:730,776-805,596-603`.

## Uncertainty and limitations

The following boundaries are important. They prevent the confirmed source differences above from being overstated as runtime or visual claims.

1. **Audit snapshot versus follow-up work:** The original audit was read-only and had no builds, tests, or device/screenshot checks. Subsequent fixes and focused regression guards are recorded below. The three authoritative workflows passed on `d47df60` and again on `c9c2db2` (Android/Web run `37955965318`, Production `37955965591`, iOS `37955965290`).
2. **Source semantics versus runtime behavior:** Accessibility conclusions are limited to explicit declarations present/absent in source. TalkBack, VoiceOver, browser accessibility-tree output, live-region timing, focus order, hit targets, and actual screen-reader announcements were not measured.
3. **Rendered geometry:** Dimensions explicitly set in source are confirmed; default Compose/UIKit/SwiftUI control heights, font rasterization, Dynamic Type, native shadow rendering, and final wrapping remain runtime questions. The d47 CI exercised native app builds/simulator launch, but no matched screenshots or TalkBack/VoiceOver sessions were captured; pending contextual-AI radius/layout changes still require their own device verification.
4. **Catalog data:** At the original audit snapshot, the shared catalog contained 10,000 active entries while native footer counts omitted eight web-runtime-only reference records. The current working tree calculates the browser count from native-visible plus related-reference active/beta records; compile/CI and runtime count verification remain required. Beta/planned-specific differences were not present in the source catalog at audit time.
5. **Failure paths:** Web currently uses static synchronous registry imports, so web loading/failure behavior is assessed from the current source, not from a simulated network-backed catalog. Native loading/failure states were source-confirmed but not executed.
6. **Assistant runtime:** Cancellation timing, request-handle behavior, timeout behavior, server error envelopes, network failures, retry behavior, and state retention after screen destruction require runtime validation. Native system font rendering, Dynamic Type, and accessibility behavior were not tested.
7. **Tool detail coverage:** The detail audit covered the shared ToolShell/ToolEngine/backend/result primitives, not every individual engine implementation. Child-engine-specific tabs, result controls, or file-picker differences may remain outside this report.
8. **Contextual AI scope:** Cross-route persistence after destroying/recreating a detail screen was not asserted. The Android detail-screen host/back-stack outside `NativeAiAssistPanel.kt` was not audited, so the contextual-assist navigation conclusion is panel-local.
9. **Information-page rendering:** Static source confirms markdown/LocalizedStringKey link declarations and emphasis intent, but rendered hit targets, wrapping, Dynamic Type, screen-reader semantics, and behavior on devices without a mail app remain unverified. The hard-coded native year currently equals web in 2026; its future-year staleness is the confirmed gap.
10. **No full-parity claim:** A match in one dimension does not imply equivalence of the complete screen. The status labels above deliberately remain Partial or Gap where any material confirmed divergence exists.

## Validation needed

### Priority validation sequence

1. **Responsive visual matrix:** Run web, Android, and iOS checks at widths just below 640, 640–767, 768–1023, 1024–1151, and >=1152 where applicable. Cover Home hero/search/headline caps and scale, Search gutters/width, grids, tool-detail shell, AI assist field hierarchy, Assistant panel/bubbles, and footer columns.
2. **Catalog/search fixture:** Exercise Home and browsing with `media`, `codec`, and `browser`, plus a fixture containing the eight `NativeCopy.isWebRuntimeOnly` tools. Record result IDs, counts, groups, empty states, and decide whether the platform-specific pool is intentional.
3. **Search interaction:** On all three platforms test focus, typing, suggestion visibility, Enter/submit, first-result behavior, no-match, `See more results`, category entry/back, browser history, Android system back, and iOS swipe/navigation back.
4. **Accessibility:** Use VoiceOver, TalkBack, and a browser accessibility tree to verify Home/search labels, suggestion list semantics, detail/backend error announcements, Assistant pending/live semantics and copy/select, AI result sections/copy actions, and information-page mailto hit targets.
5. **State and navigation:** Verify Home draft retention/reset across Home → Search → Home, Home → tool detail → back, and explicit Home actions; Search/Tools URL query restoration versus native state; Assistant tab switching, New chat, leaving/re-entering, and cancellation; information-page visible back versus system back.
6. **Failure and timeout matrix:** Exercise catalog loading/failure/retry, Assistant success/server error/network failure/timeout/Stop/Retry, tool backend errors, AI API 5xx/network/connect/read timeout/cancel, availability refresh, and Android no-mail-handler fallback.
7. **Structured AI results:** Run regex, SQL, JSON, and alt-text cases with non-empty structured sections; compare headings, code/list styling, warnings, character metadata, and per-block versus combined copy affordances.
8. **File contract:** Test image files with valid extensions but empty or incorrect MIME across browser, Android picker, and iOS importer; decide whether extension fallback belongs in web or must be rejected natively.
9. **Persistence and year rollover:** Toggle favorites, open History after relaunch, confirm native recent-tool behavior, verify query/draft policy, and test footer year rollover beyond 2026.
10. **Content/link review:** Verify all legal-page email links, internal references, About emphasis, contact layout, and screen-reader semantics at narrow/wide widths and with Dynamic Type.

## Recommended remediation order

1. **P1 result and interaction contracts:** native/web catalog scope; SearchBox behavior; Home responsive cap/scale; Assistant cancellation and error/timeout normalization; Assistant iOS Outfit; contextual AI structured results; Android information mailto links and return state.
2. **P2 usability/accessibility/resilience:** search semantics and surfaced empty states; global Search geometry; footer layout/count/year; detail recent tools and form surface; Assistant composer/live semantics/retention; AI panel geometry/typography/MIME/error behavior; information footer and no-mail fallback.
3. **P3 consistency:** availability cache refresh and Android About emphasis.
4. **Then execute the validation matrix above before declaring any screen fully equivalent.**


## Implemented after the source audit (commit `242a1d8`, all authoritative CI passed)

The following straightforward, source-confirmed issues have been fixed in the current working tree and guarded by `check:native-ui-parity`:

- Android information-page header back now restores `informationReturnTab`, matching system Back and iOS dismissal behavior.
- Android legal/info paragraphs now render detected email addresses as underlined tappable `mailto:` links; when no mail handler resolves, a visible Toast directs the user to copy the address.
- Android and iOS native footers now derive the copyright year from the runtime calendar rather than hard-coding 2026.

The web/Android, iOS, and Production workflows passed for `242a1d8` (run IDs `37951883099`, `37951882958`, and `37951882864`). Remaining screen audit items listed earlier remain open; these changes do not establish overall parity.


### Follow-up: Assistant cancellation

Android Assistant now passes its `NativeAiClient.RequestHandle` to the active network call and its Stop/New chat actions disconnect the HTTP request before cancelling coroutine UI state. iOS now exposes an accessible `Stop assistant response` action that cancels the active Swift task. The `check:native-ai` guard verifies both platform Stop-to-cancel bindings. Both platform stop changes were pushed in `1a0fd01`; Web/Android, iOS, and Production workflows passed (run IDs `37953311251`, `37953311229`, and `37953311441`).

The next working-tree change aligns iOS Assistant heading, role labels, message body, pending/error/retry text, and composer typography with registered Outfit faces at explicit web-equivalent sizes, applies the canonical `Ask about enV tools or the enV brand…` placeholder, and responds to the regular horizontal size class for the larger heading. Static assertions were added. Geometry, Dynamic Type accessibility, error normalization, and message accessibility/retention remain open pending runtime/device checks.

Another working-tree change aligns Android global Search and Tools search prompts/accessibility labels with `Search tools`, and adds the missing visible `Search tools` heading and web-equivalent description on the iOS Search results surface. Regression assertions were added. Suggestion dropdown/Enter behavior, result-pool scope, and responsive search geometry remain open.

The current working tree also aligns Android and iOS Home's 768-point inner hero/search cap, the 142×56 / 163×64 hero logo breakpoint, 64 / 72 search height, and Home-to-Trending spacing/heading gaps with the web source. `check:native-ui-parity` covers the explicit source values. Screenshot/device validation is still needed, particularly iPad's coarse `regular` size-class mapping to the web 640-pixel breakpoint.

Home Search on both native platforms now has an explicit `Search tools` field label and `Search all tools` action; Android no-match results use a surfaced card and both platforms preserve the web's `See more results` action even when the suggestions are empty. The native UI guard checks those branches. TalkBack/VoiceOver interaction and screenshot comparison remain runtime checks.

## Latest verified follow-up (`c9c2db2`)

- Android contextual AI textarea/image/audio inputs span the full row at the wide breakpoint. Android and iOS render regex, SQL, JSON, and image alt-text results in labeled, copyable sections; the suggested-regex disclaimer, SQL warnings/performance notes, JSON structure/issues, alt-text character count, and OCR text are represented. Native outer panel corners now use the web 32px token.
- Android SharedPreferences and iOS UserDefaults persist deduplicated, newest-first recent tool IDs, capped at the web's 24 entries, whenever a detail opens. The History screen intentionally remains the web-equivalent placeholder; no visible list is claimed.
- Native Home/footer counts now include active/beta web-only reference records excluded from native execution, so the displayed browser-tool total follows the canonical shared catalog rather than undercounting by those references.
- Focused guards passed: native UI, AI, icons, backend forms (82 document operations), backend dispatch, and related-tool routes (10,000 routes / 504 category fallback cases). `npm test`, `npm run typecheck`, `npm run build`, and `npm run lint` all completed successfully; lint reported 0 errors and 59 warnings.
- Authoritative Android/Web, iOS, and Production workflows all passed for `c9c2db2`. This still does not equal a full visual/accessibility audit: emulator/simulator screenshots, real TalkBack/VoiceOver interaction, persistence-after-relaunch, and the prioritized manual matrix above remain to be executed.
