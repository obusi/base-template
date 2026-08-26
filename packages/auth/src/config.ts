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

  /**
   * Turns on "Continue with Google". Injected rather than read from `env`
   * directly, so a test can pass throwaway credentials without a real OAuth
   * client — see `config.test.ts`.
   */
  google?: { clientId: string; clientSecret: string }

  /**
   * Hostnames this instance answers to besides `BETTER_AUTH_URL`'s own, which
   * is always allowed. Wildcards match the way `trustedOrigins` matches them:
   * `myapp-*.vercel.app`.
   *
   * Injected rather than read from `env` directly, for the same reason
   * `google` is — a test can exercise the allowlist without setting a
   * process-wide variable that every other test in the file would then share.
   */
  allowedHosts?: string[]
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
  const canonical = new URL(env.BETTER_AUTH_URL)

  return betterAuth({
    secret: env.BETTER_AUTH_SECRET,

    // An object rather than the plain string it reads like, because a preview
    // deployment's hostname is different on every build and no fixed string
    // can name it. Better Auth then takes the host from the request — but only
    // when it matches `allowedHosts`, which is what keeps a forged Host header
    // from choosing where email links point.
    //
    // With nothing injected this is exactly the old behaviour: the list holds
    // one host, the canonical one, and every other host falls back to the same
    // URL that used to be hard-wired here.
    //
    // `protocol` is pinned from the canonical URL rather than left on its
    // "auto" default, which infers https when no proxy header says otherwise —
    // correct everywhere except localhost, where it would hand out https links
    // to an http server.
    baseURL: {
      allowedHosts: [canonical.host, ...(options.allowedHosts ?? [])],
      fallback: env.BETTER_AUTH_URL,
      protocol: canonical.protocol === "http:" ? "http" : "https",
    },

    database: drizzleAdapter(database, {
      provider: "pg",
      schema,

      // 🚫 Never add `experimental: { joins: true }` here. It is the one
      // adapter option that reaches for `db.query`, an API this repo's Drizzle
      // version removed. Everything else the adapter uses exists in v1 — see
      // docs/architecture.md S10 (C10).
    }),

    // Gives every new user a `profile` row immediately, so `packages/api`
    // never has to treat "no profile yet" as a normal state on the happy
    // path. Fires once per `user` row regardless of how it was created —
    // email/password and Google both insert into `user` before any
    // provider-specific step runs, so one hook covers both.
    //
    // The insert is wrapped rather than left to throw: `create.after` is
    // queued to run *after* the `user` insert's transaction has already
    // committed (see better-auth's `db/with-hooks.ts` and
    // `@better-auth/core`'s `context/transaction.ts`), so a failure here
    // cannot roll the signup back — it would only turn a successful signup
    // into an error response, leaving an orphaned user with no profile and
    // no way to retry (a second signup with the same email just fails).
    // `packages/api`'s `profile.me` creates the row on first read instead,
    // as a fallback for exactly this case.
    databaseHooks: {
      user: {
        create: {
          after: async (createdUser) => {
            try {
              await database
                .insert(schema.profile)
                .values({ userId: createdUser.id })
            } catch (err) {
              console.error(
                `[auth] failed to create profile for user ${createdUser.id}`,
                err
              )
            }
          },
        },
      },
    },

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

    // Absent rather than an empty object when unconfigured: an empty
    // `socialProviders` still makes `/sign-in/social` a live endpoint that
    // answers PROVIDER_NOT_FOUND, and `undefined` is what the test in
    // `config.test.ts` pins as "off until a project configures it".
    socialProviders: options.google ? { google: options.google } : undefined,
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
/**
 * Flattens environment values into a host list: each may hold several hosts
 * separated by commas, because a variable holds one string.
 *
 * Blanks are dropped so that a trailing comma, or the empty value a deployment
 * leaves set rather than deletes, does not become a host matching nothing —
 * which would read like a configured entry while doing exactly as much as no
 * entry at all.
 */
export function toHostList(...values: (string | undefined)[]): string[] {
  return values
    .flatMap((value) => (value ?? "").split(","))
    .map((host) => host.trim())
    .filter(Boolean)
}

export const auth = createAuth(db, {
  // Every hostname this deployment answers to beyond `BETTER_AUTH_URL`'s own.
  //
  // The two Vercel variables are the point of this list. A preview deployment
  // is reachable at two hostnames — one minted per build, one per branch — and
  // both change on their own, so neither can be written into a settings page
  // or matched by a pattern that stays true. Reading what the platform already
  // knows means a custom domain, a renamed project or a different Vercel team
  // costs no edit here, and a fork inherits nothing about the account it came
  // from.
  //
  // `BETTER_AUTH_ALLOWED_HOSTS` covers what Vercel cannot report: a second
  // custom domain, or a host somewhere else entirely. Most projects never set
  // it.
  allowedHosts: toHostList(
    env.BETTER_AUTH_ALLOWED_HOSTS,
    env.VERCEL_URL,
    env.VERCEL_BRANCH_URL
  ),

  sendResetPassword: env.RESEND_API_KEY
    ? resendSender({ apiKey: env.RESEND_API_KEY, from: env.RESEND_FROM })
    : undefined,
  google:
    env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET
      ? {
          clientId: env.GOOGLE_CLIENT_ID,
          clientSecret: env.GOOGLE_CLIENT_SECRET,
        }
      : undefined,
})

export type Auth = ReturnType<typeof createAuth>
export type Session = Auth["$Infer"]["Session"]
