// Business logic for the report domain. Knows nothing about oRPC — see
// docs/architecture.md S2 and packages-api.md.
//
// There is no delete, and the only update is `status`. What a report says is
// the reporter's account of what happened; an admin moves it along a workflow
// rather than editing the record of what was said.

import { and, desc, eq, inArray, lt, or } from "drizzle-orm"

import { schema, type Database } from "@packages/db"
import type { Storage, UploadTarget } from "@packages/storage"

const { report, reportAttachment } = schema

/**
 * The bucket this domain's attachments live in.
 *
 * A constant rather than an environment variable, because it cannot actually
 * vary: the bucket is declared as `[storage.buckets.report-attachments]` in
 * `supabase/config.toml`, and that declaration is what creates it — locally
 * through `supabase start`, on a hosted project through
 * `supabase seed buckets`. Pointing an env var at some other name without
 * editing that file would aim the app at a bucket nobody made, so the
 * configurability was never real. Two places that must agree, not six.
 *
 * Still named for the domain rather than for storage in general. A bucket is
 * where Supabase keeps the size limit, the MIME allowlist and the public flag,
 * and not one of the three can be set per folder — so the next domain that
 * stores files declares a bucket of its own beside this one rather than a
 * folder inside this one.
 */
export const REPORT_BUCKET = "report-attachments"

type Report = typeof report.$inferSelect
type Attachment = typeof reportAttachment.$inferSelect

export type ReportWithAttachments = Report & {
  attachments: Array<
    Pick<Attachment, "id" | "contentType" | "size"> & {
      url: string
    }
  >
}

/**
 * Every object a given caller is allowed to attach lives under this prefix.
 *
 * The caller sends paths back when it creates the report, and a caller can
 * send any string it likes. Namespacing by user id turns "is this yours?" into
 * a string comparison the router can make without a round trip — the same
 * instinct as putting ownership in a `where` clause instead of reading a row
 * and then checking it.
 */
export function attachmentPrefix(userId: string): string {
  return `report/${userId}/`
}

const EXTENSIONS: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
}

/**
 * Somewhere to put each file the caller is about to upload.
 *
 * The path is minted here, never accepted from the caller: a caller that chose
 * its own could overwrite somebody else's object, or write outside its prefix
 * and defeat the check above.
 */
export async function createUploadTargets(
  storage: Storage,
  userId: string,
  files: Array<{ contentType: string }>
): Promise<UploadTarget[]> {
  return Promise.all(
    files.map((file) =>
      storage.createUploadUrl(
        `${attachmentPrefix(userId)}${crypto.randomUUID()}.${
          EXTENSIONS[file.contentType] ?? "bin"
        }`
      )
    )
  )
}

export async function createReport(
  db: Database,
  reporterId: string,
  input: {
    category: string
    message: string
    pageUrl?: string
    userAgent?: string
    attachments: Array<{ path: string; contentType: string; size: number }>
  }
): Promise<Report> {
  const { attachments, ...fields } = input

  // One transaction, so a report never exists with half its images: the rows
  // are written together or not at all.
  return db.transaction(async (tx) => {
    const [row] = await tx
      .insert(report)
      .values({ ...fields, reporterId })
      .returning()

    if (!row) {
      throw new Error("insert returned no row")
    }

    if (attachments.length > 0) {
      await tx
        .insert(reportAttachment)
        .values(
          attachments.map((attachment) => ({ ...attachment, reportId: row.id }))
        )
    }

    return row
  })
}

/**
 * Move a report along, answering with the row as it now stands.
 *
 * `undefined` for an id that matches nothing — the router turns that into
 * NOT_FOUND. Nothing is thrown here, and nothing from `@orpc/*` is imported;
 * see packages-api.md.
 *
 * No ownership in the `where` clause, unlike every other write in this repo,
 * and the absence is the point: a report belongs to the person who raised it,
 * while the status belongs to whoever is dealing with it. `requireAdminRole`
 * on the procedure is the whole rule, and there is nothing narrower to add —
 * scoping by `reporterId` here would let a reporter close their own report and
 * stop an admin from touching it.
 */
export async function updateReportStatus(
  db: Database,
  id: string,
  status: string
): Promise<Report | undefined> {
  const [row] = await db
    .update(report)
    .set({ status })
    .where(eq(report.id, id))
    .returning()

  return row
}

export async function listReports(
  db: Database,
  storage: Storage | null,
  input: { cursor?: string; limit: number }
): Promise<{ items: ReportWithAttachments[]; nextCursor: string | null }> {
  // Keyset paging, not `offset`: a report arriving while an admin reads page 1
  // shifts everything down, and with `offset` they would see one row twice.
  // Same shape as listPosts.
  const after = input.cursor
    ? await db
        .select({ createdAt: report.createdAt, id: report.id })
        .from(report)
        .where(eq(report.id, input.cursor))
        .limit(1)
        .then((rows) => rows[0])
    : undefined

  // One more than asked for: if it comes back, there is another page, and no
  // second count query is needed to find that out.
  const rows = await db
    .select()
    .from(report)
    .where(
      after
        ? or(
            lt(report.createdAt, after.createdAt),
            and(eq(report.createdAt, after.createdAt), lt(report.id, after.id))
          )
        : undefined
    )
    .orderBy(desc(report.createdAt), desc(report.id))
    .limit(input.limit + 1)

  const items = rows.slice(0, input.limit)
  const hasMore = rows.length > input.limit

  return {
    items: await withAttachments(db, storage, items),
    nextCursor: hasMore ? (items.at(-1)?.id ?? null) : null,
  }
}

/**
 * One query for the whole page's attachments rather than one per report, then
 * one signature per attachment.
 *
 * With no storage configured, rows written while it was configured are still
 * listed — without URLs, because there is nothing that could sign them. The
 * report itself is the part an admin needs to read.
 */
async function withAttachments(
  db: Database,
  storage: Storage | null,
  reports: Report[]
): Promise<ReportWithAttachments[]> {
  if (reports.length === 0) return []

  const rows = await db
    .select()
    .from(reportAttachment)
    .where(
      inArray(
        reportAttachment.reportId,
        reports.map((row) => row.id)
      )
    )
    .orderBy(reportAttachment.createdAt)

  // Signed in parallel: one round trip each, and a page of three-per-report
  // would otherwise be sixty sequential calls.
  const signed = await Promise.all(
    rows.map(async (row) => ({
      reportId: row.reportId,
      attachment: {
        id: row.id,
        contentType: row.contentType,
        size: row.size,
        url: storage ? await storage.createDownloadUrl(row.path) : "",
      },
    }))
  )

  return reports.map((row) => ({
    ...row,
    attachments: signed
      .filter((entry) => entry.reportId === row.id)
      .map((entry) => entry.attachment),
  }))
}
