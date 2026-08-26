import { createEnv } from "@t3-oss/env-core"
import { z } from "zod"

export const env = createEnv({
  server: {
    DATABASE_URL: z.url(),
  },

  // `POSTGRES_URL` is the name Supabase's Vercel integration uses when it hands
  // a preview deployment the database belonging to that git branch. It is the
  // only place that branch's database is named — the value is minted per branch
  // and never exists anywhere a person could copy it from — so the choice is to
  // read it here or to have no preview database at all.
  //
  // Inert everywhere else. Locally and in production `DATABASE_URL` is set by
  // hand and wins; nothing but that integration ever sets `POSTGRES_URL`.
  runtimeEnv: {
    ...process.env,
    DATABASE_URL: process.env.DATABASE_URL || process.env.POSTGRES_URL,
  },
  emptyStringAsUndefined: true,
})
