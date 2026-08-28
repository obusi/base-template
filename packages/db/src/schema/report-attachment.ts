// Images a reporter attached to their report.
//
// A separate table rather than columns on `report`, because the count is a
// product decision that will change: three today, and moving that number
// should not mean a migration that adds `image_4`.
//
// The bytes live in object storage; this table holds only the key that names
// them. Nothing here is a URL — a stored URL would either be public (the
// bucket is not) or expire, and an expired URL in a database looks exactly
// like a working one. The URL an admin clicks is signed at read time.

import {
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core"

import { report } from "./report"

export const reportAttachment = pgTable.withRLS(
  "report_attachment",
  {
    id: uuid("id").primaryKey().defaultRandom(),

    reportId: uuid("report_id")
      .notNull()
      .references(() => report.id, { onDelete: "cascade" }),

    // The object key inside the bucket, e.g. `report/<user id>/<uuid>.png`.
    // The user id in the middle is load-bearing: it is what lets the handler
    // check that a caller is attaching an object it was given, rather than one
    // belonging to somebody else's report.
    path: text("path").notNull().unique(),

    contentType: text("content_type").notNull(),

    // Bytes. Recorded so the admin list can show a size without asking the
    // storage service, and so a project can total usage with one query.
    size: integer("size").notNull(),

    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [index("report_attachment_report_id_idx").on(table.reportId)]
)
