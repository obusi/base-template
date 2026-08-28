import { requireUserPage } from "@/features/auth"

// Everything the product itself offers lives under this group. An admin
// account is a back-office account and is sent to its own side instead — see
// features/auth/role.ts for why a redirect here and a 404 next door.
//
// The group name never appears in a URL, so `/` and `/posts` are unchanged.
// What it changes is that a page added here is guarded by where it sits.
export default async function UserLayout({
  children,
}: {
  children: React.ReactNode
}) {
  await requireUserPage()

  return children
}
