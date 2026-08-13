// The Better Auth instance itself. Deliberately free of `import "server-only"`:
// the schema generator loads this file with a plain import and refuses to run
// when that marker is present. `server.ts` adds the marker back for everyone
// else, and this path is absent from the package's `exports` map so nothing
// outside the package can reach around it.

import { drizzleAdapter } from "@better-auth/drizzle-adapter"
import { betterAuth } from "better-auth"

import { env } from "@packages/auth/env"
import { db, schema } from "@packages/db"

export const auth = betterAuth({
  secret: env.BETTER_AUTH_SECRET,
  baseURL: env.BETTER_AUTH_URL,

  database: drizzleAdapter(db, {
    provider: "pg",
    schema,

    // 🚫 Never add `experimental: { joins: true }` here. It is the one adapter
    // option that reaches for `db.query`, an API this repo's Drizzle version
    // removed. Everything else the adapter uses exists in v1 — see
    // docs/setup-plan.md C10.
  }),

  emailAndPassword: {
    enabled: true,
  },
})

export type Auth = typeof auth
export type Session = typeof auth.$Infer.Session
