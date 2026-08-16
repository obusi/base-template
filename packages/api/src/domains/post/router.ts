// Example domain — the pattern every real router should copy. Delete when
// starting a real project; see docs/architecture.md section 11.
//
// This file only translates between oRPC (context, errors, middleware) and
// ./service, which holds the actual logic. Keeping them apart means service
// functions take a database and plain arguments — nothing oRPC- or
// contract-shaped — so another domain's service could call them directly
// without dragging oRPC along. See docs/architecture.md section 3.

import { requireAuth } from "../../middleware/auth"
import { os } from "../../shared/builder"
import * as service from "./service"

export const list = os.post.list.handler(({ context, input }) =>
  service.listPosts(context.db, input)
)

export const byId = os.post.byId.handler(async ({ context, input, errors }) => {
  const row = await service.getPostById(context.db, input.id)

  if (!row) {
    throw errors.NOT_FOUND()
  }

  return row
})

export const create = os.post.create
  .use(requireAuth)
  .handler(async ({ context, input, errors }) => {
    const result = await service.createPost(context.db, context.user.id, input)

    if (!result.ok) {
      // Declared in the contract with its limit attached, so the client can
      // say "you can have 50" instead of inventing its own number.
      throw errors.QUOTA_EXCEEDED({ data: { limit: result.limit } })
    }

    return result.post
  })

export const update = os.post.update
  .use(requireAuth)
  .handler(async ({ context, input, errors }) => {
    const { id, ...changes } = input
    const row = await service.updatePost(
      context.db,
      context.user.id,
      id,
      changes
    )

    // NOT_FOUND covers both "no such post" and "not yours". Telling them apart
    // would turn this endpoint into a way to discover which ids exist.
    if (!row) {
      throw errors.NOT_FOUND()
    }

    return row
  })

export const remove = os.post.delete
  .use(requireAuth)
  .handler(async ({ context, input, errors }) => {
    const row = await service.deletePost(context.db, context.user.id, input.id)

    if (!row) {
      throw errors.NOT_FOUND()
    }

    return row
  })

export const postRouter = { list, byId, create, update, delete: remove }
