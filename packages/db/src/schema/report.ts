// Problems raised by the people using the app. Unlike `post`, this is not an
// example to delete — every project forked from this template inherits it.
//
// Nothing here points at another table. A report is a message plus the context
// the server could capture on its own, deliberately not a polymorphic
// `subjectType`/`subjectId` pair: no foreign key can keep that honest, and a
// template cannot know which tables a project will have. A project that needs
// to report one specific row should add its own domain with a real reference.

import { index, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core"

import { user } from "./auth"

export const report = pgTable.withRLS(
  "report",
  {
    id: uuid("id").primaryKey().defaultRandom(),

    // `text`, not `uuid`, because Better Auth generates its own ids and they
    // are not UUIDs — same reason as post.authorId.
    reporterId: text("reporter_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),

    // `text` rather than a pg enum, for both of these. Adding a value to a pg
    // enum takes a migration that ALTERs the type, and these two are exactly
    // what a project edits first. The allowed values are declared once in
    // packages/shared and enforced by zod on the way in.
    category: text("category").notNull(),

    // Nothing writes this yet: `report.list` is read-only, so today it changes
    // through db:studio. It is here rather than in a later migration because
    // adding the column costs a migration while adding the procedure that
    // writes it does not.
    status: text("status").notNull().default("new"),

    message: text("message").notNull(),

    // Captured rather than asked for — the fewer fields a person has to fill
    // in, the more reports arrive. `pageUrl` comes from the browser;
    // `userAgent` is read from the request headers on the server, where a
    // form cannot forge it.
    pageUrl: text("page_url"),
    userAgent: text("user_agent"),

    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    // Listing is ordered by (createdAt desc, id desc) and paged with a cursor,
    // so the index has to cover both columns in that order to be used.
    index("report_created_at_id_idx").on(table.createdAt, table.id),
  ]
)
