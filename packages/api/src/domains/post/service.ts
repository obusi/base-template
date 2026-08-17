// Business logic for the post domain. Deliberately knows nothing about
// oRPC — no context, no errors, no middleware — so another domain's service
// could call these functions directly without dragging oRPC along. See
// docs/architecture.md S2.
//
// "Not found" is a plain `undefined`; a router turns that into NOT_FOUND.
// `createPost` can't use the same trick for the quota check because it needs
// to hand back the limit too, so it returns a discriminated result instead
// of throwing — an oRPC error thrown here would leak the one thing this file
// is trying not to depend on.

import { and, desc, eq, lt, or, sql } from "drizzle-orm"

import { schema, type Database } from "@packages/db"

const { post } = schema

/** Posts one author may hold. A real project would read this from a plan. */
const POST_LIMIT = 50

type Post = typeof post.$inferSelect

export async function listPosts(
  db: Database,
  input: { cursor?: string; limit: number }
): Promise<{ items: Post[]; nextCursor: string | null }> {
  // Keyset paging, not `offset`: a row inserted while the reader is on page 1
  // shifts everything down, and with `offset` they would see one row twice.
  // The cursor names a row, so the next page starts strictly after it whatever
  // else has happened.
  const after = input.cursor
    ? await db
        .select({ createdAt: post.createdAt, id: post.id })
        .from(post)
        .where(eq(post.id, input.cursor))
        .limit(1)
        .then((rows) => rows[0])
    : undefined

  // One more than asked for: if it comes back, there is another page, and no
  // second count query is needed to find that out.
  const rows = await db
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
}

export async function getPostById(
  db: Database,
  id: string
): Promise<Post | undefined> {
  return db
    .select()
    .from(post)
    .where(eq(post.id, id))
    .limit(1)
    .then((rows) => rows[0])
}

export type CreatePostResult =
  | { ok: true; post: Post }
  | { ok: false; limit: number }

export async function createPost(
  db: Database,
  authorId: string,
  input: { title: string; content: string }
): Promise<CreatePostResult> {
  const [used] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(post)
    .where(eq(post.authorId, authorId))

  if ((used?.count ?? 0) >= POST_LIMIT) {
    return { ok: false, limit: POST_LIMIT }
  }

  const [row] = await db
    .insert(post)
    .values({ ...input, authorId })
    .returning()

  if (!row) {
    throw new Error("insert returned no row")
  }

  return { ok: true, post: row }
}

export async function updatePost(
  db: Database,
  authorId: string,
  id: string,
  changes: { title?: string; content?: string }
): Promise<Post | undefined> {
  // Ownership is part of the `where`, not a separate read-then-check. Two
  // statements leave a window in which the row can change owner between
  // them, and this way a post belonging to somebody else simply matches
  // nothing.
  const [row] = await db
    .update(post)
    .set(changes)
    .where(and(eq(post.id, id), eq(post.authorId, authorId)))
    .returning()

  return row
}

export async function deletePost(
  db: Database,
  authorId: string,
  id: string
): Promise<{ id: string } | undefined> {
  const [row] = await db
    .delete(post)
    .where(and(eq(post.id, id), eq(post.authorId, authorId)))
    .returning({ id: post.id })

  return row
}
