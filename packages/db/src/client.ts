import type { PgAsyncDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core"
import { drizzle } from "drizzle-orm/postgres-js"
import postgres from "postgres"

import { env } from "@packages/db/env"

// Supabase's transaction-mode pooler does not support prepared statements, so
// `prepare: false` is required. Leaving it out produces intermittent runtime
// errors that are hard to attribute.
const client = postgres(env.DATABASE_URL, { prepare: false })

export const db = drizzle({ client })

/**
 * What every consumer should accept, in place of `typeof db`.
 *
 * `typeof db` is specifically a postgres-js database, and the PGlite database
 * the tests run against is a different class — assignable to neither. Both
 * extend `PgAsyncDatabase`, so widening to the shared base is what lets a
 * handler take the real database in production and the throwaway one in a
 * test without changing a line of its body.
 *
 * The query builder is identical across both. Only `.execute()` differs, in
 * the shape of its raw result — see `tableNames` in testing.ts.
 */
export type Database = PgAsyncDatabase<PgQueryResultHKT>

// Fails to compile if the widening above ever stops covering the real client.
const _dbIsADatabase: Database = db
void _dbIsADatabase
