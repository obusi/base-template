import type { Metadata } from "next"

import { SignUpPage } from "@/features/auth"

export const metadata: Metadata = {
  title: "Sign up",
}

export default function Page() {
  return <SignUpPage />
}
