import { requireAdminPage } from "@/features/auth"

// Every route under /admin is guarded by this file existing, rather than by
// each page remembering to check. Still routing only, in the sense
// apps-web-structure.md means: the decision itself is one call into
// `features/auth`.
//
// The real refusal is `requireAdmin` in packages/api. This only decides what a
// non-admin sees on the way in.
export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode
}) {
  await requireAdminPage()

  return children
}
