// Test helpers for this package and for any package that needs a real
// database in its tests — packages/api imports these too, which is why they
// live in src/ behind the `@packages/db/testing` entry point rather than in a
// test/ folder the exports map cannot reach.

import { fileURLToPath } from "node:url"

import { PGlite } from "@electric-sql/pglite"
import { sql } from "drizzle-orm"
import { drizzle as drizzlePglite } from "drizzle-orm/pglite"
import { migrate as migratePglite } from "drizzle-orm/pglite/migrator"
import { drizzle as drizzlePostgres } from "drizzle-orm/postgres-js"
import { migrate as migratePostgres } from "drizzle-orm/postgres-js/migrator"
import postgres from "postgres"

// Resolved from this file so tests pass regardless of the working directory,
// including when another package imports these helpers.
const MIGRATIONS_FOLDER = fileURLToPath(new URL("../drizzle", import.meta.url))

export type TestDb = Awaited<ReturnType<typeof createTestDb>>

/**
 * A throwaway Postgres for a single test file.
 *
 * Call this once per file in `beforeAll`, not in `beforeEach`. Booting a
 * PGlite instance costs about 1.4s every time — it is a full Postgres, not a
 * cached one — while `resetDb` between tests costs about 6ms. Vitest runs test
 * files in parallel, so the boot cost is paid once per file, in parallel.
 *
 * Setting TEST_DATABASE_URL points the same suite at a real Postgres instead.
 * The tests themselves never change — this is the seam that lets CI check the
 * suite against production-grade Postgres later.
 */
export async function createTestDb() {
  const url = process.env.TEST_DATABASE_URL

  if (url) {
    const db = drizzlePostgres({
      client: postgres(url, { prepare: false, max: 1 }),
    })
    await migratePostgres(db, { migrationsFolder: MIGRATIONS_FOLDER })
    return db
  }

  const db = drizzlePglite({ client: new PGlite() })
  await migratePglite(db, { migrationsFolder: MIGRATIONS_FOLDER })
  return db
}

/**
 * Drop every table in the public schema, returning the database to the state a
 * fresh instance would be in. Roughly 6ms, so it is the cheap way to isolate
 * tests within a file.
 */
export async function resetDb(db: TestDb) {
  await db.execute(sql`
    do $$
    declare r record;
    begin
      for r in (select tablename from pg_tables where schemaname = 'public') loop
        execute 'drop table if exists public.' || quote_ident(r.tablename) || ' cascade';
      end loop;
    end $$;
  `)
}

/**
 * Names of tables in the public schema that do not have row level security
 * enabled. Should always be empty — see docs/architecture.md section 6.
 */
export async function tablesWithoutRLS(db: TestDb): Promise<string[]> {
  const result = await db.execute<{ name: string }>(sql`
    select c.relname as name
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relkind = 'r'
      and c.relrowsecurity = false
    order by c.relname
  `)

  // The two drivers disagree on the result shape: postgres-js returns an
  // array-like RowList, PGlite returns { rows }.
  const rows = Array.isArray(result) ? result : result.rows

  return rows.map((row) => row.name)
}
