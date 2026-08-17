// Test helpers for this package and for any package that needs a real
// database in its tests — packages/api imports these too, which is why they
// sit behind the `@packages/db/testing` entry point in `package.json`'s
// `exports` rather than in a plain `test/` folder nothing outside the package
// could reach.

import { fileURLToPath } from "node:url"

import { PGlite } from "@electric-sql/pglite"
import { sql, type SQL } from "drizzle-orm"
import { drizzle as drizzlePglite } from "drizzle-orm/pglite"
import { migrate as migratePglite } from "drizzle-orm/pglite/migrator"
import { drizzle as drizzlePostgres } from "drizzle-orm/postgres-js"
import { migrate as migratePostgres } from "drizzle-orm/postgres-js/migrator"
import postgres from "postgres"

// Resolved from this file so tests pass regardless of the working directory,
// including when another package imports these helpers. Two levels up:
// src/testing/ -> src/ -> the package root that holds drizzle/.
const MIGRATIONS_FOLDER = fileURLToPath(
  new URL("../../drizzle", import.meta.url)
)

// Spelled out from the two factories rather than from `createTestDb`, whose
// body calls `resetDb(db: TestDb)` — inferring the type from it would be
// circular.
const createPgliteDb = () => drizzlePglite({ client: new PGlite() })
const createPostgresDb = (url: string) =>
  drizzlePostgres({ client: postgres(url, { prepare: false, max: 1 }) })

export type TestDb =
  | ReturnType<typeof createPgliteDb>
  | ReturnType<typeof createPostgresDb>

/**
 * A throwaway Postgres for a single test file.
 *
 * Call this once per file in `beforeAll`, not in `beforeEach`. Booting a
 * PGlite instance costs about 1.4s every time — it is a full Postgres, not a
 * cached one — while `resetDb` between tests costs about 40ms. Vitest runs test
 * files in parallel, so the boot cost is paid once per file, in parallel.
 *
 * Setting TEST_DATABASE_URL points the same suite at a real Postgres instead.
 * The tests themselves never change — this is the seam that lets CI check the
 * suite against production-grade Postgres later.
 */
export async function createTestDb(): Promise<TestDb> {
  const url = process.env.TEST_DATABASE_URL

  if (url) {
    const db = createPostgresDb(url)
    migrators.set(db, () => migratePostgres(db, migrationsConfig))
    await resetDb(db)
    return db
  }

  const db = createPgliteDb()
  migrators.set(db, () => migratePglite(db, migrationsConfig))
  await resetDb(db)
  return db
}

const migrationsConfig = { migrationsFolder: MIGRATIONS_FOLDER }

// `migrate` comes in one flavour per driver and the two are not
// interchangeable, while a `db.$client instanceof PGlite` check narrows only
// the property, not the database it hangs off. Binding the right migrator when
// the database is created keeps `resetDb` free of casts.
//
// `Promise<unknown>`, not `Promise<void>`: `migrate` resolves to a failure
// object rather than throwing, but only under `init: true` — a mode reserved
// for `drizzle-kit pull --init`, which nothing here passes.
const migrators = new WeakMap<TestDb, () => Promise<unknown>>()

/**
 * Return the database to the state a freshly migrated one is in: every table
 * dropped, then every migration re-applied. Roughly 40ms, so it is still the
 * cheap way to isolate tests within a file — booting another PGlite costs 1.4s.
 *
 * Re-applying rather than only dropping matters: tests that assert something
 * about the schema would otherwise run against an empty database and pass
 * without checking anything.
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

  // The ledger of which migrations have run lives in its own `drizzle` schema,
  // so dropping the public tables alone leaves it claiming everything is
  // already applied — `migrate` below would then do nothing and every test
  // after the first would run against an empty database.
  await db.execute(sql`drop schema if exists drizzle cascade`)

  const migrate = migrators.get(db)

  if (!migrate) {
    throw new Error("resetDb() only accepts a database from createTestDb()")
  }

  await migrate()
}

/**
 * Names of every table in the public schema, in alphabetical order.
 *
 * Useful for asserting that migrations actually ran: a check that every table
 * has RLS passes trivially when there are no tables at all.
 */
export async function tableNames(db: TestDb): Promise<string[]> {
  return queryTableNames(db, sql`true`)
}

/**
 * Names of tables in the public schema that do not have row level security
 * enabled. Should always be empty — see docs/architecture.md S5.
 */
export async function tablesWithoutRLS(db: TestDb): Promise<string[]> {
  return queryTableNames(db, sql`c.relrowsecurity = false`)
}

async function queryTableNames(db: TestDb, condition: SQL): Promise<string[]> {
  const result = await db.execute<{ name: string }>(sql`
    select c.relname as name
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relkind = 'r'
      and ${condition}
    order by c.relname
  `)

  // The two drivers disagree on the result shape: postgres-js returns an
  // array-like RowList, PGlite returns { rows }.
  const rows = Array.isArray(result) ? result : result.rows

  return rows.map((row) => row.name)
}
