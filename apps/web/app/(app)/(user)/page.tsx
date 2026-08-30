// Placeholder landing page — replace it with the project's own. It is listed
// among the things a real project rewrites in docs/template.md S13.
//
// A Server Component with no data of its own, so there is nothing here worth
// copying as a pattern; docs/architecture.md S4 covers the two ways a page
// actually fetches.

import Link from "next/link"

import { buttonVariants } from "@packages/ui/components/button"

const links = [
  {
    href: "/posts",
    label: "Example domain",
    hint: "The post domain, wired contract → db → api → web. Sign in first.",
  },
  {
    href: "/api/docs",
    label: "API reference",
    hint: "Generated from the contract, with a request playground.",
  },
]

export default function Page() {
  return (
    <main className="mx-auto flex max-w-2xl flex-1 flex-col justify-center gap-8 p-6">
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-medium">base-template</h1>
        <p className="text-sm leading-relaxed text-muted-foreground">
          A typed full-stack monorepo: Next.js on top of oRPC, Drizzle, and
          Better Auth. Types run from the database schema to the browser without
          hand-written glue, and a page cannot reach the database except through
          a procedure that has already run authorization.
        </p>
      </div>

      <ul className="flex flex-col gap-3">
        {links.map((link) => (
          <li key={link.href} className="flex flex-col gap-1">
            <Link
              href={link.href}
              className={buttonVariants({ className: "w-fit" })}
            >
              {link.label}
            </Link>
            <span className="text-xs text-muted-foreground">{link.hint}</span>
          </li>
        ))}
      </ul>

      <p className="font-mono text-xs text-muted-foreground">
        Replace this page, then delete the example domain — see docs/template.md
        S14.
      </p>
    </main>
  )
}
