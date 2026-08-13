// Example domain — the pattern every real router should copy. Delete when
// starting a real project; see docs/architecture.md section 11.

import { and, desc, eq, lt, or, sql } from "drizzle-orm"

import { schema } from "@packages/db"

import { requireAuth } from "@packages/api/middleware/auth"
import { os } from "@packages/api/orpc"

const { post } = schema

/** Posts one author may hold. A real project would read this from a plan. */
const POST_LIMIT = 50

export const list = os.post.list.handler(async ({ context, input }) => {
  // Keyset paging, not `offset`: a row inserted while the reader is on page 1
  // shifts everything down, and with `offset` they would see one row twice.
  // The cursor names a row, so the next page starts strictly after it whatever
  // else has happened.
  const after = input.cursor
    ? await context.db
        .select({ createdAt: post.createdAt, id: post.id })
        .from(post)
        .where(eq(post.id, input.cursor))
        .limit(1)
        .then((rows) => rows[0])
    : undefined

  // One more than asked for: if it comes back, there is another page, and no
  // second count query is needed to find that out.
  const rows = await context.db
    .select()
    .from(post)
    .where(
      after
        ? or(
            lt(post.createdAt, after.createdAt),
            and(eq(post.createdAt, after.createdAt), lt(post.id, after.id))
          )
        : undefined
    )
    .orderBy(desc(post.createdAt), desc(post.id))
    .limit(input.limit + 1)

  const items = rows.slice(0, input.limit)
  const hasMore = rows.length > input.limit

  return {
    items,
    nextCursor: hasMore ? (items.at(-1)?.id ?? null) : null,
  }
})

export const byId = os.post.byId.handler(async ({ context, input, errors }) => {
  const row = await context.db
    .select()
    .from(post)
    .where(eq(post.id, input.id))
    .limit(1)
    .then((rows) => rows[0])

  if (!row) {
    throw errors.NOT_FOUND()
  }

  return row
})

export const create = os.post.create
  .use(requireAuth)
  .handler(async ({ context, input, errors }) => {
    const [used] = await context.db
      .select({ count: sql<number>`count(*)::int` })
      .from(post)
      .where(eq(post.authorId, context.user.id))

    if ((used?.count ?? 0) >= POST_LIMIT) {
      // Declared in the contract with its limit attached, so the client can
      // say "you can have 50" instead of inventing its own number.
      throw errors.QUOTA_EXCEEDED({ data: { limit: POST_LIMIT } })
    }

    const [row] = await context.db
      .insert(post)
      .values({ ...input, authorId: context.user.id })
      .returning()

    if (!row) {
      throw new Error("insert returned no row")
    }

    return row
  })

export const update = os.post.update
  .use(requireAuth)
  .handler(async ({ context, input, errors }) => {
    const { id, ...changes } = input

    // Ownership is part of the `where`, not a separate read-then-check. Two
    // statements leave a window in which the row can change owner between
    // them, and this way a post belonging to somebody else simply matches
    // nothing.
    const [row] = await context.db
      .update(post)
      .set(changes)
      .where(and(eq(post.id, id), eq(post.authorId, context.user.id)))
      .returning()

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
    const [row] = await context.db
      .delete(post)
      .where(and(eq(post.id, input.id), eq(post.authorId, context.user.id)))
      .returning({ id: post.id })

    if (!row) {
      throw errors.NOT_FOUND()
    }

    return row
  })

export const postRouter = { list, byId, create, update, delete: remove }
