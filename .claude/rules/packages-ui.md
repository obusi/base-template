---
paths:
  - "packages/ui/**/*"
---

# packages/ui

shadcn components on Base UI and Tailwind v4, plus the one stylesheet the app
imports. DOM-only, which is the reason it is a package: a future Expo app can
import `shared` and `auth/client` and none of this.

```
packages/ui/src/
├── components/     one file per shadcn component
├── hooks/          empty, and normal to be empty
├── lib/utils.ts    cn()
└── styles/globals.css   the single stylesheet
```

## Adding a component: run shadcn, do not hand-write it

```bash
pnpm dlx shadcn@latest add button -c apps/web
```

`-c apps/web` points at the `components.json` there, and that file's aliases
send the output **here**, not into the app:

```jsonc
"tailwind": { "css": "../../packages/ui/src/styles/globals.css", … },
"aliases": {
  "utils": "@packages/ui/lib/utils",
  "ui":    "@packages/ui/components",
  …
}
```

So the command names the app and the file lands in this package. That is
correct; do not "fix" it by running the command from `packages/ui`, and do not
copy a component out of the docs by hand — the generator matches the pinned
`style` and `baseColor` in `components.json`, and a hand-written one drifts from
the rest on the first theme change.

## This package uses its own alias, and that is the exception

```ts
import { cn } from "@packages/ui/lib/utils"     // ✅ here
import { Label } from "@packages/ui/components/label"  // ✅ here
```

`packages-conventions.md` says a package imports from itself relatively. This
one does not, for two reasons that do not apply anywhere else: the `exports` map
genuinely lists `./lib/*` and `./components/*`, so the paths resolve; and shadcn
writes these imports itself from `components.json`. Rewriting them to relative
paths means every regenerated component comes back with the alias and the diff
is noise.

**The exception is this package and no other.** `api`, `db` and `shared` each
have a specific way the alias breaks at runtime — conventions has the list.

## Nothing here knows about a domain

`package.json` lists no `@packages/*` dependency, and that should stay true. A
component here takes props; it does not import a contract schema, call a
procedure, or know that `report` exists.

The decision, extending the list in `apps-web-structure.md`:

- A generic primitive with variants — button, input, dialog → **here**, via the
  shadcn generator.
- Generic UI with no business meaning that a *second, unrelated* feature already
  needs → `apps/web/components/`.
- Anything carrying the meaning of a domain → `apps/web/features/<domain>/`.

A component that needs `cn` and nothing else is usually the first; a component
that needs to know what it is displaying is not.

## `globals.css` is the only stylesheet

`apps/web` imports `@packages/ui/globals.css` and defines no theme of its own.
Colours are CSS variables mapped in the `@theme inline` block; change a colour
there rather than passing a literal to a component.

The `@source` globs at the top are how Tailwind v4 finds classes to generate —
they reach up into `apps/**` deliberately, because the app writes classes that
this package never sees. A new app or package with its own markup needs a glob
added here, or its classes silently do not exist at runtime.

## Client and server

These are unmarked components: they carry `"use client"` only where the
underlying Base UI primitive needs it. Do not add the directive to a file that
does not need it — `apps-web-structure.md` explains what pulling the client
boundary upward costs.
