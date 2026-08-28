import type { Metadata } from "next"

import { SignInPage } from "@/features/auth"
import { env } from "@/env"

export const metadata: Metadata = {
  title: "Sign in",
}

// The whole bag is forwarded rather than one named parameter: which key holds
// the post-sign-in destination is `features/auth`'s business, not routing's.
//
// `googleEnabled` is the exception, and it has to be decided here: this is a
// Server Component and `SignInPage` is not, so this is the last place that can
// read the environment without publishing credentials to the browser.
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  return (
    <SignInPage
      searchParams={await searchParams}
      googleEnabled={Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET)}
    />
  )
}
