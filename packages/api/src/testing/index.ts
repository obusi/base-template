// Test helpers shared by every domain's router tests — not specific to
// `post`. Only used inside this package, unlike `@packages/db/testing`
// (which `packages/api` itself imports), so this stays out of
// `package.json`'s `exports` and domain tests reach it with a relative
// import instead.

import { createAuth } from "@packages/auth/server"
import { schema, type Database } from "@packages/db"

import type { ApiContext } from "../shared/context"
import type { Storage } from "../storage"

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
 * Object storage that records what it was asked for instead of talking to
 * Supabase.
 *
 * The only stand-in in this repo, and it earns the exception: storage is an
 * HTTP service on somebody else's machine, where the database is Postgres
 * compiled to WASM that boots in 1.4 seconds. What is worth testing here is
 * this repo's own logic — which paths are minted, whose prefix they carry,
 * that a URL is signed per attachment — and all of that is visible from here.
 */
export function fakeStorage(): Storage & { readonly signed: string[] } {
  const signed: string[] = []

  return {
    signed,
    createUploadUrl: (path) => {
      signed.push(path)
      return Promise.resolve({
        path,
        uploadUrl: `https://storage.test/upload/${path}`,
      })
    },
    createDownloadUrl: (path) =>
      Promise.resolve(`https://storage.test/download/${path}`),
  }
}

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
    reportStorage: fakeStorage(),
    ...overrides,
  }
}
