"use client"

// The last resort: `app/layout.tsx` itself threw, so there is no root layout to
// render inside and `app/error.tsx` never gets the chance. Next.js replaces the
// whole document here, which is why this file — alone among the boundaries —
// carries its own `<html>` and `<body>`.
//
// Everything the root layout provides is therefore gone: the fonts, and
// `Providers`, which is where `next-themes` lives. So this page has no theme to
// follow and renders in whatever `globals.css` declares on `:root` — light. It
// is imported here rather than inherited for the same reason: a stylesheet the
// root layout imports is not loaded when the root layout is what failed.
//
// Nothing in here may depend on the app booting correctly. No session, no oRPC
// call, no context — if this file needs something to work, there is no boundary
// left underneath to catch it.

import "@packages/ui/globals.css"

import { MessageScreen } from "@/components/message-screen"

export default function GlobalError({
  error,
}: {
  error: Error & { digest?: string }
}) {
  return (
    <html lang="en">
      <body className="flex min-h-svh flex-col antialiased">
        <MessageScreen
          title="Something went wrong"
          description="The application failed to start. Reloading the page is worth trying; if it keeps happening, the problem is on our side and is already being reported."
        >
          {/* `reset()` is deliberately not offered, and neither is
                `next/link`. Both re-render the root layout that just threw,
                which on anything but a momentary failure loops straight back to
                this screen. A full document load is the only option here that
                is not a guess, which is why the lint rule is waived rather than
                followed. */}
          {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
          <a
            href="/"
            className="text-sm text-muted-foreground underline-offset-4 hover:underline"
          >
            Reload
          </a>
        </MessageScreen>

        {error.digest && (
          <p className="pb-6 text-center font-mono text-xs text-muted-foreground">
            {error.digest}
          </p>
        )}
      </body>
    </html>
  )
}
