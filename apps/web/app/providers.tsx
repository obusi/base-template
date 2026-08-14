"use client"

import { useState } from "react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { ReactQueryDevtools } from "@tanstack/react-query-devtools"
import { ThemeProvider } from "next-themes"

import { Toaster } from "@packages/ui/components/toast"

export function Providers({ children }: { children: React.ReactNode }) {
  // Created in state, not at module scope. A module-level client is shared by
  // every request the server handles, which on a server means one user's
  // cached data can be rendered into another user's page.
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            // Server-rendered data arrives fresh. Without this, the browser
            // refetches everything the moment it hydrates.
            staleTime: 30_000,
          },
        },
      })
  )

  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider
        attribute="class"
        defaultTheme="system"
        enableSystem
        disableTransitionOnChange
      >
        {children}

        {/* `toast` is a manager created once at module scope, not read from
            context — calling toast.add() anywhere in the app works whether
            or not this sits above it in the tree. Toaster only needs to be
            mounted once, to render the queue that manager holds. */}
        <Toaster />
      </ThemeProvider>

      {/* Ships nothing in production: the package compiles to an empty
          component unless NODE_ENV is "development", which is also why it
          belongs in devDependencies. */}
      <ReactQueryDevtools initialIsOpen={false} />
    </QueryClientProvider>
  )
}
