// The read side. There is no procedure that edits a report — `status` changes
// through db:studio for now — so this page only ever lists.

import { ORPCError } from "@orpc/client"
import { notFound } from "next/navigation"

import { client } from "@/lib/orpc"

export async function AdminReportsPage() {
  const { items } = await listReports()

  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-8 p-6">
      <h1 className="text-xl font-medium">Reports</h1>

      {items.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nothing reported yet.</p>
      ) : (
        <ul className="flex flex-col gap-4">
          {items.map((report) => (
            <li
              key={report.id}
              className="flex flex-col gap-2 rounded-md border p-4"
            >
              <div className="flex items-center gap-2 text-sm">
                <span className="rounded bg-muted px-2 py-0.5 capitalize">
                  {report.category}
                </span>
                <span className="text-muted-foreground capitalize">
                  {report.status}
                </span>

                {/* Rendered from ISO rather than toLocaleString: this runs on
                    the server, and a locale-formatted date would be the
                    server's idea of local, not the reader's. */}
                <span className="ml-auto text-muted-foreground">
                  {report.createdAt
                    .toISOString()
                    .slice(0, 16)
                    .replace("T", " ")}
                </span>
              </div>

              <p className="text-sm whitespace-pre-wrap">{report.message}</p>

              {report.attachments.length > 0 && (
                <ul className="flex flex-wrap gap-2">
                  {report.attachments.map((attachment) => (
                    <li key={attachment.id}>
                      <a href={attachment.url} target="_blank" rel="noreferrer">
                        {/*
                          A plain <img>, not next/image. The src is a signed URL
                          that expires in minutes, so there is no stable remote
                          pattern to allow and nothing worth an optimiser cache
                          keyed on a URL built to go stale.
                        */}
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={attachment.url}
                          alt="Attached by the reporter"
                          className="size-20 rounded border object-cover"
                        />
                      </a>
                    </li>
                  ))}
                </ul>
              )}

              <dl className="grid grid-cols-[auto_1fr] gap-x-3 text-xs text-muted-foreground">
                <dt>Reporter</dt>
                <dd className="truncate">{report.reporterId}</dd>

                {report.pageUrl && (
                  <>
                    <dt>Page</dt>
                    <dd className="truncate">{report.pageUrl}</dd>
                  </>
                )}

                {report.userAgent && (
                  <>
                    <dt>Browser</dt>
                    <dd className="truncate">{report.userAgent}</dd>
                  </>
                )}
              </dl>
            </li>
          ))}
        </ul>
      )}
    </main>
  )
}

/**
 * 404 rather than an error page for anyone who is not an admin.
 *
 * The procedure has already refused them — this only decides what they see.
 * A "you are not allowed here" page would confirm the route exists, which is
 * the same thing `NOT_FOUND` avoids on the API side.
 */
async function listReports() {
  try {
    return await client.report.list({ limit: 20 })
  } catch (error) {
    if (
      error instanceof ORPCError &&
      (error.code === "FORBIDDEN" || error.code === "UNAUTHORIZED")
    ) {
      notFound()
    }

    throw error
  }
}
