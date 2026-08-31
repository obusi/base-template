// Test helpers shared by every domain's router tests — not specific to
// `post`. Only used inside this package, unlike `@packages/db/testing`
// (which `packages/api` itself imports), so this stays out of
// `package.json`'s `exports` and domain tests reach it with a relative
// import instead.

import { createAuth } from "@packages/auth/server"
import { schema, type Database } from "@packages/db"
import { FEATURES, parseFeatures } from "@packages/shared"
import { fakeStorage } from "@packages/storage/testing"

import type { ApiContext } from "../shared/context"

export type TestUser = {
  id: string
  email: string
  /** Headers carrying this user's session cookie, ready to put in a context. */
  headers: Headers
}

/**
 * Sign a real user up against the given database and keep their session cookie.
 *
 * Deliberately not a fabricated `{ user: { id } }` object dropped into the
 * context. Faking the session would skip the one piece of glue this repo owns —
 * `requireAuth` turning a cookie into a user — which is exactly the seam where
 * "logged in but treated as anonymous" bugs live.
 */
export async function signUpTestUser(
  db: Database,
  email: string
): Promise<TestUser> {
  const auth = createAuth(db)

  const { headers, response } = await auth.api.signUpEmail({
    returnHeaders: true,
    body: { email, password: "correct-horse-battery-staple", name: email },
  })

  const cookie = headers.getSetCookie().join("; ")

  return {
    id: response.user.id,
    email,
    headers: new Headers({ cookie }),
  }
}

/**
 * Give a signed-up test user the admin role.
 *
 * Writes the column directly because there is no procedure that grants a role
 * — a real deployment does this through `db:studio`. Upserts rather than
 * updates so the helper does not depend on the signup hook having won its race
 * to create the profile row.
 */
export async function promoteToAdmin(
  db: Database,
  user: TestUser
): Promise<void> {
  await db
    .insert(schema.profile)
    .values({ userId: user.id, role: "admin" })
    .onConflictDoUpdate({
      target: schema.profile.userId,
      set: { role: "admin" },
    })
}

/**
 * Every flag on, which is what a test wants by default.
 *
 * The alternative — everything off — would make guarding a procedure break
 * that procedure's existing tests, and *un*guarding it later break them again
 * as the overrides came back out. A test is about what a procedure does, not
 * about whether it is switched on; the one test that cares says so with
 * `{ features: parseFeatures("", FEATURES) }`.
 *
 * Deleting a flag has to be as cheap as possible or it does not get done.
 */
const allFeatures = parseFeatures(FEATURES.join(","), FEATURES)

/**
 * A context for a signed-in caller.
 *
 * Every storage field defaults to a working stand-in, so a domain with nothing
 * to do with attachments never mentions one. `overrides` is how a test says it
 * wants something else — `{ reportStorage: null }` is the deployment that has
 * no bucket configured.
 *
 * Overrides is an object rather than more parameters on purpose: a second
 * bucket would otherwise make every caller count positions and pass `null` for
 * fields it does not care about. This way adding a field to `ApiContext`
 * changes no signature and no existing call.
 */
export function contextFor(
  db: Database,
  user: TestUser,
  overrides: Partial<ApiContext> = {}
): ApiContext {
  return {
    db,
    auth: createAuth(db),
    headers: user.headers,
    features: allFeatures,
    reportStorage: fakeStorage(),
    ...overrides,
  }
}

/** A context for a caller with no session at all. */
export function anonymousContext(
  db: Database,
  overrides: Partial<ApiContext> = {}
): ApiContext {
  return {
    db,
    auth: createAuth(db),
    headers: new Headers(),
    features: allFeatures,
    reportStorage: fakeStorage(),
    ...overrides,
  }
}
