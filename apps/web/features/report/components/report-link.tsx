"use client"

// A client component for one reason: `usePathname`. Everything around it in
// the navbar stays a Server Component.

import Link from "next/link"
import { usePathname } from "next/navigation"

import { reportPath } from "../page-context"

export function ReportLink({
  className,
  children,
}: {
  className?: string
  children: React.ReactNode
}) {
  return (
    <Link href={reportPath(usePathname())} className={className}>
      {children}
    </Link>
  )
}
