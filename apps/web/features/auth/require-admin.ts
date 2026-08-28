// The UI half of "admins only". `app/(app)/admin/layout.tsx` calls this, so
// every route added under that segment is covered by existing there rather
// than by remembering to guard itself.
//
// This is not what secures anything, and it must not be mistaken for it:
// `requireAdmin` in packages/api refuses the procedure, and would refuse it
// just the same if this file were deleted. What this removes is the error page
// a non-admin would otherwise meet — and 404 rather than "not allowed",
// because a page that says "you may not enter" confirms the route exists.
//
// Lives in `features/auth` because it is a question about who the caller is,
// not about anything the admin pages happen to show. Deliberately carries no
// `server-only` marker: it reaches the API through the isomorphic client, and
// marking it would make this feature's barrel unimportable from any future
// Client Component.

import { ORPCError } from "@orpc/client"
import { notFound } from "next/navigation"

import { client } from "@/lib/orpc"

export async function requireAdminPage(): Promise<void> {
  const profile = await readProfile()

  // `notFound()` throws, so it stays outside the try below — a catch that
  // swallowed it would turn "not an admin" into a blank render.
  if (profile?.role !== "admin") {
    notFound()
  }
}

/** The caller's profile, or `undefined` when the API refused to say. */
async function readProfile() {
  try {
    return await client.profile.me()
  } catch (error) {
    // UNAUTHORIZED for a caller with no session, and anything else the
    // contract declared. All of them mean the same thing here: not an admin.
    if (error instanceof ORPCError) return undefined

    throw error
  }
}
