import { createRouterClient } from "@orpc/server"
import { beforeAll, beforeEach, describe, expect, it } from "vitest"

import {
  FEATURES,
  MAX_ATTACHMENTS,
  MAX_ATTACHMENT_BYTES,
  parseFeatures,
} from "@packages/shared"
import { createTestDb, resetDb, type TestDb } from "@packages/db/testing"

import { router } from "../../index"
import {
  anonymousContext,
  contextFor,
  promoteToAdmin,
  signUpTestUser,
  type TestUser,
} from "../../testing"

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

/** The same, plus the header a browser would have sent. */
const asBrowser = (user: TestUser, userAgent: string) => {
  const headers = new Headers(user.headers)
  headers.set("user-agent", userAgent)

  return createRouterClient(router, {
    context: () => ({ ...contextFor(db, user), headers }),
  })
}

const anonymous = () =>
  createRouterClient(router, { context: () => anonymousContext(db) })

/** A signed-in caller on a deployment where no bucket is configured. */
const withoutStorage = (user: TestUser) =>
  createRouterClient(router, {
    context: () => contextFor(db, user, { reportStorage: null }),
  })

/**
 * A deployment with no flags set, which is production until a release.
 *
 * `contextFor` hands every test every flag on, so this is the one place that
 * says otherwise — and it takes no user, because a flag decides whether the
 * procedure is there at all rather than who may call it.
 */
const withNoFlags = () =>
  createRouterClient(router, {
    context: () =>
      anonymousContext(db, { features: parseFeatures("", FEATURES) }),
  })

/** The same deployment, with an admin's cookie. */
const asAdminWithNoFlags = (user: TestUser) =>
  createRouterClient(router, {
    context: () =>
      contextFor(db, user, { features: parseFeatures("", FEATURES) }),
  })

/**
 * Assert on the error's `code`, never its message. The code is what the
 * contract declares and what client code branches on; the message is a
 * humanised default that oRPC is free to reword.
 */
const rejectsWith = (promise: Promise<unknown>, code: string) =>
  expect(promise).rejects.toMatchObject({ code })

const aReport = { category: "bug" as const, message: "The page is blank" }

describe("report.create", () => {
  it("stores the report against the caller", async () => {
    const created = await as(alice).report.create(aReport)

    expect(created.reporterId).toBe(alice.id)
    expect(created.message).toBe("The page is blank")
    expect(created.status).toBe("new")
  })

  it("keeps the page the reporter was on", async () => {
    const created = await as(alice).report.create({
      ...aReport,
      pageUrl: "https://example.com/posts",
    })

    expect(created.pageUrl).toBe("https://example.com/posts")
  })

  // The column is only worth having if it holds what the request actually
  // carried rather than what the form claimed.
  it("captures the user agent from the request, not from the input", async () => {
    const created = await asBrowser(alice, "TestBrowser/1.0").report.create(
      aReport
    )

    expect(created.userAgent).toBe("TestBrowser/1.0")
  })

  it("refuses a caller with no session", async () => {
    await rejectsWith(anonymous().report.create(aReport), "UNAUTHORIZED")
  })

  it("refuses a category the contract does not declare", async () => {
    await rejectsWith(
      as(alice).report.create({
        ...aReport,
        category: "whatever" as never,
      }),
      "BAD_REQUEST"
    )
  })
})

describe("report.list", () => {
  it("refuses a caller with no session", async () => {
    await rejectsWith(anonymous().report.list({ limit: 20 }), "UNAUTHORIZED")
  })

  // The one rule `requireAdmin` exists for: signed in is not enough.
  it("refuses a signed-in caller who is not an admin", async () => {
    await rejectsWith(as(bob).report.list({ limit: 20 }), "FORBIDDEN")
  })

  it("returns every report to an admin, newest first", async () => {
    await as(alice).report.create({ ...aReport, message: "first" })
    await as(bob).report.create({ ...aReport, message: "second" })

    await promoteToAdmin(db, bob)
    const { items, nextCursor } = await as(bob).report.list({ limit: 20 })

    expect(items.map((r) => r.message)).toEqual(["second", "first"])
    expect(nextCursor).toBeNull()
  })

  it("pages with a cursor rather than an offset", async () => {
    await as(alice).report.create({ ...aReport, message: "first" })
    await as(alice).report.create({ ...aReport, message: "second" })
    await promoteToAdmin(db, alice)

    const page1 = await as(alice).report.list({ limit: 1 })
    expect(page1.items.map((r) => r.message)).toEqual(["second"])
    expect(page1.nextCursor).not.toBeNull()

    const page2 = await as(alice).report.list({
      limit: 1,
      cursor: page1.nextCursor ?? undefined,
    })
    expect(page2.items.map((r) => r.message)).toEqual(["first"])
    expect(page2.nextCursor).toBeNull()
  })
})

