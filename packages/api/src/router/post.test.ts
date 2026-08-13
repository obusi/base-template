import { createRouterClient } from "@orpc/server"
import { beforeAll, beforeEach, describe, expect, it } from "vitest"

import { createTestDb, resetDb, type TestDb } from "@packages/db/testing"

import { router } from "@packages/api"
import {
  anonymousContext,
  contextFor,
  signUpTestUser,
  type TestUser,
} from "@packages/api/router/seed"

let db: TestDb
let alice: TestUser
let bob: TestUser

beforeAll(async () => {
  db = await createTestDb()
})

// Before, not after: `resetDb` is itself code that can fail, and a check that
// runs ahead of it never sees that happen. Same reasoning as the RLS guard.
beforeEach(async () => {
  await resetDb(db)
  alice = await signUpTestUser(db, "alice@example.com")
  bob = await signUpTestUser(db, "bob@example.com")
})

/** A caller with the given user's cookie, going through the real middleware. */
const as = (user: TestUser) =>
  createRouterClient(router, { context: () => contextFor(db, user) })

const anonymous = () =>
  createRouterClient(router, { context: () => anonymousContext(db) })

/**
 * Assert on the error's `code`, never its message. The code is what the
 * contract declares and what client code branches on; the message is a
 * humanised default ("Not Found") that oRPC is free to reword.
 */
const rejectsWith = (promise: Promise<unknown>, code: string) =>
  expect(promise).rejects.toMatchObject({ code })

describe("post.create", () => {
  it("stores the post against the caller", async () => {
    const created = await as(alice).post.create({
      title: "Hello",
      content: "World",
    })

    expect(created.authorId).toBe(alice.id)
    expect(created.title).toBe("Hello")
  })

  it("refuses a caller with no session", async () => {
    await rejectsWith(
      anonymous().post.create({ title: "Hello", content: "World" }),
      "UNAUTHORIZED"
    )
  })
})

describe("post.update", () => {
  it("updates the caller's own post", async () => {
    const own = await as(alice).post.create({ title: "Draft", content: "..." })

    const updated = await as(alice).post.update({
      id: own.id,
      title: "Published",
    })

    expect(updated.title).toBe("Published")
    expect(updated.content).toBe("...")
  })

  // The test the whole package exists to make possible.
  it("cannot touch another user's post", async () => {
    const bobs = await as(bob).post.create({ title: "Bob's", content: "..." })

    await rejectsWith(
      as(alice).post.update({ id: bobs.id, title: "Stolen" }),
      "NOT_FOUND"
    )

    const unchanged = await as(bob).post.byId({ id: bobs.id })
    expect(unchanged.title).toBe("Bob's")
  })
})

describe("post.delete", () => {
  it("cannot delete another user's post", async () => {
    const bobs = await as(bob).post.create({ title: "Bob's", content: "..." })

    await rejectsWith(as(alice).post.delete({ id: bobs.id }), "NOT_FOUND")

    expect(await as(bob).post.byId({ id: bobs.id })).toBeDefined()
  })
})

describe("post.byId", () => {
  it("reports a missing post as NOT_FOUND", async () => {
    await rejectsWith(
      anonymous().post.byId({ id: "00000000-0000-4000-8000-000000000000" }),
      "NOT_FOUND"
    )
  })
})

describe("post.list", () => {
  it("returns newest first and pages with the cursor", async () => {
    for (const title of ["one", "two", "three"]) {
      await as(alice).post.create({ title, content: "..." })
    }

    const first = await anonymous().post.list({ limit: 2 })

    expect(first.items.map((p) => p.title)).toEqual(["three", "two"])
    expect(first.nextCursor).not.toBeNull()

    const second = await anonymous().post.list({
      limit: 2,
      cursor: first.nextCursor ?? undefined,
    })

    expect(second.items.map((p) => p.title)).toEqual(["one"])
    expect(second.nextCursor).toBeNull()
  })

  it("is readable without a session", async () => {
    await as(alice).post.create({ title: "Public", content: "..." })

    const { items } = await anonymous().post.list({ limit: 20 })

    expect(items).toHaveLength(1)
  })
})
