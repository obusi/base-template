import { sql } from "drizzle-orm"
import { beforeAll, beforeEach, describe, expect, it } from "vitest"

import {
  createTestDb,
  resetDb,
  tableNames,
  tablesWithoutRLS,
  type TestDb,
} from "@packages/db/testing"

let db: TestDb

// One instance per file: booting PGlite costs ~1.4s, resetting it ~40ms.
beforeAll(async () => {
  db = await createTestDb()
})

// Before rather than after, so that every assertion below runs on the far side
// of a reset. `resetDb` is itself a place bugs hide — it once left the database
// empty instead of migrated — and a check that runs before it never sees them.
beforeEach(async () => {
  await resetDb(db)
})

describe("migrations", () => {
  // "Every table has RLS" is also true of a database with no tables, so a
  // migration that silently failed to apply would leave this suite green.
  // Pinning the list means the guard below is known to be checking something.
  //
  // Adding a table is meant to fail this test. Update the list in the same
  // commit that adds the table, and the diff then records the schema change
  // rather than hiding it.
  it("create every table the schema declares", async () => {
    expect(await tableNames(db)).toEqual([
      "account",
      "post",
      "session",
      "user",
      "verification",
    ])
  })
})

describe("row level security", () => {
  it("is enabled on every table", async () => {
    expect(await tablesWithoutRLS(db)).toEqual([])
  })

  // Without this, the test above would pass on an empty schema and keep
  // passing forever, proving nothing. This proves the check can actually fail.
  it("detects a table that forgot to enable it", async () => {
    await db.execute(sql`create table forgot_rls (id int primary key)`)

    expect(await tablesWithoutRLS(db)).toEqual(["forgot_rls"])
  })

  it("accepts a table that enabled it", async () => {
    await db.execute(sql`create table remembered_rls (id int primary key)`)
    await db.execute(sql`alter table remembered_rls enable row level security`)

    expect(await tablesWithoutRLS(db)).toEqual([])
  })
})
