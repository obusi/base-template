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

  // Listed one by one rather than handed `process.env`, because Next.js inlines
  // `process.env.NEXT_PUBLIC_*` at build time instead of exposing the object.
  //
  // `POSTGRES_URL` is the name Supabase's Vercel integration uses for the
  // database it gives a preview deployment, one per git branch. That value is
  // minted per branch and exists nowhere a person could copy it from, so
  // reading it here is what makes a preview deployment have a database at all.
  // `DATABASE_URL` wins wherever it is set, which is everywhere else.
  // `packages/db` reads the same pair on its own side — see architecture S9.
  runtimeEnv: {
    DATABASE_URL: process.env.DATABASE_URL || process.env.POSTGRES_URL,
    BETTER_AUTH_SECRET: process.env.BETTER_AUTH_SECRET,
    BETTER_AUTH_URL: process.env.BETTER_AUTH_URL,
  },
})
