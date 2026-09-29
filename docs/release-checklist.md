# enV Release Checklist

Use the same verification path locally and in CI before shipping a release.

## Required

```bash
npm ci --no-audit --no-fund
npm run verify
```

`npm run verify` checks catalog integrity, calculator and converter coverage, developer-tool status, text/date-time audits, the complete automated test suite, TypeScript, ESLint, and the production build.

## Deployment environment

- Use Node 22.x.
- Use `npm ci` from the committed lockfile.
- Configure production environment variables explicitly; do not copy local `.enV/app-env.json` assumptions into production.
- If authentication is required, set `VITE_AUTH_ENABLED=true` in the production environment.
- Never place secrets in `VITE_*` variables because Vite exposes them to browser code.
- Keep the security headers and immutable asset caching in `vercel.json`.

## Before release

1. Run `npm run verify`.
2. Review the catalog counts and any newly Active tools.
3. Confirm planned tools are not represented as functional UI.
4. Test changed media workflows with representative files.
5. Review the generated production bundle after a successful build.
6. Deploy only the committed source and lockfile; do not commit `node_modules` or build output.

## CI

`.github/workflows/production-check.yml` runs the same verification command for pushes to `main`/`master` and pull requests.
