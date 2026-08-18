// Adds the navbar on top of the root layout, for every route in this group
// and none outside it — a Next.js route group changes nothing about the URL
// (`(app)/posts/page.tsx` still serves `/posts`), it only opts these routes
// into an extra layer of layout. signin/signup/forgot-password/reset-password
// sit outside `(app)/` on purpose: those pages are the centred, distraction-
// free forms the shadcn blocks they're built from are meant to be, and a
// navbar competing for attention above them would work against that.

import { NavBar } from "@/components/nav-bar"

export default function AppLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <div className="flex min-h-svh flex-col">
      <NavBar />
      {children}
    </div>
  )
}
