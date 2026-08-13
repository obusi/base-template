// Example domain. Delete this folder when starting a real project — see
// docs/architecture.md section 11 for the full list of files to remove.
//
// These schemas are the single source of truth for the shape of a post. The
// database table, the oRPC handler, and the form in the browser all derive
// from them; none of the three redeclares them.

import { z } from "zod"

export const PostSchema = z.object({
  id: z.uuid(),
  title: z.string(),
  content: z.string(),
  authorId: z.string(),
  createdAt: z.date(),
  updatedAt: z.date(),
})

export type Post = z.infer<typeof PostSchema>

// Written out rather than derived from PostSchema with `.pick()`: input needs
// limits that output does not. `title: z.string()` is the right output type
// and the wrong input validation.
export const CreatePostInput = z.object({
  title: z.string().min(1).max(200),
  content: z.string().min(1).max(10_000),
})

export const UpdatePostInput = CreatePostInput.partial().extend({
  id: z.uuid(),
})

export const PostIdInput = PostSchema.pick({ id: true })

export const ListPostsInput = z.object({
  limit: z.number().int().min(1).max(100).default(20),

  // Cursor rather than offset: with `offset`, a row inserted while the user
  // reads page 1 pushes a row from page 1 onto page 2, and they see it twice.
  cursor: z.uuid().optional(),
})

export const ListPostsOutput = z.object({
  items: z.array(PostSchema),

  // `null` when there is no further page, so the client never has to compare
  // `items.length` against the requested limit to find out.
  nextCursor: z.uuid().nullable(),
})
