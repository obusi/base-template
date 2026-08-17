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

    // Better Auth can infer this from the incoming request, but its own docs
    // advise against relying on that: a forged Host header would then decide
    // where password-reset links point.
    BETTER_AUTH_URL: z.url(),

    // Optional, and the only switch for password-reset email. Absent, the link
    // goes to the server log instead — fine while developing, wrong once
    // deployed, and `config.ts` says so at the point it decides. See
    // docs/architecture.md S4.
    RESEND_API_KEY: z.string().optional(),

    // Only used when the key above is set. Resend rejects a `from` on a domain
    // it has not verified, so the default is its own sandbox address, which
    // delivers to the account owner and nobody else.
    RESEND_FROM: z.string().default("onboarding@resend.dev"),
  },
  runtimeEnv: process.env,
  emptyStringAsUndefined: true,
})
