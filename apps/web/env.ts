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

    // Read here only to decide whether the report form shows a file picker.
    // `packages/api` validates the same pair on its own side and is the only
    // thing that uses their values — this process is the one that opens a
    // `.env`, which is why both appear here too (architecture S9).
    //
    // `server`, never `client`: the service role key bypasses every policy in
    // the Supabase project. Nothing below sends it anywhere.
    SUPABASE_URL: z.url().optional(),
    SUPABASE_SERVICE_ROLE_KEY: z.string().min(1).optional(),

    // Read here only to decide whether the "Continue with Google" button is
    // rendered at all. `packages/auth` validates the same pair and is what
    // actually registers the provider; a button offering a door that cannot
    // open is the thing this presence check removes.
    GOOGLE_CLIENT_ID: z.string().optional(),
    GOOGLE_CLIENT_SECRET: z.string().optional(),

    // The feature flags this deployment turns on, comma-separated. Unset is
    // the normal state, and the only correct one for production.
    //
    // Not validated against the list of flags that exist: this is where the
    // value is read, not where it is understood. `parseFeatures` does that
    // check and warns, which is deliberate — see the note there on why an
    // unrecognised name must not be able to stop the process from starting.
    //
    // `server`, never `client`. The names say what is being built before it
    // ships, and a flag read in the browser is a flag whose guarded code was
    // sent to the browser.
    FEATURES: z.string().optional(),
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
    SUPABASE_URL: process.env.SUPABASE_URL,
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
    GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID,
    GOOGLE_CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET,
    FEATURES: process.env.FEATURES,
  },
})
