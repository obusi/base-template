import { ORPCError } from "@orpc/server"

import { os } from "@packages/api/orpc"

/**
 * The only place in this repo that decides whether a request is authenticated.
 *
 * Procedures that carry it can read `context.user` and know it is not null;
 * procedures that do not carry it have no `context.user` to read, so forgetting
 * the middleware is a type error rather than an open door.
 *
 * Authorization — whether *this* user may touch *that* row — is deliberately
 * not here. It belongs in each handler's `where` clause, where it is visible
 * next to the query it constrains. See docs/architecture.md section 6.
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
