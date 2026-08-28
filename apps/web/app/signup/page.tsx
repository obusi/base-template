import type { Metadata } from "next"

import { SignUpPage } from "@/features/auth"
import { env } from "@/env"

export const metadata: Metadata = {
  title: "Sign up",
}

// See app/signin/page.tsx for why the whole bag is forwarded, and why
// `googleEnabled` is decided here rather than inside the feature.
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  return (
    <SignUpPage
      searchParams={await searchParams}
      googleEnabled={Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET)}
    />
  )
}
