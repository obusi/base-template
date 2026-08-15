// Test helpers shared by every domain's router tests — not specific to
// `post`. Only used inside this package, unlike `@packages/db/testing`
// (which `packages/api` itself imports), so this stays out of
// `package.json`'s `exports` and domain tests reach it with a relative
// import instead.

import { createAuth } from "@packages/auth/server"
import type { Database } from "@packages/db"

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

/** A context for a signed-in caller. */
export function contextFor(db: Database, user: TestUser): ApiContext {
  return { db, auth: createAuth(db), headers: user.headers }
}

/** A context for a caller with no session at all. */
export function anonymousContext(db: Database): ApiContext {
  return { db, auth: createAuth(db), headers: new Headers() }
}
