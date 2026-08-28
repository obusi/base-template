// Where an admin lands after signing in, and the only page that knows what the
// back office contains. A project adds a section by adding a row here and a
// route under app/(app)/(admin)/admin/.
//
// It exists rather than sending admins straight to /admin/reports because the
// second admin page should not require rethinking where sign-in points.

import Link from "next/link"

const SECTIONS = [
  {
    href: "/admin/reports",
    title: "Reports",
    description: "Problems people using the app have raised.",
  },
] as const

export function AdminHomePage() {
  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-8 p-6">
      <div className="flex flex-col gap-2">
        <h1 className="text-xl font-medium">Admin</h1>
        <p className="text-sm text-muted-foreground">
          The back office. Everything the product itself offers lives on the
          other side, and this account cannot reach it.
        </p>
      </div>

      <ul className="flex flex-col gap-3">
        {SECTIONS.map((section) => (
          <li key={section.href}>
            <Link
              href={section.href}
              className="flex flex-col gap-1 rounded-md border p-4 hover:bg-muted/50"
            >
              <span className="font-medium">{section.title}</span>
              <span className="text-sm text-muted-foreground">
                {section.description}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </main>
  )
}
