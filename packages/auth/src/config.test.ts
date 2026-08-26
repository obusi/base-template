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

import { createAuth, toHostList } from "./config"

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

describe("password reset", () => {
  /** An auth instance whose reset emails land in the returned array. */
  function authWithMailbox() {
    const sent: { email: string; token: string; url: string }[] = []

    const auth = createAuth(db, {
      sendResetPassword: ({ user, url, token }) => {
        sent.push({ email: user.email, url, token })
      },
    })

    return { auth, sent }
  }

  async function signUp(auth: ReturnType<typeof createAuth>) {
    await auth.api.signUpEmail({
      body: { email: EMAIL, password: PASSWORD, name: "Pinned" },
    })
  }

  /** Ask for a reset and hand back the token the mailer was given. */
  async function requestReset(email = EMAIL) {
    const { auth, sent } = authWithMailbox()
    await signUp(auth)
    await auth.api.requestPasswordReset({ body: { email } })

    return { auth, sent }
  }

  it("hands the mailer a token for an address that has an account", async () => {
    const { sent } = await requestReset()

    expect(sent).toHaveLength(1)
    expect(sent[0]!.email).toBe(EMAIL)
    expect(sent[0]!.token).toBeTruthy()
    expect(sent[0]!.url).toContain(sent[0]!.token)
  })

  it("sends nothing for an unknown address, and says so either way", async () => {
    const { auth, sent } = authWithMailbox()
    await signUp(auth)

    const result = await auth.api.requestPasswordReset({
      body: { email: "nobody@example.com" },
    })

    // The same shape as the hit above. Reporting "no such account" here would
    // turn the forgot-password form into an account-enumeration oracle, which
    // is the one thing it must not become — it takes an email address from
    // anyone at all, with no password.
    expect(result.status).toBe(true)
    expect(sent).toHaveLength(0)
  })

  it("lets the token set a new password", async () => {
    const { auth, sent } = await requestReset()

    await auth.api.resetPassword({
      body: { newPassword: "a-brand-new-password", token: sent[0]!.token },
    })

    const signedIn = await auth.api.signInEmail({
      body: { email: EMAIL, password: "a-brand-new-password" },
    })

    expect(signedIn.user.email).toBe(EMAIL)
  })

  it("retires the old password", async () => {
    const { auth, sent } = await requestReset()

    await auth.api.resetPassword({
      body: { newPassword: "a-brand-new-password", token: sent[0]!.token },
    })

    expect(
      await codeFrom(
        auth.api.signInEmail({ body: { email: EMAIL, password: PASSWORD } })
      )
    ).toBe("INVALID_EMAIL_OR_PASSWORD")
  })

  it("spends the token on first use", async () => {
    const { auth, sent } = await requestReset()
    const { token } = sent[0]!

    await auth.api.resetPassword({
      body: { newPassword: "first-password", token },
    })

    // A reset link sits in an inbox forever. If the token still worked, anyone
    // who later read that mailbox could take the account back.
    expect(
      await codeFrom(
        auth.api.resetPassword({
          body: { newPassword: "second-password", token },
        })
      )
    ).toBe("INVALID_TOKEN")
  })

  it("refuses a new password under eight characters", async () => {
    const { auth, sent } = await requestReset()

    // The same floor sign-up enforces. Without this the reset form would be a
    // way around the password policy rather than a way back into the account.
    expect(
      await codeFrom(
        auth.api.resetPassword({
          body: { newPassword: "1234567", token: sent[0]!.token },
        })
      )
    ).toBe("PASSWORD_TOO_SHORT")
  })

  it("signs out everyone who was already signed in", async () => {
    const { auth, sent } = await requestReset()

    const { headers } = await auth.api.signInEmail({
      returnHeaders: true,
      body: { email: EMAIL, password: PASSWORD },
    })
    const cookie = new Headers({ cookie: headers.getSetCookie().join("; ") })

    expect(await auth.api.getSession({ headers: cookie })).not.toBeNull()

    await auth.api.resetPassword({
      body: { newPassword: "a-brand-new-password", token: sent[0]!.token },
    })

    // Someone resetting a password may be doing it because another person has
    // their old one. Leaving that person's session alive defeats the reset.
    expect(await auth.api.getSession({ headers: cookie })).toBeNull()
  })
})

