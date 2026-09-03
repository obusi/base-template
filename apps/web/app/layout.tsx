import type { Metadata } from "next"
import { Geist_Mono, Inter } from "next/font/google"

import "@packages/ui/globals.css"
import { Providers } from "@/app/providers"
import { env } from "@/env"
import { cn } from "@packages/ui/lib/utils"

const inter = Inter({ subsets: ["latin"], variable: "--font-sans" })

const fontMono = Geist_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
})

/**
 * Rename `title` and `description` for the project — they are what a browser
 * tab, a search result, and a link preview show.
 *
 * `template` applies to every route that exports a `title` of its own; the
 * `default` covers the ones that do not. A page can override either by
 * exporting its own `metadata`, and a page whose title depends on data uses
 * `generateMetadata` instead. Both are Server Component APIs, which is the
 * other half of the SEO rule in docs/architecture.md S4: a page that turns
 * itself into a Client Component to hold one `useState` loses this as well as
 * its server-rendered HTML.
 *
 * `metadataBase` reuses BETTER_AUTH_URL rather than adding a fourth variable
 * that would have to be kept equal to it. Both mean "the origin this app is
 * served from" — Better Auth builds callback links from it, and Next resolves
 * relative Open Graph image paths against it.
 */
export const metadata: Metadata = {
  metadataBase: new URL(env.BETTER_AUTH_URL),
  title: {
    default: "base-template",
    template: "%s · base-template",
  },
  description: "A typed full-stack monorepo on Next.js, oRPC, and Drizzle.",
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={cn(
        "antialiased",
        fontMono.variable,
        "font-sans",
        inter.variable
      )}
    >
      {/* The page column every route renders into. It lives here rather than
          in each screen because a boundary — error.tsx, not-found.tsx — renders
          in two different places: on its own below the root layout, and nested
          inside app/(app)/layout.tsx when that group is what threw. A height of
          its own would be right in the first case and 57px of overflow in the
          second. */}
      <body className="flex min-h-svh flex-col">
        <Providers>{children}</Providers>
      </body>
    </html>
  )
}
