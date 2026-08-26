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
//
// **Why it retries.** Supabase writes the branch's connection string into
// Vercel and asks for a build in the same breath, and the database is not
// always ready to accept it yet: the build then dies on `28P01 password
// authentication failed`, a minute after the credentials were minted. Same
// commit, same settings, roughly half the builds — which is the shape of a
// race, not of a misconfiguration. Waiting is the whole fix. A build that
// would have succeeded anyway pays nothing, because the first attempt returns.
//
// If it ever exhausts every attempt, that is worth reading as a result rather
// than as noise: five minutes is long enough that the credentials are simply
// wrong, and the answer is somewhere in the Supabase integration rather than
// in here.

import { setTimeout as sleep } from "node:timers/promises"
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

// One attempt, then five retries a minute apart. A minute because the wait is
// for another service to finish provisioning, which no shorter backoff would
// shorten.
const ATTEMPTS = 6
const RETRY_DELAY_MS = 60_000

// Both halves of the race look different from Postgres. `28P01` is the one
// actually seen: the database answered and rejected the password. The
// connection codes are postgres-js's own, for the case where the host is not
// listening yet. Anything else — a bad migration, a table that already exists —
// is a real failure that retrying only makes slower.
const RETRYABLE = new Set([
  "28P01", // password authentication failed
  "28000", // invalid authorization specification
  "CONNECT_TIMEOUT",
  "CONNECTION_CLOSED",
  "CONNECTION_REFUSED",
  "ECONNREFUSED",
  "ECONNRESET",
  "ENOTFOUND",
  "ETIMEDOUT",
])

// Drizzle wraps the driver's error, so the code is one or more `cause` links
// down rather than on the error handed to the catch block.
function retryableCode(error: unknown): string | undefined {
  let current: unknown = error
  while (current instanceof Error) {
    const { code } = current as { code?: unknown }
    if (typeof code === "string" && RETRYABLE.has(code)) return code
    current = current.cause
  }
  return undefined
}

console.log("db:deploy: applying migrations to this preview's database")

for (let attempt = 1; attempt <= ATTEMPTS; attempt++) {
  // A fresh client per attempt: one that failed to authenticate has nothing
  // worth reusing, and `prepare: false` matters for the same reason
  // `connection/client.ts` sets it — on Vercel this URL is Supabase's
  // transaction-mode pooler, which rejects prepared statements.
  const client = postgres(url, { prepare: false, max: 1 })

  let failure: unknown

  try {
    await migrate(drizzle({ client }), { migrationsFolder: MIGRATIONS_FOLDER })
  } catch (error) {
    failure = error
  } finally {
    // Closed before the wait, not after it, so nothing is held open for a
    // minute over a connection that has already been refused.
    await client.end()
  }

  if (!failure) {
    console.log("db:deploy: done")
    break
  }

  const code = retryableCode(failure)

  if (!code || attempt === ATTEMPTS) {
    console.error(
      code
        ? `db:deploy: still failing with ${code} after ${ATTEMPTS} attempts ` +
            `over ${((ATTEMPTS - 1) * RETRY_DELAY_MS) / 60_000} minutes. ` +
            `This is no longer a matter of waiting — check that the Supabase ` +
            `integration is writing this branch's own credentials.`
        : "db:deploy: migration failed."
    )
    throw failure
  }

  console.log(
    `db:deploy: attempt ${attempt} of ${ATTEMPTS} failed with ${code} — the ` +
      `branch database is likely still being provisioned. Retrying in ` +
      `${RETRY_DELAY_MS / 1000}s.`
  )
  await sleep(RETRY_DELAY_MS)
}
