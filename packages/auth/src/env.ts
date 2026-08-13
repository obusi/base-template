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
  },
  runtimeEnv: process.env,
  emptyStringAsUndefined: true,
})
