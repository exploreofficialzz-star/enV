# enV AI infrastructure

enV's tools are deterministic and local-first. This layer adds **optional** AI where it genuinely helps, through one server-side core that routes each request to the cheapest suitable provider and falls back when one fails. Every deterministic tool keeps working with AI off, unconfigured, or down.

- Browsers only ever call same-origin `/api/ai/*`. Provider keys, provider URLs and model ids never reach the client.
- Categories and tool UIs ask for a **task** (for example `creator.caption.generate`). They never name a provider or model.
- Nothing is enabled by default except the code: with no provider key set, AI panels do not render.

## How a request flows

```
Tool page ──(panel shows only if /api/ai/status says the task is usable)
   │  POST /api/ai/run { task, input }
   ▼
handler.ts      same-origin + JSON + size cap → optional sign-in → per-session / per-IP / daily limits
   ▼
core/execute.ts task lookup → input validation → untrusted-content prompt → cache / in-flight de-dupe
   │            → routing/router.ts picks candidate models (registry + config + health + budget)
   │            → provider adapter call with timeout → validate output (1 repair) → next candidate on failure
   ▼
providers/*     the only code that knows a provider's HTTP API
```

Folder map (`src/lib/ai/`):

| Path | Role | Runs in |
| --- | --- | --- |
| `types.ts`, `errors.ts`, `contracts.ts`, `features.ts`, `subtitles.ts` | Shared types, typed errors, task ids and limits, tool→AI bindings, SRT/VTT formatting | browser + server |
| `client/` | `runAiTask`, availability check, React hooks, image/audio preparation | browser |
| `server/config.ts` | The only reader of environment variables. Wraps keys in `SecretString` | server |
| `server/registry/models.ts` | Model registry (capabilities, cost, limits, privacy flags) | server |
| `server/tasks/` | Task definitions: input schema, prompt, output schema, post-processing | server |
| `server/routing/router.ts` | Capability- and cost-based candidate selection | server |
| `server/core/` | Execution, health/circuit breaker, usage ledger, rate limiter, cache | server |
| `server/providers/` | OpenRouter, Groq (chat + Whisper), Gemini, mock | server |
| `server/handler.ts`, `runtime.ts` | HTTP handlers and lazy singleton; mounted by `server/routes/api/ai/*` | server |
| `components/ai/` | `AiAssistPanel` (mounted in `ToolShell`) and result views | browser |

`npm run check:ai` enforces the browser/server boundary (see Testing).

## AI features that ship

| Task id | Tools that offer it | Capability | Privacy | Cached | Rate units |
| --- | --- | --- | --- | --- | --- |
| `creator.caption.generate` | Instagram, TikTok, X, YouTube, LinkedIn and Facebook Caption Generators (Creators); Caption Generator (AI) | structured text | standard | no (regenerate gives new ideas) | 1 |
| `creator.title.generate` | YouTube, TikTok, Instagram and Podcast Title Generators (Creators); Title Generator (AI) | structured text | standard | no | 1 |
| `developer.regex.explain` | Regex Tester | structured text | standard | 15 min | 1 |
| `developer.sql.explain` | SQL Formatter | structured text | standard | 15 min | 1 |
| `developer.json.explain` | JSON Validator | structured text | **sensitive** | never | 2 |
| `image.alt.generate` | Alt Text Helper (AI; image upload) | vision | **sensitive** | never | 3 |
| `video.transcript.generate` | Extract Audio from Video (Videos; audio upload, ≤ ~2.8 MB) | speech-to-text | **sensitive** | never | 5 |

Bindings are in `features.ts` and are checked against the catalog: every bound tool must exist and be `active`. Planned tools (for example "Video to Subtitles") stay *Coming Soon*; no AI button was added to them.

Honest behaviour notes:

