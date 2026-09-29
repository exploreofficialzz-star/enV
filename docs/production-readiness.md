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
```

Do not put secrets in `.enV/app-env.json` or any `VITE_` variable. `VITE_` values are browser-visible by design.

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
