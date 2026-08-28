// The top bar for every page outside the auth flow — see
// app/(app)/layout.tsx for which routes that is and why signin/signup/
// forgot-password/reset-password stay outside it.
//
// A Server Component, not a client one: the session decides which half of
// the right side renders, and fetching it here means the HTML that leaves
// the server is already correct — no flash of the signed-out state while a
// client-side session check catches up. Same pattern as
// features/post/posts-page.tsx.
//
// Lives outside any one feature's folder because it isn't owned by one
// domain: the identity half comes from auth, the "Posts" link from post, and
// "Report a problem" from report.
//
// There is deliberately no link to /admin/reports. Knowing whether to render
// one would mean reading the caller's role on every page in the app, and an
// admin can type the URL. See
// .claude/rules/apps-web-structure.md on components/ vs features/.

import { GalleryVerticalEndIcon } from "lucide-react"
import Link from "next/link"

import { buttonVariants } from "@packages/ui/components/button"

import { authPath, UserMenu } from "@/features/auth"
import { ReportLink } from "@/features/report"
import { getSession } from "@/lib/session"

export async function NavBar() {
  const session = await getSession()

  return (
    <header className="border-b">
      <div className="mx-auto flex h-14 max-w-2xl items-center justify-between gap-4 px-6">
        <div className="flex items-center gap-6">
          <Link href="/" className="flex items-center gap-2 font-medium">
            <GalleryVerticalEndIcon className="size-5" />
            <span>base-template</span>
          </Link>

          <Link
            href="/posts"
            className="text-sm text-muted-foreground hover:text-foreground"
          >
            Posts
          </Link>

          <ReportLink className="text-sm text-muted-foreground hover:text-foreground">
            Report a problem
          </ReportLink>
        </div>

        {session ? (
          <UserMenu
            name={session.user.name}
            email={session.user.email}
            image={session.user.image}
          />
        ) : (
          <div className="flex items-center gap-2">
            <Link
              href={authPath("/signin")}
              className={buttonVariants({ variant: "ghost", size: "sm" })}
            >
              Sign in
            </Link>
            <Link
              href={authPath("/signup")}
              className={buttonVariants({ size: "sm" })}
            >
              Sign up
            </Link>
          </div>
        )}
      </div>
    </header>
  )
}
