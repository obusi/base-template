// Which half of the app a caller belongs to, and the guards that keep them
// there. `packages/api` decides the same thing for procedures — see
// `requireUserRole` / `requireAdminRole` in its middleware/auth.ts. These are
// the UI half, and they must not be mistaken for the security half: the
// procedures refuse regardless, and would refuse just the same if this file
// were deleted. What lives here is what a refused person sees.
//
// Deliberately carries no `server-only` marker: it reaches the API through the
// isomorphic client. It is still server-only in practice, because `cache` is,
// and `features/auth`'s barrel is imported by Server Components only — see
// .claude/rules/apps-web-structure.md on barrels.

import { ORPCError } from "@orpc/client"
import { notFound, redirect } from "next/navigation"
import { cache } from "react"

import { client } from "@/lib/orpc"

/**
 * The caller's role, or `undefined` when the API would not say.
 *
 * `cache()` is React's, not Next's: a layout guard and the navbar both need
 * this within one render, and without it that is two round trips per page for
 * an answer that cannot change mid-render. Same reasoning as `lib/session.ts`.
 */
export const getRole = cache(async (): Promise<string | undefined> => {
  try {
    return (await client.profile.me()).role
  } catch (error) {
    // UNAUTHORIZED for a caller with no session, and anything else the contract
    // declared. All of them mean the same here: no role to act on.
    if (error instanceof ORPCError) return undefined

    throw error
  }
})

export const isAdmin = async () => (await getRole()) === "admin"

/**
 * Guard for `app/(app)/(admin)/layout.tsx`.
 *
 * 404 rather than "you are not allowed here", which would confirm the route
 * exists — the same thing `NOT_FOUND` avoids on the API side.
 */
export async function requireAdminPage(): Promise<void> {
  // `notFound()` throws, so it stays outside anything that catches.
  if (!(await isAdmin())) {
    notFound()
  }
}

/**
 * Guard for `app/(app)/(user)/layout.tsx`.
 *
 * A redirect here rather than a 404, and the asymmetry is deliberate. The
 * admin side hides because a back-office route has no reason to advertise
 * itself. The user side is the public half of the product — an admin landing
 * on it has not found something secret, they have taken a wrong turn, and the
 * useful answer is their own side rather than a dead end.
 */
export async function requireUserPage(): Promise<void> {
  if (await isAdmin()) {
    redirect("/admin")
  }
}
