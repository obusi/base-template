// The Better Auth instance itself. Deliberately free of `import "server-only"`:
// the schema generator loads this file with a plain import and refuses to run
// when that marker is present. `server.ts` adds the marker back for everyone
// else, and this path is absent from the package's `exports` map so nothing
// outside the package can reach around it.

import { drizzleAdapter } from "@better-auth/drizzle-adapter"
import { betterAuth } from "better-auth"

import { db, schema, type Database } from "@packages/db"

import { env } from "./env"
import { resendSender } from "./resend"

/** What a password-reset email needs to say. */
export type ResetPasswordRequest = {
  user: { email: string; name: string }
  /** The link to put in the email. Carries the token; do not rebuild it. */
  url: string
  token: string
}

export type AuthOptions = {
  /**
   * Deliver a password-reset link. Injected rather than imported so a test can
   * read the token straight out of it, and so this template ships no opinion
   * about which mail provider a project uses.
   */
  sendResetPassword?: (request: ResetPasswordRequest) => void | Promise<void>
}

/**
 * The fallback when a project has not wired a mailer up yet.
 *
 * Printing the link is genuinely useful in development — it is how you finish
 * a reset without an inbox — and the warning is what stops that convenience
 * from quietly becoming the production behaviour, where the person waiting on
 * the email would never get one and the link would sit in a server log.
 */
function logResetPassword({ user, url }: ResetPasswordRequest) {
  console.warn(
    `[auth] No sendResetPassword configured, so no email was sent to ${user.email}.\n` +
      `[auth] Reset link (development only — pass sendResetPassword to createAuth):\n` +
      `[auth] ${url}`
  )
}

/**
 * Takes the database rather than reaching for it, so that a test can hand over
 * a throwaway PGlite instance and sign a real user up against it. Wiring the
 * module-level `db` in directly would make every auth rule this template's
 * consumers add — blocked email domains, lockout after failed attempts, a
 * profile row created on signup — impossible to test without a live Postgres.
 */
export function createAuth(database: Database, options: AuthOptions = {}) {
  return betterAuth({
    secret: env.BETTER_AUTH_SECRET,
    baseURL: env.BETTER_AUTH_URL,

    database: drizzleAdapter(database, {
      provider: "pg",
      schema,

      // 🚫 Never add `experimental: { joins: true }` here. It is the one
      // adapter option that reaches for `db.query`, an API this repo's Drizzle
      // version removed. Everything else the adapter uses exists in v1 — see
      // docs/architecture.md S10 (C10).
    }),

    emailAndPassword: {
      enabled: true,

      // Without this, `/request-password-reset` refuses with
      // RESET_PASSWORD_DISABLED — the forgot-password page would render fine
      // and fail on submit.
      //
      // Wrapped rather than passed straight through: Better Auth's own type
      // insists on a promise, while a mailer that finishes synchronously — a
      // test collecting tokens, a console logger — is a perfectly good one.
      sendResetPassword: async (data) => {
        await (options.sendResetPassword ?? logResetPassword)(data)
      },

      // Someone resetting a password is often doing it because somebody else
      // has the old one. Leaving that somebody's session alive would defeat
      // the reset, so every session goes.
      revokeSessionsOnPasswordReset: true,
    },
  })
}

/**
 * The instance the running application uses. Also what the schema generator
 * reads: `auth generate` needs a concrete export, not a factory.
 *
 * The mailer is chosen here rather than inside `createAuth`, so that the
 * factory stays free of environment variables and a test can hand it whatever
 * sender it likes.
 */
export const auth = createAuth(db, {
  sendResetPassword: env.RESEND_API_KEY
    ? resendSender({ apiKey: env.RESEND_API_KEY, from: env.RESEND_FROM })
    : undefined,
})

export type Auth = ReturnType<typeof createAuth>
export type Session = Auth["$Infer"]["Session"]
