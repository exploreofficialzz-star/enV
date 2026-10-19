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
BETTER_AUTH_URL=https://en-v.vercel.app
BETTER_AUTH_SECRET=<server-only high-entropy secret>
DATABASE_URL=<persistent PostgreSQL connection string>
RESEND_API_KEY=<server-only Resend key>
AUTH_EMAIL_FROM=<verified sender, for example enV <auth@your-verified-domain.example>>
# Or configure all three OIDC values instead of enabling email/password.
AUTH_OAUTH_ISSUER=<HTTPS issuer URL>
AUTH_OAUTH_CLIENT_ID=<client ID>
AUTH_OAUTH_CLIENT_SECRET=<server-only client secret>
```

Email/password requires both `AUTH_EMAIL_PASSWORD_ENABLED=true` (server-side) and `VITE_AUTH_EMAIL_ENABLED=true` (public UI build flag), along with a verified transactional email sender. OAuth issuer/client settings must be supplied together. Production auth fails closed if durable Postgres, a secure canonical origin, or the Better Auth secret is missing. Apply `migrations/0001_auth.sql` using `npm run db:migrate` as an explicit release operation before enabling auth.

Do not put secrets in `.enV/app-env.json` or any `VITE_` variable. `VITE_` values are browser-visible by design. Email verification, password reset, OIDC callbacks, account recovery, and session revocation still require staging sign-off before enabling a public launch.

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
