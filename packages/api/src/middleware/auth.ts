import { ORPCError } from "@orpc/server"

import * as profileService from "../domains/profile/service"
import { os } from "../shared/builder"

/**
 * The only place in this repo that decides whether a request is authenticated.
 *
 * Procedures that carry it can read `context.user` and know it is not null;
 * procedures that do not carry it have no `context.user` to read, so forgetting
 * the middleware is a type error rather than an open door.
 *
 * Authorization — whether *this* user may touch *that* row — is deliberately
 * not here. It belongs in each handler's `where` clause, where it is visible
 * next to the query it constrains. See docs/architecture.md S5.
 */
export const requireAuth = os.middleware(async ({ context, next }) => {
  const session = await context.auth.api.getSession({
    headers: context.headers,
  })

  if (!session) {
    throw new ORPCError("UNAUTHORIZED")
  }

  return next({ context: { user: session.user } })
})

/**
 * The two sides of the app, as middleware.
 *
 * Both are built with `.concat` on `requireAuth` rather than declared beside
 * it, so a procedure carries one middleware instead of two in an order that
 * could be written the wrong way round. `.use(requireUserRole)` authenticates
 * and authorizes; stacking `requireAuth` in front of either would run the
 * session lookup twice for no gain.
 *
 * They cover the one kind of rule a `where` clause cannot express. Row
 * ownership belongs in the query that reads the row, and every handler here
 * still does that — these decide something else: which *half of the product*
 * the caller belongs to. That question has no row to attach itself to.
 *
 * `FORBIDDEN`, not `NOT_FOUND`. The NOT_FOUND rule exists so a caller cannot
 * discover which ids are real from the error it gets back; neither of these
 * takes an id, so there is nothing to leak.
 *
 * **Not every procedure picks a side.** `profile.*` and `report.create` stay on
 * plain `requireAuth` on purpose: they are about the caller's own account, not
 * about either half of the product, and an admin who cannot read their own
 * profile or report a bug is a worse outcome than a tidy rule. `requireAdminRole`
 * itself reads the profile, so locking that door would lock out the key.
 */
export const requireAdminRole = requireAuth.concat(
  async ({ context, next }) => {
    if (
      (await profileService.getRole(context.db, context.user.id)) !== "admin"
    ) {
      throw new ORPCError("FORBIDDEN")
    }

    return next()
  }
)

/**
 * The mirror of the above: an admin account is a back-office account, and is
 * refused the product's own features.
 *
 * A caller with no profile row yet is a user, not a refusal — that is the same
 * answer the column's default would have given.
 */
export const requireUserRole = requireAuth.concat(async ({ context, next }) => {
  if ((await profileService.getRole(context.db, context.user.id)) === "admin") {
    throw new ORPCError("FORBIDDEN")
  }

  return next()
})
