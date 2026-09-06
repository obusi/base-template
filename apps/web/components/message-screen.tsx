// The one screen behind all three boundaries in `app/`: `not-found.tsx`,
// `error.tsx`, and the last-resort `global-error.tsx`. Three files that each
// say a different thing but look the same, so the markup lives here rather than
// three times over.
//
// It sits in `components/` rather than a feature because it belongs to no
// domain — the same reason `nav-bar.tsx` does. See
// .claude/rules/apps-web-structure.md.
//
// No `"use client"`, deliberately. `not-found.tsx` is a Server Component and
// `error.tsx` cannot be one, so the shared piece has to work as both, which it
// does as long as it holds no hook and no handler of its own. The interactive
// part — a button that retries — is passed in as `children` by the boundary
// that already runs in the browser.
//
// `flex-1` and no height of its own, because the same file renders in two
// places: directly under the root layout when an unmatched URL had no segment
// to fail in, and nested inside `app/(app)/layout.tsx` under the navbar when
// something in that group threw. `min-h-svh` here would be right in the first
// case and 57px of overflow in the second. The column both cases rely on is on
// `<body>` in `app/layout.tsx`.

export function MessageScreen({
  title,
  description,
  children,
}: {
  title: string
  description: string
  children?: React.ReactNode
}) {
  return (
    <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col justify-center gap-6 p-6">
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-medium">{title}</h1>
        <p className="text-sm leading-relaxed text-muted-foreground">
          {description}
        </p>
      </div>

      {children && <div className="flex items-center gap-2">{children}</div>}
    </main>
  )
}
