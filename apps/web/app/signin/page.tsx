import type { Metadata } from "next"

import { SignInPage } from "@/features/auth"

export const metadata: Metadata = {
  title: "Sign in",
}

// The whole bag is forwarded rather than one named parameter: which key holds
// the post-sign-in destination is `features/auth`'s business, not routing's.
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  return <SignInPage searchParams={await searchParams} />
}
