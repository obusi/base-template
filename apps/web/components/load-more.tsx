"use client"

// The bottom of a list that keeps going: an invisible marker that asks for the
// next page as soon as it scrolls into view.
//
// Here rather than in a feature because two unrelated ones need exactly this —
// `features/post` and `features/report` — which is the bar `components/` is
// meant to clear. It knows nothing about either: it is handed the three things
// `useInfiniteQuery` already returns and calls back when the reader reaches
// the end.
//
// shadcn has no component for this. Its `pagination` is numbered links, which
// is a different interaction and one a cursor cannot serve — a cursor answers
// "what comes after this row", never "what is on page 7".

import { useEffect, useRef } from "react"

import { Button } from "@packages/ui/components/button"

export function LoadMore({
  hasNextPage,
  isFetchingNextPage,
  onLoadMore,
}: {
  hasNextPage: boolean
  isFetchingNextPage: boolean
  onLoadMore: () => void
}) {
  const marker = useRef<HTMLDivElement>(null)

  // Kept in a ref rather than named in the dependency list below: the callback
  // identity changes on every render, and depending on it would rebuild the
  // observer on renders that have nothing to do with loading.
  //
  // Written in an effect rather than during render, because a render may be
  // thrown away and re-run, and a ref written on the way through would keep
  // the discarded attempt's value.
  const load = useRef(onLoadMore)

  useEffect(() => {
    load.current = onLoadMore
  })

  // Rebuilt when a fetch starts and again when it finishes, and that is the
  // part worth understanding: an observer reports *crossings*, not the state
  // it is in. A marker that is still on screen after a page arrives has not
  // crossed anything, so a long-lived observer goes quiet after one page and
  // the list stops halfway with the trigger sitting in view. Disconnecting for
  // the duration of the fetch and connecting again afterwards re-asks the
  // question, and the answer fires straight away while the marker is visible —
  // which is also what fills a screen taller than one page.
  useEffect(() => {
    const element = marker.current

    // Nothing to watch once the list has ended, and nothing to ask for while a
    // page is already on its way.
    if (!element || !hasNextPage || isFetchingNextPage) return

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) load.current()
      },
      // Ask before the marker is actually visible, so the next page is usually
      // there by the time the reader arrives at the end of this one.
      { rootMargin: "400px" }
    )

    observer.observe(element)

    return () => observer.disconnect()
  }, [hasNextPage, isFetchingNextPage])

  // The last page is the end of the list, not a control that does nothing.
  if (!hasNextPage) return null

  return (
    <div ref={marker} className="flex justify-center py-2">
      {/*
        A real button, not a bare spinner. The observer covers the ordinary
        case, and this covers the ones it cannot: a browser without
        IntersectionObserver, a reader moving by keyboard, and a screen reader,
        which has no notion of "scrolled into view" at all.
      */}
      <Button
        variant="ghost"
        size="sm"
        disabled={isFetchingNextPage}
        onClick={onLoadMore}
      >
        {isFetchingNextPage ? "Loading…" : "Load more"}
      </Button>
    </div>
  )
}
