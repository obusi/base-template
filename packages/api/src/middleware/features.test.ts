import { createRouterClient } from "@orpc/server"
import { beforeAll, beforeEach, describe, expect, it } from "vitest"

import { createTestDb, resetDb, type TestDb } from "@packages/db/testing"
import { parseFeatures, type Feature } from "@packages/shared"

import { os } from "../shared/builder"
import { contextFor, signUpTestUser } from "../testing"
import type { TestUser } from "../testing"
import { requireFeature } from "./features"

// This test names its own flag rather than borrowing a real one, which would
// disappear the week that work was released and take the test with it. The
// cast is what naming your own costs: `Feature` is built from `FEATURES`, so a
// name that is not in the list cannot be written without one. It reads as a
// warning everywhere except here — `requireFeature("report-satus")` is a
// compile error, and that is the whole reason the type exists.
const UNRELEASED = "unreleased" as unknown as Feature

// The guard is attached to a real procedure through the real builder, so the
// contract, the middleware chain and the client are all the production ones.
// Only the handler is a stand-in, and it is written to fail loudly: a guard
// that lets a refused call through should not look like a passing test.
const router = {
  profile: {
    me: os.profile.me.use(requireFeature(UNRELEASED)).handler(() => {
      throw new Error("the handler ran with the feature off")
    }),
  },
}

let db: TestDb
let alice: TestUser

beforeAll(async () => {
  db = await createTestDb()
})

beforeEach(async () => {
  await resetDb(db)
  alice = await signUpTestUser(db, "alice@example.com")
})

const withFeatures = (value: string) =>
  createRouterClient(router, {
    context: () =>
      contextFor(db, alice, { features: parseFeatures(value, [UNRELEASED]) }),
  })

describe("requireFeature", () => {
  // NOT_FOUND, and the code is the assertion: FORBIDDEN would answer "you may
  // not have this", which tells the caller the feature is there and merely
  // switched off. Same reasoning as `requireAdminPage` answering 404.
  it("refuses while the flag is off, as an absent procedure would", async () => {
    await expect(withFeatures("").profile.me()).rejects.toMatchObject({
      code: "NOT_FOUND",
    })
  })

  it("lets the call through once the flag is on", async () => {
    await expect(withFeatures(UNRELEASED).profile.me()).rejects.toThrow(
      "the handler ran with the feature off"
    )
  })
})
