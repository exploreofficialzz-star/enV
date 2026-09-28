# enV — Browser Toolkit

**Useful tools. One place.** enV is a responsive collection of browser-based tools for everyday calculations, conversions, color and CSS work, QR codes, image tasks, and mockups. Wherever possible, processing happens in the visitor's browser rather than uploading files to a server.

## Requirements

- Node.js 22
- npm

## Local development

```bash
npm ci
npm run dev
```

The development server is available at `http://localhost:8080`.

## Quality checks

```bash
npm test
npm run lint
npm run typecheck
npm run build
```

`npm run build` creates the Vercel/Nitro production output. It deliberately does **not** mutate a database during a Vercel build. Authentication is disabled by default.

## Vercel deployment

The repository is configured for Vercel through the Nitro Vercel preset in `vite.config.ts` and `vercel.json`.

- **Install command:** `npm ci --omit=dev --no-audit --no-fund`
- **Build command:** `npm run build`
- **Node.js:** 22

The production install intentionally omits development-only packages; build-time tooling required by Vite and Nitro is declared in `dependencies`. The Node.js engine is pinned to major version 22.

### Optional authentication

Authentication is off by default. To enable the optional Better Auth integration, configure its production secrets and OAuth broker in Vercel Project Settings, then set `VITE_AUTH_ENABLED=true`:

- `BETTER_AUTH_URL` — canonical HTTPS origin for the deployed application.
- `BETTER_AUTH_SECRET` — high-entropy server-only signing secret.
- `DATABASE_URL` — Postgres connection string, if persistent accounts are required.
- `AUTH_OAUTH_ISSUER`, `AUTH_OAUTH_CLIENT_ID`, `AUTH_OAUTH_CLIENT_SECRET` — credentials for a compatible OAuth broker. The broker must support the authorization, token, and user-info endpoints used by Better Auth.

Apply the committed SQL schema as a separate, deliberate release operation with `npm run db:migrate` after setting `DATABASE_URL`, then enable auth. The build intentionally cannot write to the production database. The same migration files are applied automatically to local PGLite during development.

Never prefix secrets with `VITE_` and never commit their values. Keep preview and production credentials in their respective Vercel environments. OAuth and account creation remain unavailable until the corresponding provider and database settings are configured.

## Project structure

- `src/routes/` — route-level pages
- `src/components/` — application and tool UI
- `src/lib/engines/` — browser-side utility implementations
- `src/data/` — tool catalog and categories
- `public/` — static assets, app icon, and social share card
- `migrations/` — SQL schema migrations
- `scripts/` — build, migration, and quality tooling

## Mobile app

`apps/mobile/` is a separate Expo/React Native app for Android, with iOS support configured for a later native target. It hosts the existing enV web experience in a native WebView so the full tool catalog remains shared; the root web application and its Vercel deployment are unchanged. The generated Android Studio/Gradle/Kotlin project is checked in under `apps/mobile/android/`. GitHub Actions builds and uploads a test APK and an unsigned release AAB. See [`apps/mobile/README.md`](apps/mobile/README.md) for setup, artifact/signing details, the public site URL configuration, and known device-validation requirements.

## Privacy and security

The project does not require an account for its browser-based utilities. Keep file handling local to the browser unless a specific feature clearly requires server processing. Review changes to authentication, migrations, and external network requests carefully.


## Category 20 — AI micro-tools

The AI micro-tools category provides local, deterministic writing templates for titles, captions, bios, product copy, email drafts, prompts, alt text, SEO descriptions, resume bullets, outlines, CTAs, hooks, FAQs, meeting notes, rewriting, shortening, expansion, decision worksheets, ideas, and content briefs. These tools do not call an AI provider or upload user text.
