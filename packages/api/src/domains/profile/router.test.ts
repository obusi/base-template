import { createRouterClient } from "@orpc/server"
import { beforeAll, beforeEach, describe, expect, it } from "vitest"

import { createTestDb, resetDb, type TestDb } from "@packages/db/testing"

import { router } from "../../index"
import { anonymousContext, contextFor, signUpTestUser } from "../../testing"
import type { TestUser } from "../../testing"

let db: TestDb
let alice: TestUser

beforeAll(async () => {
  db = await createTestDb()
})

beforeEach(async () => {
  await resetDb(db)
  alice = await signUpTestUser(db, "alice@example.com")
})

const as = (user: TestUser) =>
  createRouterClient(router, { context: () => contextFor(db, user) })

const anonymous = () =>
  createRouterClient(router, { context: () => anonymousContext(db) })

describe("profile.me", () => {
  it("refuses a caller with no session", async () => {
    await expect(anonymous().profile.me()).rejects.toMatchObject({
      code: "UNAUTHORIZED",
    })
  })

  it("starts every caller on the default role", async () => {
    expect((await as(alice).profile.me()).role).toBe("user")
  })
})

describe("profile.update", () => {
  it("changes only the fields it was given", async () => {
    await as(alice).profile.update({ bio: "first", phone: "0800000000" })
    const updated = await as(alice).profile.update({ bio: "second" })

    expect(updated.bio).toBe("second")
    expect(updated.phone).toBe("0800000000")
  })

  // Every field of UpdateProfileInput is optional, so an empty object is a
  // request the contract accepts. Drizzle's `.set({})` throws, which reached
  // the caller as INTERNAL_SERVER_ERROR until the service special-cased it.
  it("treats an update with no fields as a no-op", async () => {
    await as(alice).profile.update({ bio: "unchanged" })

    expect((await as(alice).profile.update({})).bio).toBe("unchanged")
  })
})
