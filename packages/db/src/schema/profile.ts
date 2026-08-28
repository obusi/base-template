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

  // Who may read `report.list`, and the reason this table is where it lives:
  // `schema/auth.ts` is generated, so a column added to `user` by hand is
  // gone at the next `auth:generate`. Better Auth's admin plugin would put it
  // there legitimately, but drags ban / impersonate / list-users onto
  // /api/auth for every project forked from here. See docs/architecture.md S5.
  //
  // Nothing a caller sends can reach this column: `UpdateProfileInput` does
  // not declare it, and `updateProfile` only ever `.set()`s validated input.
  role: text("role").notNull().default("user"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at")
    .defaultNow()
    .$onUpdate(() => new Date())
    .notNull(),
})
