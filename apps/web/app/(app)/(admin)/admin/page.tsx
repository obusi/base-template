import type { Metadata } from "next"

import { AdminHomePage } from "@/features/admin"

export const metadata: Metadata = {
  title: "Admin",
}

export default function Page() {
  return <AdminHomePage />
}
