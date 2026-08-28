import { ORPCError } from "@orpc/server"

import { getRole } from "../domains/profile/service"
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
 * The one authorization rule that cannot be a `where` clause.
 *
 * Row ownership belongs in the query that reads the row, and every handler
 * here still does that. `report.list` is the exception the rule does not
 * cover: it is not scoped to the caller at all, so what decides the answer is
 * who is asking rather than which rows match. That question has exactly one
 * answer, so it lives in exactly one middleware.
 *
 * Built with `.concat` on `requireAuth` rather than declared beside it, so a
 * procedure carries one middleware instead of two in an order that could be
 * written wrongly. `.use(requireAdmin)` authenticates and authorizes.
 *
 * `FORBIDDEN`, not `NOT_FOUND`. The NOT_FOUND rule exists so a caller cannot
 * discover which ids are real from the error it gets back; this procedure
 * takes no id, so there is nothing to leak and the honest answer is the
 * useful one.
 */
export const requireAdmin = requireAuth.concat(async ({ context, next }) => {
  if ((await getRole(context.db, context.user.id)) !== "admin") {
    throw new ORPCError("FORBIDDEN")
  }

  return next()
})
