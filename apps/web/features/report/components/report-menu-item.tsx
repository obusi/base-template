"use client"

// The account menu's "Report a problem" entry.
//
// It lives in this feature rather than in `features/auth` because the href is
// this feature's business: the link carries the page it was clicked from, and
// `reportPath` owns the shape of that. The account menu just makes room for it.
//
// A Client Component for one reason, `usePathname`. It is handed to `UserMenu`
// from `components/nav-bar.tsx`, which is a Server Component and can import
// this feature's barrel safely — `UserMenu` itself cannot, because that barrel
// also exports pages that reach `lib/session.ts` and its `server-only` marker.

import Link from "next/link"
import { usePathname } from "next/navigation"

import { DropdownMenuItem } from "@packages/ui/components/dropdown-menu"

import { reportPath } from "../page-context"

export function ReportMenuItem() {
  return (
    <DropdownMenuItem render={<Link href={reportPath(usePathname())} />}>
      Report a problem
    </DropdownMenuItem>
  )
}
