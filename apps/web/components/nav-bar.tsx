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
// domain: the identity half comes from auth and the "Posts" link from post.
//
// "Report a problem" is not here — it sits in the account menu, because
// reporting needs a session anyway and a signed-out navbar has no use for it.
// The theme control is in both places for the opposite reason: everyone needs
// it, signed in or not, so it sits beside "Sign in" for a visitor and moves
// into the account menu once there is a menu to hold it.
// Neither is a link to /admin/reports: knowing whether to render one would
// mean reading the caller's role on every page in the app, and an admin can
// type the URL. See
// .claude/rules/apps-web-structure.md on components/ vs features/.

import { GalleryVerticalEndIcon } from "lucide-react"
import Link from "next/link"

import { buttonVariants } from "@packages/ui/components/button"

import { ThemeToggle } from "@/components/theme-toggle"
import { authPath, isAdmin, UserMenu } from "@/features/auth"
import { ReportMenuItem } from "@/features/report"
import { getSession } from "@/lib/session"

export async function NavBar() {
  const session = await getSession()

  // Which half of the app this account belongs to. Costs nothing extra: the
  // group layout under this one asks the same question, and `getRole` is
  // memoised per request, so the two share one call. Without it the navbar
  // would offer an admin a link that redirects them straight back.
  const admin = await isAdmin()

  return (
    <header className="border-b">
      {/* The row does not fit a 375px phone with everything on it — wordmark,
          one link, the theme button and two auth buttons come to 415px — so
          below `sm` the gaps tighten and the wordmark drops to its icon,
          which still links home. The padding stays at `px-6` at every width:
          it is what lines the bar up with the `p-6` on every page below it. */}
      <div className="mx-auto flex h-14 max-w-5xl items-center justify-between gap-2 px-6 sm:gap-4">
        <div className="flex items-center gap-4 sm:gap-6">
          <Link
            href={admin ? "/admin" : "/"}
            className="flex items-center gap-2 font-medium whitespace-nowrap"
          >
            <GalleryVerticalEndIcon className="size-5" />
            <span className="hidden sm:inline">base-template</span>
          </Link>

          <Link
            href={admin ? "/admin/reports" : "/posts"}
            className="text-sm text-muted-foreground hover:text-foreground"
          >
            {admin ? "Reports" : "Posts"}
          </Link>
        </div>

        {session ? (
          <UserMenu
            name={session.user.name}
            email={session.user.email}
            image={session.user.image}
            extraItems={<ReportMenuItem />}
          />
        ) : (
          <div className="flex items-center gap-2">
            <ThemeToggle />

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
