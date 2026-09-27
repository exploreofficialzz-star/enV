# enV — Browser Toolkit

## Project overview

enV is a browser-based toolkit built with React, TanStack Start, Vite, and Tailwind CSS. The application is deployed on Vercel. Keep the experience fast, accessible, responsive, and privacy-conscious; the utility tools should run locally in the browser whenever practical.

## Development

- Use Node.js 22 and npm. Install from the lockfile with `npm ci`.
- Start local development with `npm run dev` (port 8080).
- Run `npm test`, `npm run lint`, `npm run typecheck`, and `npm run build` before committing.
- Keep secrets out of source control and browser bundles. Only public configuration belongs in `VITE_` variables.
- Keep deployment-specific configuration in Vercel Project Settings. Do not commit `.env` files.
- Use `src/routes/` for routes, `src/components/` for UI, and `src/lib/` for reusable logic.
- Keep generated route-tree files out of commits; the TanStack/Vite build generates them.

## Vercel deployment

Vercel uses the committed `package-lock.json`, installs production dependencies, and builds with `npm run build`. The app uses the Nitro Vercel preset in `vite.config.ts`. Set `BETTER_AUTH_URL`, `BETTER_AUTH_SECRET`, `DATABASE_URL`, and OAuth credentials in Vercel only when enabling the optional authentication features.

## Quality expectations

- Preserve existing tool behavior unless the task explicitly changes it.
- Validate user input at boundaries and render user-provided content safely.
- Provide clear loading, empty, and error states; avoid silent failures.
- Update tests and this guide when project-wide commands or deployment assumptions change.
