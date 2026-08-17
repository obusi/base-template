import type { Metadata } from "next"

import { ResetPasswordPage } from "@/features/auth"

export const metadata: Metadata = {
  title: "Reset password",
}

// See app/signin/page.tsx for why the whole bag is forwarded.
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  return <ResetPasswordPage searchParams={await searchParams} />
}
