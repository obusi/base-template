import { requireAdminPage } from "@/features/auth"

// The back office. `(admin)` is the guard's scope and never appears in a URL;
// the `admin/` folder inside it is the URL segment, so these pages stay at
// /admin and /admin/reports. Two folders because they do two different jobs.
export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode
}) {
  await requireAdminPage()

  return children
}
