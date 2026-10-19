/** Server-only switch. Email/password auth must not come up without transactional email delivery. */
export const emailAndPasswordEnabled = process.env.AUTH_EMAIL_PASSWORD_ENABLED === "true";
