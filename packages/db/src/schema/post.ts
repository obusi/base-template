// Example domain. Delete this file when starting a real project — see
// docs/architecture.md section 11 for the full list.
//
// Hand-written, unlike auth.ts: nothing generates it, so `withRLS` here is
// permanent rather than something a regeneration undoes.

import { index, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core"

import { user } from "./auth"

export const post = pgTable.withRLS(
  "post",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    title: text("title").notNull(),
    content: text("content").notNull(),

    // `text`, not `uuid`, because Better Auth generates its own ids and they
    // are not UUIDs. The column type has to match what it actually stores.
    authorId: text("author_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),

    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    index("post_author_id_idx").on(table.authorId),

    // Listing is ordered by (createdAt desc, id desc) and paged with a cursor,
    // so the index has to cover both columns in that order to be used.
    index("post_created_at_id_idx").on(table.createdAt, table.id),
  ]
)