- The regex "suggested examples" are the model's guesses and are labelled unverified. The server never executes a user regex (it is only compiled to reject invalid patterns). SQL is never executed.
- JSON, SQL and regex input has credential-shaped strings (API keys, JWTs, `password=`/`token=` values, private keys) replaced with `[REDACTED]` before sending. This is best-effort; the UI tells people not to paste real personal data.
- Images are shrunk and re-encoded to JPEG in the browser (which also drops EXIF) before upload. The server additionally checks the file signature against the declared type.
- Audio is limited by the platform's request-body cap (see Deployment), not by the provider. Longer recordings need an asynchronous path that does not exist yet.

## Providers and models

Registry rows were checked against provider documentation on **2026-09-30**. Prices and model lists change: re-verify before relying on them, and record what you checked in the row's `notes`.

| Provider | Model id | Used for | Cost class | List price | Sensitive tasks |
| --- | --- | --- | --- | --- | --- |
| Groq | `openai/gpt-oss-20b` | text, structured (strict schema) | LOW | $0.075 in / $0.30 out per 1M tokens | yes |
| Groq | `openai/gpt-oss-120b` | text, structured (strict schema) | LOW | $0.15 / $0.60 | yes |
| Groq | `whisper-large-v3-turbo` | speech-to-text | LOW | $0.04 per audio hour | yes |
| Groq | `whisper-large-v3` | speech-to-text | LOW | $0.111 per audio hour | yes |
| OpenRouter | `openai/gpt-oss-20b:free` | text, structured | FREE | $0 (rate limited; providers may log) | **no** |
| OpenRouter | `openai/gpt-oss-20b` | text, structured | LOW | about $0.02 / $0.10 (varies by upstream) | yes (`data_collection: deny` is sent) |
| Gemini | `gemini-3.8-flash` | vision, structured | STANDARD | $0.75 / $3.75 through 2026-12-31, then $1.50 / $7.50 | only with `AI_GEMINI_TIER=paid` |

Cost classes come from list price: FREE = zero; LOW ≤ $1 per 1M tokens (input + output) or ≤ $0.25 per audio hour; STANDARD ≤ $10; above that PREMIUM. Gemini's date-based price change is encoded (`pricingUntil`).

Routing order among eligible models: healthy before recently-failing, then **cheapest cost class**, then the task's preference (quality or speed), then `AI_PROVIDER_ORDER`, then model priority. Eligibility removes models that are unconfigured, disabled, lack the capability or structured-output support, exceed `AI_MAX_COST_CLASS`, are paid while the daily budget is spent, are not allowed for sensitive input, have an open circuit, or cannot take the file size.

Reasoning models spend hidden tokens, so the core adds output headroom (`outputHeadroomTokens`) to each request. Gemini structured output uses `responseMimeType` + `responseJsonSchema` and a conservative schema subset; the task's own schema still validates the result.

Only one vision model is registered, so vision has no provider fallback. Add a verified vision model to the registry to change that.

## Environment variables

All optional. See `.env.example`. Never prefix a secret with `VITE_`.