describe("report.updateStatus", () => {
  /** A report raised by alice, with bob promoted so he can act on it. */
  const aReportAndAnAdmin = async () => {
    const created = await as(alice).report.create(aReport)
    await promoteToAdmin(db, bob)

    return created
  }

  it("refuses a caller with no session", async () => {
    const created = await as(alice).report.create(aReport)

    await rejectsWith(
      anonymous().report.updateStatus({ id: created.id, status: "resolved" }),
      "UNAUTHORIZED"
    )
  })

  it("refuses a signed-in caller who is not an admin", async () => {
    const created = await as(alice).report.create(aReport)

    await rejectsWith(
      as(alice).report.updateStatus({ id: created.id, status: "resolved" }),
      "FORBIDDEN"
    )
  })

  it("moves the report along for an admin", async () => {
    const created = await aReportAndAnAdmin()
    expect(created.status).toBe("new")

    const updated = await as(bob).report.updateStatus({
      id: created.id,
      status: "investigating",
    })

    expect(updated.status).toBe("investigating")
    expect(updated.message).toBe(created.message)
  })

  // The write is the assertion, not the return value: a handler that answered
  // with the new status while updating nothing would pass the test above.
  it("persists the change", async () => {
    const created = await aReportAndAnAdmin()

    await as(bob).report.updateStatus({ id: created.id, status: "resolved" })
    const { items } = await as(bob).report.list({ limit: 20 })

    expect(items.map((r) => r.status)).toEqual(["resolved"])
  })

  it("leaves what the reporter wrote alone", async () => {
    const created = await aReportAndAnAdmin()

    const updated = await as(bob).report.updateStatus({
      id: created.id,
      status: "dismissed",
    })

    expect(updated.reporterId).toBe(alice.id)
    expect(updated.category).toBe(created.category)
    expect(updated.message).toBe(created.message)
  })

  it("refuses a status the contract does not name", async () => {
    const created = await aReportAndAnAdmin()

    await rejectsWith(
      as(bob).report.updateStatus({
        id: created.id,
        status: "closed" as never,
      }),
      "BAD_REQUEST"
    )
  })

  it("answers NOT_FOUND for an id that matches nothing", async () => {
    await promoteToAdmin(db, bob)

    await rejectsWith(
      as(bob).report.updateStatus({
        id: "00000000-0000-4000-8000-000000000000",
        status: "resolved",
      }),
      "NOT_FOUND"
    )
  })

  // The release toggle, from both ends. NOT_FOUND rather than FORBIDDEN is the
  // point of the guard: with the flag off the procedure has to look like one
  // that was never written, to an admin and to a stranger alike.
  it("does not exist while the flag is off", async () => {
    const created = await aReportAndAnAdmin()

    await rejectsWith(
      asAdminWithNoFlags(bob).report.updateStatus({
        id: created.id,
        status: "resolved",
      }),
      "NOT_FOUND"
    )
  })

  // And the flag is checked before the role, so a caller who is refused cannot
  // tell the two refusals apart.
  it("says the same thing to a caller with no session at all", async () => {
    const created = await as(alice).report.create(aReport)

    await rejectsWith(
      withNoFlags().report.updateStatus({
        id: created.id,
        status: "resolved",
      }),
      "NOT_FOUND"
    )
  })
})

// `role` lives on the profile table, one column away from the fields a caller
// is allowed to change. If it ever reaches `UpdateProfileInput`, anyone can
// read every report in the database.
describe("role", () => {
  it("cannot be granted by updating your own profile", async () => {
    // Sent alongside a field that is allowed, so a passing test means `role`
    // was stripped rather than the whole request being thrown out.
    const updated = await as(bob).profile.update({
      bio: "hello",
      role: "admin",
    } as never)

    expect(updated.bio).toBe("hello")
    expect(updated.role).toBe("user")
    await rejectsWith(as(bob).report.list({ limit: 20 }), "FORBIDDEN")
  })
})

