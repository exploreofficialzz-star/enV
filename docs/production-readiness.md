# enV production readiness

## Required deployment checks

Run these before a production deployment:

```sh
npm ci --omit=dev --no-audit --no-fund
npm run check:production
npm test
npm run typecheck
npm run lint
npm run build
```

`check:production` is dependency-free and is intended to run early in CI. It validates catalog uniqueness, active-tool dispatcher coverage, package/build configuration, the locked dependency manifest, and the security headers configured for Vercel.

## Authentication

The repository intentionally ships `.enV/app-env.json` with `VITE_AUTH_ENABLED=false` for local development. Production authentication must be selected explicitly in the deployment environment:

```text
VITE_AUTH_ENABLED=true
# For email/password, also set VITE_AUTH_EMAIL_ENABLED=true in the build environment.
AUTH_EMAIL_PASSWORD_ENABLED=true
BETTER_AUTH_URL=https://envtools.store
BETTER_AUTH_SECRET=<server-only high-entropy secret>
DATABASE_URL=<persistent PostgreSQL connection string>
# Choose the credentials required by the providers you enable:
GOOGLE_CLIENT_ID=<Google OAuth client ID>
GOOGLE_CLIENT_SECRET=<server-only Google OAuth client secret>
APPLE_CLIENT_ID=<Apple Services ID>
APPLE_CLIENT_SECRET=<server-only Apple client-secret JWT>
AUTH_OAUTH_ISSUER=<HTTPS OIDC issuer URL, optional>
AUTH_OAUTH_CLIENT_ID=<OIDC client ID, optional>
AUTH_OAUTH_CLIENT_SECRET=<server-only OIDC client secret, optional>
# Required only for email/password; configure a verified sender domain in Resend.
RESEND_API_KEY=<server-only Resend key>
AUTH_EMAIL_FROM=<verified sender, for example enV <auth@your-verified-domain.example>>
```

Email/password requires both `AUTH_EMAIL_PASSWORD_ENABLED=true` (server-side) and `VITE_AUTH_EMAIL_ENABLED=true` (public UI build flag), along with a verified transactional email sender. Google and Apple credentials must be supplied as complete pairs; Apple web sign-in uses a client-secret JWT that must be rotated before expiry. Generic OIDC issuer/client settings must be supplied together. Production auth fails closed if durable Postgres, a secure canonical origin, or the Better Auth secret is missing. Apply `migrations/0001_auth.sql` using `npm run db:migrate` as an explicit release operation before enabling auth.

Do not put secrets in `.enV/app-env.json` or any `VITE_` variable. `VITE_` values are browser-visible by design. Email verification, password reset, OIDC callbacks, account recovery, and session revocation still require staging sign-off before enabling a public launch.

## Processor gateway and media uploads

The Render blueprint is defined in `render.yaml`. Before enabling server-dependent tools in a production deployment:

1. Deploy the processor service and confirm its `/health` endpoint reports ready.
2. Render generates `PROCESSOR_SHARED_SECRET` for the processor service. Copy that exact value into the Vercel server-side `PROCESSOR_SHARED_SECRET` environment setting. The two values must match; do not expose this secret through a `VITE_` variable or commit it.
3. Configure Vercel `MEDIA_PROCESSOR_URL=https://env-q3mq.onrender.com/media`, `URL_MEDIA_PROCESSOR_URL=https://env-q3mq.onrender.com`, and `BACKEND_ALLOWED_ORIGIN=https://envtools.store` for the canonical production site. Keep processor URLs and credentials server-side.
4. Verify media and URL-media health, upload-size rejection, a successful safe test operation, and temporary-upstream-failure handling from the deployed web API.

The Render service has an aggregate request-body limit as well as per-file validation. The web document, image, screenshot, PDF and local OCR handlers enforce a 100 MB combined request-body cap before parsing multipart uploads. The standalone transcription service remains disabled until a supported runtime/model is deployed.

## Security headers

`vercel.json` applies these baseline headers to application responses:

- `X-Content-Type-Options: nosniff`
- `X-Frame-Options: SAMEORIGIN`
- `Referrer-Policy: strict-origin-when-cross-origin`
- `Strict-Transport-Security: max-age=31536000; includeSubDomains`
- `Permissions-Policy: camera=(), geolocation=(), microphone=(self)`

Static `/assets/*` responses receive immutable one-year caching.

## Build validation limitation

The source archive does not include `node_modules`. In restricted environments where the npm registry cannot be reached, `npm ci` cannot materialize the dependency tree and therefore `typecheck`, `lint`, and `build` cannot be executed. A real deployment environment with registry access must run those three commands before release.
