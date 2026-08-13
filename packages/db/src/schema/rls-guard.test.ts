import { sql } from "drizzle-orm"
import { afterEach, beforeAll, describe, expect, it } from "vitest"

import {
  createTestDb,
  resetDb,
  tablesWithoutRLS,
  type TestDb,
} from "@packages/db/testing"

let db: TestDb

// One instance per file: booting PGlite costs ~1.4s, resetting it ~6ms.
beforeAll(async () => {
  db = await createTestDb()
})

afterEach(async () => {
  await resetDb(db)
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