describe("allowed hosts", () => {
  // A preview deployment's hostname changes with every build, so `baseURL` is
  // a list of patterns rather than one string. Better Auth expands that list
  // into `trustedOrigins`, and the origin check — the thing that would
  // otherwise reject a sign-in coming from a preview URL — reads it there.
  //
  // The check itself cannot be exercised from here. Better Auth sets
  // `skipOriginCheck` to true whenever it detects a test environment, so a
  // request-level assertion would pass no matter what this list said, which is
  // worse than no assertion at all. Pinning the expansion is what is left, and
  // it still catches what matters: a canonical host that stopped being
  // included, a protocol that stopped following `BETTER_AUTH_URL`, or a
  // version that changed how patterns are written.

  /** The origins this configuration ends up trusting, in order, deduplicated —
   *  the canonical host and the fallback produce the same entry twice. */
  async function trusted(...allowedHosts: string[]) {
    const auth = createAuth(db, { allowedHosts })

    return [...new Set((await auth.$context).trustedOrigins)]
  }

  it("trusts the canonical origin, and nothing else, by default", async () => {
    // The companion to the test below: without this, an implementation that
    // trusted every host would satisfy the "adds" assertion just as well.
    expect(await trusted()).toEqual(["http://localhost:3000"])
  })

  it("collects hosts from several variables, comma-separated", () => {
    // Three sources feed one list: the escape-hatch variable, and the two
    // hostnames Vercel mints for a preview deployment. Order is preserved so
    // the list reads the way it was configured.
    expect(
      toHostList("a.example.com, b.example.com", "c.example.com", undefined)
    ).toEqual(["a.example.com", "b.example.com", "c.example.com"])
  })

  it("drops blanks rather than keeping a host that matches nothing", () => {
    // The companion. A deployment that sets the variable to an empty string
    // instead of deleting it, or leaves a trailing comma, would otherwise get
    // an entry that looks configured and matches no request at all.
    expect(toHostList("", undefined, "a.example.com,")).toEqual([
      "a.example.com",
    ])
    expect(toHostList(undefined, undefined)).toEqual([])
  })

  it("adds each configured host, wildcard intact", async () => {
    // The wildcard has to survive as a pattern — expanding or escaping it here
    // would leave preview deployments matching nothing. The `http` prefix is
    // not incidental either: it follows `BETTER_AUTH_URL`, which is what keeps
    // a local server from being handed https origins.
    expect(await trusted("preview-*.example.com")).toEqual([
      "http://localhost:3000",
      "http://preview-*.example.com",
    ])
  })
})

describe("google sign-in", () => {
  // `social-buttons.tsx` renders nothing until a project configures Google —
  // this is what stops that button from ever reaching a user with nothing
  // behind it to catch the click.
  it("is off until a project configures it", async () => {
    const auth = createAuth(db)

    expect(
      await codeFrom(auth.api.signInSocial({ body: { provider: "google" } }))
    ).toBe("PROVIDER_NOT_FOUND")
  })

  it("returns a Google authorization URL once configured", async () => {
    const auth = createAuth(db, {
      google: { clientId: "test-client-id", clientSecret: "test-secret" },
    })

    const result = await auth.api.signInSocial({
      body: { provider: "google", callbackURL: "/posts" },
    })

    // This is the boundary of what a test can prove without a live Google
    // endpoint and a browser: that Better Auth built a real authorization
    // request for the credentials it was given, not that the handshake
    // completes.
    expect(result.url).toBeTruthy()
    expect(new URL(result.url!).origin).toBe("https://accounts.google.com")
    expect(result.url).toContain("client_id=test-client-id")
  })
})
