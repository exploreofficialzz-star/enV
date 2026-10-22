# enV account authentication — production setup and release runbook

This runbook covers the Web Account service built on Better Auth: email/password with transactional email, Google OAuth, and optional Apple web sign-in. The application code is provider-aware, but real accounts are not live until the deployment secrets, database migration, provider callback registrations, and staging checks below are complete.

## 1. Prepare production infrastructure

1. Confirm the canonical site origin is `https://envtools.store`. Use the same exact origin in `BETTER_AUTH_URL`; do not include a route path or trailing slash.
2. Provision a durable PostgreSQL database. Do not use the local PGlite fallback in production.
3. Generate a high-entropy signing secret outside the repository, for example with `openssl rand -base64 48`, and store it as the server-only `BETTER_AUTH_SECRET`.
4. Configure the following production environment variables in Vercel:
   - `VITE_AUTH_ENABLED=true`
   - `BETTER_AUTH_URL=https://envtools.store`
   - `BETTER_AUTH_SECRET=<generated secret>`
   - `DATABASE_URL=<production PostgreSQL connection string>`
5. Keep authentication disabled until at least one identity method is complete. The public `VITE_AUTH_*` variables only control which options are rendered in the browser; they never replace server credentials.

Use a separate database, canonical URL, and OAuth callback registration for a staging deployment. Do not put secrets in Git, `.enV/app-env.json`, client-side code, or any variable prefixed with `VITE_`.

## 2. Connect verification and password-reset email

The application currently sends these transactional messages through Resend, not through a personal Gmail mailbox.

1. Create a Resend API key scoped for sending mail.
2. Verify a domain that you control in Resend. Complete the DNS records Resend asks for, including sender authentication records, and wait until the dashboard reports the domain as verified.
3. Set the following server-only variables:
   - `RESEND_API_KEY=<Resend API key>`
   - `AUTH_EMAIL_FROM=enV <auth@your-verified-domain>` (use an address on the domain Resend actually verified)
   - `AUTH_EMAIL_PASSWORD_ENABLED=true`
4. Set `VITE_AUTH_EMAIL_ENABLED=true` in the matching Vercel build environment.
5. Send real staging tests to inboxes you control. Confirm the From address is correct, messages are delivered, and verification/reset URLs use the canonical HTTPS origin. Check spam placement and Resend delivery events before release.

Sign-up requires email verification. Password-reset links are time-limited; successful password changes revoke existing sessions. Do not enable the email/password UI until both the server and public flags are set and the sender has been verified.

## 3. Connect Google sign-in

1. In Google Cloud Console, create/select the project and configure the OAuth consent screen. Publish/verify the consent configuration as required for your user audience and requested scopes (`openid`, `email`, `profile`).
2. Create an OAuth client ID with application type **Web application**.
3. Add this exact production Authorized redirect URI:

   `https://envtools.store/api/auth/callback/google`

4. Store the resulting client ID in `GOOGLE_CLIENT_ID` and the client secret in server-only `GOOGLE_CLIENT_SECRET`.
5. Set `VITE_AUTH_GOOGLE_ENABLED=true` only after a staging OAuth round trip succeeds.

A mismatched scheme, hostname, path, or trailing URL component can cause `redirect_uri_mismatch`. For a separate staging host, register its exact callback URL as well. Never put the Google client secret into a `VITE_` variable.

## 4. Connect Apple web sign-in (optional)

Apple web sign-in requires an active Apple Developer account and a correctly registered Services ID. The implementation can generate the Apple client-secret JWT on the server so an operator does not need to paste a JWT that silently expires.

1. In Apple Developer → Certificates, Identifiers & Profiles, create/configure an App ID and enable **Sign in with Apple**.
2. Create a **Services ID** for web authentication. Use that Services ID as `APPLE_CLIENT_ID` (not the iOS bundle ID for the web flow).
3. Configure the Services ID with the domain `envtools.store` and this exact Return URL:

   `https://envtools.store/api/auth/callback/apple`

4. Create a Sign in with Apple key. Download its `.p8` private-key file immediately, then record the Key ID and Team ID from the Apple Developer account.
5. Add these as server-only variables in Vercel:
   - `APPLE_CLIENT_ID=<Apple Services ID>`
   - `APPLE_TEAM_ID=<Apple Team ID>`
   - `APPLE_KEY_ID=<Apple key ID>`
   - `APPLE_PRIVATE_KEY=<contents of the .p8 file>`
6. Enable `VITE_AUTH_APPLE_ENABLED=true` only after the domain/return URL are verified and the flow is tested.

The private key can be stored as a multiline secret or with literal `\\n` sequences; the server normalizes escaped newlines before importing it. Treat the key as highly sensitive. If you instead manage your own client-secret JWT, set `APPLE_CLIENT_SECRET` and rotate it before its expiry; Apple does not accept a client-secret JWT with a lifetime longer than six months. Do not set a manually generated token and the generated-key variables together.

## 5. Apply the database migration before enabling accounts

Run the migration as an explicit deployment/release operation against the intended database after checking the target connection:

```sh
DATABASE_URL='<target PostgreSQL connection string>' npm run db:migrate
```

Never run it with an unintended local or production database target. Verify the migration completed successfully, that the Better Auth tables exist, and that the deployed server can open a new session. The Vercel build does not migrate the database automatically.

## 6. Staging release checklist

Keep production provider flags off until these checks pass in staging:

- [ ] A user can create an account with a valid email and password; passwords shorter than the policy minimum are rejected.
- [ ] The verification email arrives from the verified sender; a verified account can sign in; an unverified account cannot.
- [ ] Expired/reused verification links fail safely.
- [ ] A password-reset email arrives; a valid link resets the password; an expired/reused link fails; the new password works and old sessions are revoked.
- [ ] Google sign-in succeeds with both a new account and an existing account, and cancel/error callbacks return the user to a usable screen.
- [ ] Apple web sign-in succeeds if enabled, including the first authorization where Apple supplies profile/email information; verify behavior for Apple's private-relay email addresses.
- [ ] Session cookies are Secure in production, sign-out actually revokes the session, and authenticated routes no longer treat the user as signed in after logout.
- [ ] No secrets, provider tokens, passwords, or email reset/verification tokens are exposed in browser bundles, analytics, or application logs.
- [ ] Run `npm test`, `npm run typecheck`, `npm run lint`, and `npm run build`; inspect the deployment logs and test the deployed origin, not only localhost.
- [ ] Set only the public UI flags corresponding to completed server-side providers. Leave all unused provider flags false.

## 7. Native Android/iOS boundary

The current Android and iOS Account menu entries open `https://envtools.store/account` in the external browser. That allows the user to visit the Web Account page, but it does **not** by itself import the browser's login session into the native app's HTTP client. Native Google ID-token sign-in, native Apple authorization, secure native session storage, and authenticated native API/session restoration require their own platform-native flow and end-to-end tests.

Do not treat account-bound wallet, purchases, or user-specific native features as authenticated merely because sign-in worked in Chrome/Safari. Before claiming full cross-platform account readiness, implement and test that native session bridge independently using Android secure storage and iOS Keychain, with provider secrets remaining on the server.
