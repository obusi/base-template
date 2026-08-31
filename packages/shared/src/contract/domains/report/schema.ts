// The shape of a problem report. The database table, the oRPC handler and the
// form in the browser all derive from what is here; none of the three
// redeclares it.

import { z } from "zod"

import {
  AttachmentInput,
  AttachmentSchema,
  MAX_ATTACHMENTS,
} from "./attachment"

// Stored as `text`, not a pg enum: adding a value to a pg enum takes a
// migration that ALTERs the type, and this list is the first thing a project
// edits. Validation happens here instead, once, on the way in.
export const ReportCategory = z.enum([
  "bug",
  "content",
  "billing",
  "account",
  "other",
])

// Where a report has got to, from an admin's point of view. `new` is the
// database's default, so a report that nobody has touched already reads as one
// of these rather than as an empty string.
//
// A `text` column and a zod enum for the same reason as `category`: this list
// is the second thing a project edits, and a pg enum would charge a migration
// that ALTERs the type for every edit.
export const ReportStatus = z.enum([
  "new",
  "investigating",
  "resolved",
  "dismissed",
])

export const ReportSchema = z.object({
  id: z.uuid(),
  reporterId: z.string(),
  // Both are `text` columns, and both are plain strings on the way out even
  // though each is an enum on the way in. Output validation runs against
  // whatever the row actually holds, and rows outlive the lists above: a value
  // written before either list last changed should show up in the admin list
  // as-is, not fail the schema and turn every read into a 500.
  category: z.string(),
  status: z.string(),

  message: z.string(),
  pageUrl: z.string().nullable(),
  userAgent: z.string().nullable(),
  createdAt: z.date(),
  updatedAt: z.date(),
})

export type Report = z.infer<typeof ReportSchema>

// `list` only. `create` answers with the bare report: the caller has just
// uploaded the files and has no use for signed URLs pointing back at them.
export const ReportWithAttachmentsSchema = ReportSchema.extend({
  attachments: z.array(AttachmentSchema),
})

// Written out rather than derived from ReportSchema with `.pick()`: input
// needs limits that output does not, and half of what a report is stored with
// is captured by the server rather than sent by the caller.
export const CreateReportInput = z.object({
  category: ReportCategory,
  message: z.string().min(1).max(5_000),

  // Optional because a caller that is not a browser — the REST door at
  // /api/v1 — has no page to name.
  pageUrl: z.url().max(2_000).optional(),

  // Files already uploaded through `createUploadUrls`, named by the paths that
  // call handed out. Defaulted to empty so a caller with no interest in
  // attachments — the REST door, a script — sends the body it always did.
  attachments: z.array(AttachmentInput).max(MAX_ATTACHMENTS).default([]),
})

// The one thing an admin may change about somebody else's report. Deliberately
// not a general `UpdateReportInput`: the message, the category and the captured
// context are the reporter's account of what happened, and an endpoint that
// could rewrite them would be a way to edit a record of what was said.
export const UpdateReportStatusInput = z.object({
  id: z.uuid(),
  status: ReportStatus,
})

export const ListReportsInput = z.object({
  limit: z.number().int().min(1).max(100).default(20),

  // Cursor rather than offset, for the reason spelled out in the post domain:
  // a report arriving while an admin reads page 1 would otherwise push a row
  // onto page 2 and show it twice.
  cursor: z.uuid().optional(),
})

export const ListReportsOutput = z.object({
  items: z.array(ReportWithAttachmentsSchema),
  nextCursor: z.uuid().nullable(),
})