const anImage = { contentType: "image/png" as const, size: 1024 }

describe("report.createUploadUrls", () => {
  it("hands back one target per file", async () => {
    const { targets } = await as(alice).report.createUploadUrls({
      files: [anImage, anImage],
    })

    expect(targets).toHaveLength(2)
    expect(targets[0]?.uploadUrl).toContain("https://storage.test/upload/")
  })

  // The prefix is what `create` checks against, so it is the whole reason a
  // caller cannot attach somebody else's file.
  it("puts every object under the caller's own prefix", async () => {
    const { targets } = await as(alice).report.createUploadUrls({
      files: [anImage],
    })

    expect(targets[0]?.path.startsWith(`report/${alice.id}/`)).toBe(true)
    expect(targets[0]?.path.endsWith(".png")).toBe(true)
  })

  it("refuses a caller with no session", async () => {
    await rejectsWith(
      anonymous().report.createUploadUrls({ files: [anImage] }),
      "UNAUTHORIZED"
    )
  })

  it("refuses more files than the limit allows", async () => {
    await rejectsWith(
      as(alice).report.createUploadUrls({
        files: Array.from({ length: MAX_ATTACHMENTS + 1 }, () => anImage),
      }),
      "BAD_REQUEST"
    )
  })

  it("refuses a file over the size limit", async () => {
    await rejectsWith(
      as(alice).report.createUploadUrls({
        files: [{ ...anImage, size: MAX_ATTACHMENT_BYTES + 1 }],
      }),
      "BAD_REQUEST"
    )
  })

  it("refuses a content type that is not an image", async () => {
    await rejectsWith(
      as(alice).report.createUploadUrls({
        files: [{ contentType: "application/pdf" as never, size: 1024 }],
      }),
      "BAD_REQUEST"
    )
  })

  // A deployment with no bucket configured. It should say so rather than fail
  // somewhere deeper, because the form reads this code to hide its picker.
  it("says so when the deployment has no storage", async () => {
    await rejectsWith(
      withoutStorage(alice).report.createUploadUrls({ files: [anImage] }),
      "ATTACHMENTS_UNAVAILABLE"
    )
  })
})

describe("report attachments", () => {
  /** Ask for a target, then hand its path back the way the browser does. */
  const upload = async (user: TestUser) => {
    const { targets } = await as(user).report.createUploadUrls({
      files: [anImage],
    })

    const path = targets[0]?.path ?? ""
    return { path, contentType: anImage.contentType, size: anImage.size }
  }

  it("reach an admin with a signed url", async () => {
    const attachment = await upload(alice)
    await as(alice).report.create({ ...aReport, attachments: [attachment] })

    await promoteToAdmin(db, bob)
    const { items } = await as(bob).report.list({ limit: 20 })

    expect(items[0]?.attachments).toHaveLength(1)
    expect(items[0]?.attachments[0]?.url).toBe(
      `https://storage.test/download/${attachment.path}`
    )
    expect(items[0]?.attachments[0]?.size).toBe(1024)
  })

  // The paths come back through the browser, so they are input like any other.
  it("cannot name a path belonging to somebody else", async () => {
    const bobs = await upload(bob)

    await rejectsWith(
      as(alice).report.create({ ...aReport, attachments: [bobs] }),
      "FORBIDDEN"
    )
  })

  it("cannot name a path outside the attachment namespace altogether", async () => {
    await rejectsWith(
      as(alice).report.create({
        ...aReport,
        attachments: [{ ...anImage, path: "../../secrets/key.png" }],
      }),
      "FORBIDDEN"
    )
  })

  // The rejection above has to leave nothing behind, or a caller could write
  // reports by failing.
  it("leave no report behind when the path check refuses one", async () => {
    const bobs = await upload(bob)

    await rejectsWith(
      as(alice).report.create({ ...aReport, attachments: [bobs] }),
      "FORBIDDEN"
    )

    await promoteToAdmin(db, bob)
    expect((await as(bob).report.list({ limit: 20 })).items).toHaveLength(0)
  })

  it("are absent, not broken, on a report that had none", async () => {
    await as(alice).report.create(aReport)

    await promoteToAdmin(db, bob)
    const { items } = await as(bob).report.list({ limit: 20 })

    expect(items[0]?.attachments).toEqual([])
  })
})