| Variable | Default | Meaning |
| --- | --- | --- |
| `OPENROUTER_API_KEY`, `GROQ_API_KEY`, `GEMINI_API_KEY` | unset | Provider keys (server only). `GOOGLE_AI_API_KEY` is accepted as an alias for `GEMINI_API_KEY`. |
| `GOOGLE_AI_API_KEY` | unset | Alias for `GEMINI_API_KEY`. |
| `AI_ENABLED` | `true` | Master switch. |
| `AI_PROVIDER_ORDER` | `groq,openrouter,gemini` | Providers allowed to be used and the tie-break order. `mock` is accepted outside production for local development. |
| `AI_MAX_COST_CLASS` | `LOW` | Highest cost class allowed (`FREE`, `LOW`, `STANDARD`, `PREMIUM`). Vision needs `STANDARD`. |
| `AI_GEMINI_TIER` | unknown | `paid` if billing is on for the Gemini project; `free` otherwise. Unknown is treated as free for privacy routing. |
| `AI_SENSITIVE_ALLOW_FREE_TIER` | `false` | Accept routing sensitive tasks to free-tier / may-train models. |
| `AI_DAILY_BUDGET_USD` | `2` | Estimated daily spend after which paid models stop being used. `0` means free models only. |
| `AI_DAILY_REQUEST_LIMIT` | `2000` | Deployment-wide daily request failsafe (uncached requests). |
| `AI_RATE_LIMIT_PER_MINUTE` | `12` | Per anonymous session, in task cost units. Signed-in users get double. |
| `AI_RATE_LIMIT_PER_IP_PER_MINUTE` | 5× the session limit | Per-IP backstop in task cost units (and twice this many raw requests, valid or not, are allowed before the body is read). Raise it if many users share one address, for example carrier-grade NAT on mobile networks. |
| `AI_RATE_LIMIT_PER_DAY` | `150` | Per session per UTC day, in task cost units. |
| `AI_DISABLED_FEATURES` | none | Task ids or prefixes to switch off (`developer.`, `image.alt.generate`). |
| `AI_DISABLED_MODELS` | none | `provider:model` ids to switch off, for example after a deprecation. |
| `AI_REQUIRE_AUTH` | `false` | Require a signed-in user. Needs `VITE_AUTH_ENABLED=true`; the audit fails if auth is off. |
| `BETTER_AUTH_URL` | unset | Existing auth variable, reused only to find your app's `/api/auth/get-session` when sign-in is enabled. In production it must be set for AI sign-in checks to work; the request host is not trusted. |
| `AI_CACHE_ENABLED` | `true` | In-memory result cache for deterministic standard tasks. |
| `AI_DEBUG` | `false` | Non-production only: provider/model/latency in responses and per-attempt logs. |
| `AI_ADMIN_TOKEN` | unset | Enables `GET /api/ai/diagnostics`. 24+ characters. Unset means the endpoint answers 404. |
| `AI_SESSION_SECRET` | random per instance | Signs anonymous session cookies. Set it in production. |

Invalid values never crash the app: they fall back to the default and are reported by `npm run check:ai` and the diagnostics endpoint.

## Deploying on Vercel

0. Run `npm ci && npm run verify` (build, type-check, lint, tests and the AI audit) on the branch you will deploy.
1. Add the keys you want (any subset) under Project Settings → Environment Variables, for the right environments. Do not use a `VITE_` prefix.
2. Set spend limits **at each provider** (OpenRouter key credit limit, Groq/Gemini project quotas). The in-app budget and rate limits are counters inside one warm function instance, so with several instances the real total can be higher. Provider-side limits are the hard backstop.
3. For alt text, set `AI_MAX_COST_CLASS=STANDARD` and, if Gemini billing is enabled, `AI_GEMINI_TIER=paid` (otherwise sensitive image input is not routed to Gemini, by design).
4. Set `AI_SESSION_SECRET` (long random) so per-session limits survive cold starts.
5. Deploy, then run the smoke test below.

Check the project's function max duration (Project Settings → Functions): it should be at least 60 seconds, because speech and vision tasks may run that long. With Fluid Compute the default is 300 seconds; older projects without it default to far less, and requests would be cut off.

Platform facts that shaped the design: Vercel limits function request bodies to 4.5 MB, so the API caps bodies at 4,000,000 bytes (about 2.4 MB of image or 2.8 MB of audio after base64). `vercel.json` installs with `--omit=dev`, so `zod` must stay in `dependencies` (the audit checks this). Task deadlines are 30 s (text), 45 s (vision) and 60 s (speech), well inside function limits.

**Smoke test** (replace the host):

```sh
curl -s https://YOUR_HOST/api/ai/status
curl -s -X POST https://YOUR_HOST/api/ai/run -H 'content-type: application/json' \
  -d '{"task":"creator.title.generate","input":{"topic":"how to learn guitar fast"}}'
# with AI_ADMIN_TOKEN set:
curl -s https://YOUR_HOST/api/ai/diagnostics -H "authorization: Bearer $AI_ADMIN_TOKEN"
```

`diagnostics` lists, per task, which models are candidates and why others were rejected (for example `cost-class-exceeds-limit`, `privacy-not-allowed`, `circuit-open`), plus circuit state, today's estimated spend and registry problems. It never returns keys or content.

