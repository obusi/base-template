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

export const ReportSchema = z.object({
  id: z.uuid(),
  reporterId: z.string(),
  // Both are `text` columns, and both are plain strings on the way out even
  // though `category` is an enum on the way in. Output validation runs against
  // whatever the row actually holds: `status` is edited by hand in db:studio
  // today, and a value written before the category list last changed should
  // show up in the admin list as-is, not fail the schema and turn every read
  // into a 500.
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
