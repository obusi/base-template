// Every 404 in the app, and there is deliberately only one file for them.
//
// Two different things arrive here. An unmatched URL, which reached no segment
// at all and so renders with nothing above it but the root layout. And a
// `notFound()` that some segment threw on purpose — `requireAdminPage()` in
// `features/auth/role.ts` is the live one, answering a signed-in non-admin who
// opened /admin.
//
// **The layouts that survive are decided by where `notFound()` was thrown, not
// by where this file sits.** That is worth stating because the opposite is easy
// to assume, and assuming it costs a file: an `(app)/not-found.tsx` looks like
// what keeps the navbar on the /admin case, and it is not. The throw happens in
// `(app)/(admin)/layout.tsx`, so `(app)/layout.tsx` had already rendered and
// stays rendered, navbar included — while this same file, reached by an
// unmatched URL, renders with no navbar because no group layout ran. Verified
// both ways in a browser rather than reasoned about.
//
// A Server Component. `not-found.tsx` takes no props and needs no interaction,
// so there is nothing to make it a client one.
//
// **The wording is a security decision, not a style one.** `requireAdminPage()`
// answers 404 to a non-admin *precisely so that the answer carries no
// information* — saying "you are not allowed here" would confirm the route
// exists, the same thing `NOT_FOUND` avoids on the API side. So this page must
// not mention permissions, accounts, or access either: a 404 that explains
// itself is a 403 wearing a different number.

import Link from "next/link"

import { buttonVariants } from "@packages/ui/components/button"

import { MessageScreen } from "@/components/message-screen"

export default function NotFound() {
  return (
    <MessageScreen
      title="Page not found"
      description="There is nothing at this address."
    >
      <Link href="/" className={buttonVariants()}>
        Go home
      </Link>
    </MessageScreen>
  )
}
