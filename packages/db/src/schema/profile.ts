// Project-owned user data, kept out of Better Auth's `user` table so
// regenerating auth.ts (`auth:generate`) never has to be reconciled against
// business fields. One-to-one with `user`, so `userId` is the primary key
// directly — no separate `id` column, no extra index to cover it.

import { pgTable, text, timestamp } from "drizzle-orm/pg-core"

import { user } from "./auth"

export const profile = pgTable.withRLS("profile", {
  userId: text("user_id")
    .primaryKey()
    .references(() => user.id, { onDelete: "cascade" }),
  bio: text("bio"),
  phone: text("phone"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at")
    .defaultNow()
    .$onUpdate(() => new Date())
    .notNull(),
})
