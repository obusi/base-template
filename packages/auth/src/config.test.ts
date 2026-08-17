// What Better Auth actually answers, pinned against a real database.
//
// `apps/web/features/auth/` branches on these codes and states these rules in
// comments, and neither `tsc` nor a rendered-component test can check either:
// a mocked auth client returns whatever the mock was told to, including a code
// that does not exist. That failure has already happened here once — the
// sign-up form branched on USER_ALREADY_EXISTS, which is a real entry in
// Better Auth's error table but not the one this route throws.
//
// So these tests exist to go red on a version bump that renames a code or
// relaxes a rule, before the UI silently stops handling it.

import { createTestDb, resetDb, type TestDb } from "@packages/db/testing"
import { APIError } from "better-auth/api"
import { beforeAll, beforeEach, describe, expect, it } from "vitest"

import { createAuth } from "./config"

const EMAIL = "pinned@example.com"
const PASSWORD = "correct-horse-battery-staple"

let db: TestDb

beforeAll(async () => {
  db = await createTestDb()
})

beforeEach(async () => {
  await resetDb(db)
})

/** The `code` Better Auth answered with, or a failure if it did not throw. */
async function codeFrom(call: Promise<unknown>): Promise<string | undefined> {
  try {
    await call
  } catch (error) {
    if (error instanceof APIError) return error.body?.code
    throw error
  }

  throw new Error("expected the call to fail, but it succeeded")
}

describe("sign-up", () => {
  // The companion the repo's testing rules ask for. Without it, a
  // `createAuth` that rejected everything would satisfy every assertion
  // below while being completely broken.
  it("creates an account", async () => {
    const auth = createAuth(db)

    const result = await auth.api.signUpEmail({
      body: { email: EMAIL, password: PASSWORD, name: "Pinned" },
    })

    expect(result.user.email).toBe(EMAIL)
  })

  it("refuses an email that already has an account", async () => {
    const auth = createAuth(db)
    const body = { email: EMAIL, password: PASSWORD, name: "Pinned" }

    await auth.api.signUpEmail({ body })

    // `apps/web/features/auth/signup-page.tsx` puts this one on the email
    // field rather than in a toast. Better Auth also defines the shorter
    // USER_ALREADY_EXISTS, which this route does not use.
    expect(await codeFrom(auth.api.signUpEmail({ body }))).toBe(
      "USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL"
    )
  })

  it("refuses a password under eight characters", async () => {
    const auth = createAuth(db)

    // The sign-up form's zod schema says `min(8)` and its comment claims that
    // matches Better Auth's default. This is what checks the claim: raise the
    // default and the schema becomes the weaker of the two, letting the form
    // submit something the server then rejects.
    expect(
      await codeFrom(
        auth.api.signUpEmail({
          body: { email: "short@example.com", password: "1234567", name: "S" },
        })
      )
    ).toBe("PASSWORD_TOO_SHORT")

    await expect(
      auth.api.signUpEmail({
        body: { email: "short@example.com", password: "12345678", name: "S" },
      })
    ).resolves.toBeDefined()
  })
})

describe("sign-in", () => {
  it("accepts the right password", async () => {
    const auth = createAuth(db)
    await auth.api.signUpEmail({
      body: { email: EMAIL, password: PASSWORD, name: "Pinned" },
    })

    const result = await auth.api.signInEmail({
      body: { email: EMAIL, password: PASSWORD },
    })

    expect(result.user.email).toBe(EMAIL)
  })

  it("gives the same answer for a wrong password and an unknown email", async () => {
    const auth = createAuth(db)
    await auth.api.signUpEmail({
      body: { email: EMAIL, password: PASSWORD, name: "Pinned" },
    })

    const wrongPassword = await codeFrom(
      auth.api.signInEmail({
        body: { email: EMAIL, password: "not-it-at-all" },
      })
    )
    const unknownEmail = await codeFrom(
      auth.api.signInEmail({
        body: { email: "nobody@example.com", password: PASSWORD },
      })
    )

    // Telling these apart would confirm which addresses have accounts here.
    // The sign-in form shows Better Auth's message as-is on the strength of
    // this, so a version that started distinguishing them would turn that
    // form into an account-enumeration oracle.
    expect(wrongPassword).toBe(unknownEmail)
    expect(wrongPassword).toBe("INVALID_EMAIL_OR_PASSWORD")
  })
})
