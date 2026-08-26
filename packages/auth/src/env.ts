import { createEnv } from "@t3-oss/env-core"
import { z } from "zod"

export const env = createEnv({
  server: {
    // Better Auth does not fail when this is missing — it falls back to a
    // hard-coded string that is published in its own source. A project could
    // ship to production signing every session with a key the whole world
    // knows. Requiring it here turns that silent default into a startup error.
    BETTER_AUTH_SECRET: z
      .string()
      .min(
        32,
        "must be at least 32 characters — run `openssl rand -base64 32`"
      ),

    // The canonical origin: what email links point at, and the fallback for a
    // request whose host matches nothing below. Better Auth can infer an
    // origin from the incoming request, but its own docs advise against
    // relying on that unguarded, because a forged Host header would then
    // decide where password-reset links point.
    BETTER_AUTH_URL: z.url(),

    // Extra hostnames this deployment also answers to, comma-separated. Only
    // preview deployments need it: their hostname changes with every build, so
    // no single value can name it, and without it Better Auth rejects the
    // sign-in as coming from an untrusted origin.
    //
    // This does not reopen the hole above. The host still comes from the
    // request, but only when it matches a pattern listed here, so keep the
    // patterns narrow: `myapp-*.vercel.app` is this project's deployments,
    // while `*.vercel.app` is every Vercel deployment on earth.
    //
    // Most projects never set this. The two variables below already cover
    // Vercel; this is for a second custom domain, or a host somewhere else.
    BETTER_AUTH_ALLOWED_HOSTS: z.string().optional(),

    // Set by Vercel itself, and the only place a preview deployment's own
    // hostnames are written down — one changes with every build, the other
    // with every branch, so neither can be typed into a settings page.
    //
    // Trusting these is not the same as trusting a `Host` header. The platform
    // stamps them onto the deployment; they do not arrive with the request, so
    // a caller cannot choose what they say. Absent off Vercel, which is why
    // they are optional rather than a platform check.
    VERCEL_URL: z.string().optional(),
    VERCEL_BRANCH_URL: z.string().optional(),

    // Optional, and the only switch for password-reset email. Absent, the link
    // goes to the server log instead — fine while developing, wrong once
    // deployed, and `config.ts` says so at the point it decides. See
    // docs/architecture.md S4.
    RESEND_API_KEY: z.string().optional(),

    // Only used when the key above is set. Resend rejects a `from` on a domain
    // it has not verified, so the default is its own sandbox address, which
    // delivers to the account owner and nobody else.
    RESEND_FROM: z.string().default("onboarding@resend.dev"),

    // Optional, and only take effect together — `config.ts` registers the
    // provider when both are present and omits it otherwise. The button in
    // `social-buttons.tsx` renders either way, and fails loudly on click
    // rather than hiding itself. Get a pair from
    // https://console.cloud.google.com/apis/credentials; the
    // redirect URI to register there is `${BETTER_AUTH_URL}/api/auth/callback/google`.
    GOOGLE_CLIENT_ID: z.string().optional(),
    GOOGLE_CLIENT_SECRET: z.string().optional(),
  },
  runtimeEnv: process.env,
  emptyStringAsUndefined: true,
})
