import { createEnv } from "@t3-oss/env-nextjs"
import { z } from "zod"

/**
 * This app is the process that actually runs, so this is where `.env` is read
 * — including the variables `@packages/db` and `@packages/auth` validate on
 * their own side. Those packages are imported into this process; they are not
 * processes themselves, and a `.env` beside them would never be opened.
 * See docs/architecture.md S9.
 */
export const env = createEnv({
  server: {
    DATABASE_URL: z.url(),
    BETTER_AUTH_SECRET: z.string().min(32),
    BETTER_AUTH_URL: z.url(),
  },

  // Nothing here yet. Anything added becomes readable by anyone who opens
  // devtools, so a value belongs here only if it is safe to publish.
  client: {},

  // Next.js inlines `process.env.NEXT_PUBLIC_*` at build time rather than
  // exposing the object, so client variables have to be listed one by one.
  experimental__runtimeEnv: {},
})