Local development without keys: `AI_PROVIDER_ORDER=mock npm run dev` serves deterministic fake output so you can see every panel. The mock provider is dropped in production (`VERCEL=1` or `NODE_ENV=production`).

## Security model

- **Secrets:** read only in `server/config.ts`, wrapped in `SecretString` (prints `[REDACTED]` through `JSON.stringify`, `console.log` and string conversion). Adapters send keys in headers only (Gemini's key is never in the URL). Error messages never include provider response bodies.
- **Same-origin only:** the API sets no CORS headers, requires `application/json`, and refuses requests whose `Origin` or `Sec-Fetch-Site` is cross-site. Non-browser clients (curl) are still rate limited.
- **Sign-in (optional):** when auth is enabled the handler asks your app's own `/api/auth/get-session` (cookie forwarded, 3 s timeout) who the caller is; any failure counts as signed out. It deliberately does not import the app's auth or database modules.
- **Abuse controls (layered):** a raw per-IP request counter that runs *before* the body is read or parsed (so garbage and oversized requests are not free); body cap; per-session and per-day limits weighted by task cost; a per-IP per-minute backstop (IP is hashed in memory) so clearing cookies does not reset limits; a deployment-wide daily request and spend failsafe; double-click de-duplication; optional sign-in (`AI_REQUIRE_AUTH`). Anonymous sessions use a signed `HttpOnly` cookie so people behind shared mobile-carrier IPs are not throttled as one user.
- **Prompt injection:** user content is only ever placed inside random per-request delimiters in the *user* message; the system prompt contains no user text; inputs are validated and cleaned (control, bidi and zero-width characters removed); the client cannot choose provider, model, limits or prompt; output must match a strict schema and is rejected if it echoes the delimiter or guard text. Output is rendered as plain text (never HTML or markdown).
- **Logging:** structured, content-free events (task, provider, model, status, latency, tokens, estimated cost). There is no field for prompts, inputs, outputs, file names or keys. Nothing is stored server-side beyond in-memory counters and the 15-minute cache of non-sensitive explanations.
- **Client IP trust:** per-IP limits use `x-vercel-forwarded-for`, then `x-forwarded-for`, then `x-real-ip`. On Vercel the platform sets these, so they are reliable. Behind a different proxy, make sure it overwrites (not appends to) the header, otherwise clients can spoof it; session limits, the daily request cap and the spend failsafe still apply.
- **Client env file:** `.enV/app-env.json` is part of the *browser* environment. Never put provider keys there; `check:ai` fails if it holds anything but `VITE_` values.
- **Cached status:** `GET /api/ai/status` is cacheable by the platform CDN for 30 seconds (`s-maxage`), because it only reports which tasks are available. Every other AI response is `no-store`.
- **What is not covered:** counters are per instance, not global; a determined attacker with many IPs can still consume the daily failsafe (the failsafe then stops paid spend, and provider-side caps bound the rest); providers' own data policies apply to what you send them.

## Privacy

AI is never invoked on page load. Text goes to a provider only after the person presses the button, with a standing notice on every panel; file and JSON inputs additionally require ticking a consent box. Sensitive tasks (JSON, images, audio) are routed only to models marked `sensitiveOk` unless you opt in with `AI_SENSITIVE_ALLOW_FREE_TIER`. Free tiers are treated as possibly logged or used for training. Check each provider's current terms before enabling AI for regulated data.

## Provider terms and free tiers

Fallback exists for reliability and cost control. It is **not** a way to get around provider limits: the code never rotates accounts or keys, never retries a rate-limited model before its cool-down, and sends each key only to its own provider. Free tiers can change or disappear; the registry marks them (`free`, `sensitiveOk: false`) so they are only used where appropriate, and the budget guard keeps working if they vanish. No per-model free-tier quotas are pre-filled in the registry because they were not verified; add `quota` to a row if you want a local ceiling. Read each provider's current terms before launch.

## Capability registry

Capabilities (`TEXT_GENERATION`, `STRUCTURED_TEXT`, `VISION_ANALYSIS`, `SPEECH_TO_TEXT`) are a typed list in `types.ts`; each model row declares what it supports and each adapter confirms with `supports()`. `GET /api/ai/diagnostics` includes a `capabilities` table (all models per capability, and which are usable on this deployment right now). Vision currently has one provider and one model; speech-to-text has one provider and two models. Everything else has at least two providers. Tasks without a cross-provider fallback are listed as warnings by `npm run check:ai`.

## Failure behaviour

Provider errors are normalized to typed codes (`AI_RATE_LIMITED`, `AI_PROVIDER_TIMEOUT`, `AI_ALL_PROVIDERS_FAILED`, `AI_OUTPUT_VALIDATION_FAILED`, …). The browser receives only `{ code, message, retryable, retryAfterSeconds? }` with a generic message. Retries: one transient retry only when no other candidate remains; one repair attempt for invalid structured output; at most four provider calls per request; failing models go behind healthy ones and open a circuit after repeated failures (30 s; 10 min for auth errors). If every route is down, the panel shows a short message and the local tool still works.

## Testing

```sh
npm run check:ai                                              # static audit (boundary, secrets, registries, docs, wiring)
node --experimental-strip-types --test 'src/lib/ai/**/*.test.ts'   # unit and contract tests (also part of `npm test`)
```

Tests use fake keys and mocked `fetch`; no network or real provider is touched. They cover config parsing, registry and capability validity, routing, provider request/response contracts and error mapping, fallback, timeouts, cancellation, circuit breaking, caching, de-duplication, limits and the pre-body flood guard, prompt framing and redaction, HTTP handler behaviour, the client, and end-to-end runs through the real adapters against a fake network (including key isolation per provider host). Live provider calls are not part of CI: run the smoke test once per deployment.

**Prompt versioning:** each task has a `version`, returned to callers as `promptVersion`. `tasks/prompts.test.ts` hashes every task's prompt and output schema against `tasks/prompt-snapshots.json`; if you change a prompt or schema without bumping the version, the test fails. After a deliberate change: bump the task's `version`, then run `UPDATE_AI_PROMPT_SNAPSHOTS=1 node --experimental-strip-types --test src/lib/ai/server/tasks/prompts.test.ts` and commit the updated snapshot.

## Extending

- **New model on an existing provider:** add a row to `registry/models.ts` (verify price, limits, structured-output support first; fill `notes`). `npm run check:ai` validates it.
- **New provider:** add an adapter in `server/providers/` implementing `ProviderAdapter`, register it in `providers/index.ts`, add its id to `PROVIDER_IDS`, key handling to `config.ts`, models to the registry, contract tests, and the docs/`.env.example`. Nothing in categories or UI changes.
- **New task:** add a file or entry under `server/tasks/` using `defineTask`, add its id and limits to `contracts.ts`, register it in `tasks/index.ts`, add a canonical input to `tasks/prompts.test.ts` and refresh the snapshot, write tests. Keep schemas strict-compatible (closed objects, every property required).
- **New tool binding:** add an entry to `features.ts` for an *active* catalog tool, only where AI materially improves the tool.

## Known limits

Audio over about 2.8 MB is rejected (no async/chunked path yet); there is no streaming; vision has one provider; regex examples are unverified; limits and spend counters are per instance; Gemini's context window and free-tier details in the registry come from third-party listings and should be confirmed.

## Native Android and iOS clients

The native apps do not embed this UI or provider SDKs. Kotlin and Swift call the same `/api/ai/status` and `/api/ai/run` endpoints directly using the repository's `ENV_API_BASE_URL` build setting. The apps store only the signed anonymous `env_ai_sid` session cookie returned by the AI API; provider credentials are never bundled in either app.

The native client implements the same seven task contracts and the 17 tool bindings from `src/lib/ai/features.ts`: creator captions/titles, regex/SQL/JSON explanations, image alt text, and short audio transcription. Images are resized and JPEG-encoded on device before upload, and audio is bounded to the server's documented limit. The deterministic tool remains available offline when an AI provider is unavailable.
