// What an admin reads, and the one thing they can change. A report's message,
// category and captured context are the reporter's account of what happened
// and stay read-only; `status` is where the admin is up to with it.
//
// Editing it is behind the `report-status` flag. The answer is decided here,
// on the server, and handed down as `canSetStatus` — a client component cannot
// read a flag, and should not need to.
//
// The first page is fetched here rather than prefetched into the query cache,
// because `listReports` below has to be able to catch a refusal. `prefetchQuery`
// swallows errors by design, which would turn that backstop into a blank list.

import { ORPCError } from "@orpc/client"
import { notFound } from "next/navigation"

import { features } from "@/lib/features"
import { client } from "@/lib/orpc"
import { PAGE_SIZE } from "@/lib/pagination"

import { ReportList } from "./components/report-list"

export async function AdminReportsPage() {
  const firstPage = await listReports()

  // Read once for the page rather than inside the loop: the answer cannot
  // differ per row, and asking per row would suggest it might.
  const canSetStatus = features.isOn("report-status")

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-8 p-6">
      <h1 className="text-xl font-medium">Reports</h1>

      <ReportList initialPage={firstPage} canSetStatus={canSetStatus} />
    </main>
  )
}

/**
 * 404 rather than an error page, for the one case the segment's layout cannot
 * cover.
 *
 * `app/(app)/(admin)/layout.tsx` is what stops a non-admin entering, and it runs
 * once. A layout does not re-render on a client-side navigation within its own
 * segment, so an admin whose role is revoked while they sit on this page would
 * otherwise meet an unhandled FORBIDDEN on the next fetch. This is that
 * backstop, not a second copy of the rule.
 */
async function listReports() {
  try {
    return await client.report.list({ limit: PAGE_SIZE })
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
