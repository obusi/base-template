// The Better Auth instance itself. Deliberately free of `import "server-only"`:
// the schema generator loads this file with a plain import and refuses to run
// when that marker is present. `server.ts` adds the marker back for everyone
// else, and this path is absent from the package's `exports` map so nothing
// outside the package can reach around it.

import { drizzleAdapter } from "@better-auth/drizzle-adapter"
import { betterAuth } from "better-auth"

import { db, schema, type Database } from "@packages/db"

import { env } from "./env"

/**
 * Takes the database rather than reaching for it, so that a test can hand over
 * a throwaway PGlite instance and sign a real user up against it. Wiring the
 * module-level `db` in directly would make every auth rule this template's
 * consumers add — blocked email domains, lockout after failed attempts, a
 * profile row created on signup — impossible to test without a live Postgres.
 */
export function createAuth(database: Database) {
  return betterAuth({
    secret: env.BETTER_AUTH_SECRET,
    baseURL: env.BETTER_AUTH_URL,

    database: drizzleAdapter(database, {
      provider: "pg",
      schema,

      // 🚫 Never add `experimental: { joins: true }` here. It is the one
      // adapter option that reaches for `db.query`, an API this repo's Drizzle
      // version removed. Everything else the adapter uses exists in v1 — see
      // docs/architecture.md section 11 (C10).
    }),

    emailAndPassword: {
      enabled: true,
    },
  })
}

/**
 * The instance the running application uses. Also what the schema generator
 * reads: `auth generate` needs a concrete export, not a factory.
 */
export const auth = createAuth(db)

export type Auth = ReturnType<typeof createAuth>
export type Session = Auth["$Infer"]["Session"]
