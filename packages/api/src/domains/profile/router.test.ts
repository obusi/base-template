import { createRouterClient } from "@orpc/server"
import { beforeAll, beforeEach, describe, expect, it } from "vitest"

import { createTestDb, resetDb, type TestDb } from "@packages/db/testing"

import { router } from "../../index"
import {
  anonymousContext,
  contextFor,
  signUpTestUser,
  type TestUser,
} from "../../testing"

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

const rejectsWith = (promise: Promise<unknown>, code: string) =>
  expect(promise).rejects.toMatchObject({ code })

describe("profile.me", () => {
  // signUpTestUser goes through the real signUpEmail flow, so this also
  // proves the auth hook creates the row rather than the fallback alone.
  it("returns an empty profile created at signup", async () => {
    const profile = await as(alice).profile.me()

    expect(profile.userId).toBe(alice.id)
    expect(profile.bio).toBeNull()
    expect(profile.phone).toBeNull()
  })

  it("refuses a caller with no session", async () => {
    await rejectsWith(anonymous().profile.me(), "UNAUTHORIZED")
  })
})

describe("profile.update", () => {
  it("updates the caller's own profile", async () => {
    const updated = await as(alice).profile.update({
      bio: "Hello there",
      phone: "555-0100",
    })

    expect(updated.bio).toBe("Hello there")
    expect(updated.phone).toBe("555-0100")

    const fetched = await as(alice).profile.me()
    expect(fetched.bio).toBe("Hello there")
  })

  it("refuses a caller with no session", async () => {
    await rejectsWith(
      anonymous().profile.update({ bio: "Hello" }),
      "UNAUTHORIZED"
    )
  })
})
