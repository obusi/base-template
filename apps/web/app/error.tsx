"use client"

// What a user sees when something throws and nothing expected it — the UI half
// of the rule docs/architecture.md S7 states. That table's left column is
// already built: an error the contract declares reaches a `safe()` call and
// turns into a targeted message. Its right column — "something went wrong" —
// had nowhere to happen until this file existed, so an undeclared error
// rendered Next.js's own page instead: no navbar, no theme, and on production
// nothing but `Application error: a server-side exception has occurred`.
//
// One file, at the root. A per-group boundary would buy nothing: the layouts
// above whatever threw render either way — see the note in `not-found.tsx` —
// so this screen already appears under the navbar when the failure was inside
// `(app)`, and without it when the failure was above that group.
//
// It does not catch a throw from `app/layout.tsx` itself; nothing below the
// root layout can. `global-error.tsx` is that case.

import { useEffect } from "react"
import Link from "next/link"

import { Button } from "@packages/ui/components/button"

import { MessageScreen } from "@/components/message-screen"

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    // The third place this repo reports a bug, after the `onError`
    // interceptors on the two HTTP doors (`app/rpc/` and `app/api/v1/`) — and
    // the only one that covers what those two cannot. Neither of them sees a
    // Server Component's in-process call, and nothing server-side sees an
    // error thrown while rendering in the browser.
    //
    // What it can report is limited on purpose, and not by this file: React
    // replaces a server error's message and stack with a generic string before
    // sending it to the client, leaving `digest` as the only thread back to
    // the real one in the server log. So in production this logs a digest, and
    // in development the actual error. Swapping console for Sentry is a change
    // to this block alone.
    console.error(error)
  }, [error])

  return (
    <>
      <MessageScreen
        title="Something went wrong"
        description="This is a bug on our side, not something you did. It has been reported. Trying again often works, since most failures of this kind are momentary."
      >
        {/* Re-renders the segment that threw, rather than reloading the page —
            so a failure that was momentary costs the user nothing else. */}
        <Button onClick={reset}>Try again</Button>

        {/* `next/link` rather than an anchor: the root layout is intact — only
            a segment below it failed — so a client-side navigation is enough,
            and it keeps the app booted. `global-error.tsx` is the case where
            that reasoning does not hold. */}
        <Link
          href="/"
          className="text-sm text-muted-foreground underline-offset-4 hover:underline"
        >
          Go home
        </Link>
      </MessageScreen>

      {/* The one thing a person can carry to whoever will read the log. Absent
          in development, where the console above already has the real error. */}
      {error.digest && (
        <p className="pb-6 text-center font-mono text-xs text-muted-foreground">
          {error.digest}
        </p>
      )}
    </>
  )
}
