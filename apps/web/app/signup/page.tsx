import type { Metadata } from "next"

import { SignUpPage } from "@/features/auth"

export const metadata: Metadata = {
  title: "Sign up",
}

// See app/signin/page.tsx for why the whole bag is forwarded.
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  return <SignUpPage searchParams={await searchParams} />
}
