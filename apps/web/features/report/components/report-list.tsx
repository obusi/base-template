"use client"

// The rows of the admin list, and the scrolling that adds more of them. The
// page above fetches the first page on the server — see admin-reports-page.tsx
// for why it keeps doing that rather than prefetching into the cache.
//
// `canSetStatus` arrives as a prop rather than being read here, and it has to:
// `lib/features.ts` carries `server-only`, so a client component importing it
// fails the build. Named for what this component may do rather than for the
// flag behind it, so releasing the feature costs this file no edit.

import { useInfiniteQuery } from "@tanstack/react-query"

import type { ReportWithAttachments } from "@packages/shared"

import { LoadMore } from "@/components/load-more"
import { PAGE_SIZE } from "@/lib/pagination"
import { orpc } from "@/lib/orpc-query"

import { ReportStatusSelect } from "./report-status-select"

type Page = { items: ReportWithAttachments[]; nextCursor: string | null }

export function ReportList({
  initialPage,
  canSetStatus,
}: {
  initialPage: Page
  canSetStatus: boolean
}) {
  const { data, hasNextPage, isFetchingNextPage, fetchNextPage } =
    useInfiniteQuery(
      orpc.report.list.infiniteOptions({
        input: (cursor: string | undefined) => ({ limit: PAGE_SIZE, cursor }),
        initialPageParam: undefined as string | undefined,

        // `undefined` ends the query; `null` would be taken for a real cursor
        // and ask for a page that is not there.
        getNextPageParam: (page: Page) => page.nextCursor ?? undefined,
        initialData: { pages: [initialPage], pageParams: [undefined] },
      })
    )

  const reports = data.pages.flatMap((page) => page.items)

  if (reports.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">Nothing reported yet.</p>
    )
  }

  return (
    <>
      <ul className="flex flex-col gap-4">
        {reports.map((report) => (
          <li
            key={report.id}
            className="flex flex-col gap-2 rounded-md border p-4"
          >
            <div className="flex items-center gap-2 text-sm">
              <span className="rounded bg-muted px-2 py-0.5 capitalize">
                {report.category}
              </span>

              {canSetStatus ? (
                <ReportStatusSelect
                  reportId={report.id}
                  status={report.status}
                />
              ) : (
                <span className="text-muted-foreground capitalize">
                  {report.status}
                </span>
              )}

              {/* ISO rather than toLocaleString. The first page is rendered on
                  the server and the rest in the browser, so a locale-formatted
                  date would disagree with itself halfway down the list — and
                  differ again between the two on hydration. */}
              <span className="ml-auto text-muted-foreground">
                {report.createdAt.toISOString().slice(0, 16).replace("T", " ")}
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

      <LoadMore
        hasNextPage={hasNextPage}
        isFetchingNextPage={isFetchingNextPage}
        onLoadMore={() => void fetchNextPage()}
      />
    </>
  )
}
