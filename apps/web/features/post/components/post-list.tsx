"use client"

// Example domain — delete alongside posts-page.tsx.
//
// The client half of the list. The server rendered the first page into the
// HTML; this takes that page as its starting cache and asks for the rest as
// the reader scrolls.
//
// `initialData` rather than a `<HydrationBoundary>` around a prefetch, and the
// difference matters for one specific reason: the page above still `await`s
// the first call itself, so a procedure that refuses — the report list does,
// on a role change mid-session — throws where the page can answer it.
// `prefetchQuery` swallows errors by design, which would turn that backstop
// into a silently empty list. Reach for the prefetch pattern when the server
// component has nothing to do with the result; reach for this when it does.

import { useInfiniteQuery } from "@tanstack/react-query"

import type { Post } from "@packages/shared"

import { LoadMore } from "@/components/load-more"
import { PAGE_SIZE } from "@/lib/pagination"
import { orpc } from "@/lib/orpc-query"

import { PostItem } from "./post-item"

type Page = { items: Post[]; nextCursor: string | null }

export function PostList({
  initialPage,
  viewerId,
}: {
  initialPage: Page
  viewerId?: string
}) {
  const { data, hasNextPage, isFetchingNextPage, fetchNextPage } =
    useInfiniteQuery(
      orpc.post.list.infiniteOptions({
        input: (cursor: string | undefined) => ({ limit: PAGE_SIZE, cursor }),
        initialPageParam: undefined as string | undefined,

        // `undefined` ends the query; `null` would be read as a real page
        // parameter and ask for one more page that does not exist.
        getNextPageParam: (page: Page) => page.nextCursor ?? undefined,

        // Seeded with what the server already fetched, so the browser does not
        // ask for page one a second time on hydration.
        initialData: { pages: [initialPage], pageParams: [undefined] },
      })
    )

  const posts = data.pages.flatMap((page) => page.items)

  if (posts.length === 0) {
    return <p className="text-sm text-muted-foreground">Nothing here yet.</p>
  }

  return (
    <>
      <ul className="flex flex-col gap-4">
        {posts.map((post) => (
          <PostItem
            key={post.id}
            post={post}
            isOwner={post.authorId === viewerId}
          />
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
