// `pnpm --filter @packages/db db:deploy` — run by a deployment's build, never
// by a person. `apps/web/vercel.json` puts it in front of the build command.
//
// It exists for one situation: Supabase Branching hands every pull request a
// database of its own, and hands it over empty. Nothing else will ever put a
// schema in it — the connection string is minted per branch and exists nowhere
// a person could copy it from — so either the build applies the migrations or
// that database stays unusable for the life of the pull request.
//
// **Preview only, deliberately.** A preview database is created for one pull
// request and destroyed with it, so applying every migration from scratch is
// free to get wrong. Production holds data that a bad migration cannot
// un-break, and deciding to migrate it automatically is a separate question
// about ordering, rollback, and expand/contract — not something to inherit as
// a side effect of wanting working previews. Until that question is answered
// on purpose, production stays a hand-run `db:migrate`.
//
// One thing to know if that changes: drizzle-kit takes no advisory lock, so two
// builds against one database can interleave. Harmless here, where each pull
// request has a database to itself, and not harmless on a shared one.

import { fileURLToPath } from "node:url"

import { drizzle } from "drizzle-orm/postgres-js"
import { migrate } from "drizzle-orm/postgres-js/migrator"
import postgres from "postgres"

// Resolved from this file rather than the working directory, which is whatever
// the build command happened to start in. One level up: scripts/ -> the package
// root that holds drizzle/.
const MIGRATIONS_FOLDER = fileURLToPath(new URL("../drizzle", import.meta.url))

const environment = process.env.VERCEL_ENV

if (environment !== "preview") {
  console.log(
    `db:deploy: VERCEL_ENV is ${environment ?? "unset"}, not "preview" — ` +
      `nothing to do.`
  )
  process.exit(0)
}

// Read from `process.env` rather than through `src/connection/env.ts`, for the
// same reason `check.ts` does: `node scripts/deploy.ts` resolves imports the
// way Node does, which needs a file extension, and an import ending in `.ts`
// does not typecheck under this repo's module resolution. Nothing under
// `scripts/` imports from `src/`.
//
// The fallback mirrors the one in `src/connection/env.ts` and in
// `apps/web/env.ts`; the three have to stay in step. `POSTGRES_URL` is what
// Supabase's Vercel integration calls this pull request's database.
const url = process.env.DATABASE_URL || process.env.POSTGRES_URL

if (!url) {
  console.error(
    "db:deploy: this is a preview deployment, but neither DATABASE_URL nor " +
      "POSTGRES_URL is set, so there is no database to migrate. Check that " +
      "the Supabase integration is connected to this Vercel project."
  )
  process.exit(1)
}

// `prepare: false` for the same reason `connection/client.ts` sets it: on
// Vercel this URL is Supabase's transaction-mode pooler, which rejects
// prepared statements.
const client = postgres(url, { prepare: false, max: 1 })

console.log("db:deploy: applying migrations to this preview's database")

try {
  await migrate(drizzle({ client }), { migrationsFolder: MIGRATIONS_FOLDER })
  console.log("db:deploy: done")
} finally {
  await client.end()
}
