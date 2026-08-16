---
paths:
  - "packages/**/*"
---

# Shared conventions for every `packages/*`

Five packages, split along hard technical constraints rather than taste —
`CLAUDE.md` has the table of why each one cannot be merged into another. This
file covers what they all share: the files each package carries, how they
import from each other and from themselves, and what adding a new domain
touches. Rules specific to one package live in `packages-api.md`,
`packages-db.md`, and `packages-contract.md`.

## What every package carries

```
packages/<name>/
├── package.json          name "@packages/<name>", type module, private true
├── tsconfig.json         extends @tooling/typescript-config/base.json
├── eslint.config.js      re-exports @tooling/eslint-config/base
├── vitest.config.ts      re-exports @tooling/vitest-config/base (if it tests)
└── src/
```

The three tooling configs are re-exported, not re-declared. If a package needs
something different, extend the shared config in place rather than starting a
private one — a second source of truth for lint or compiler settings is how
packages quietly drift apart.

Scripts are `lint`, `typecheck`, and `test`, named identically everywhere so
`turbo` can fan them out from the root. A package that adds a script under a
new name is invisible to `pnpm verify`.

## The `exports` map lists only what is actually imported

```jsonc
// packages/db/package.json
"exports": {
  ".": "./src/index.ts",
  "./testing": "./src/testing/index.ts"
}
```

Not `"./*"`. The map is the package's public surface, and a wildcard makes
every internal file public by accident — `@packages/db/schema/post` would
resolve, and the first import of it would be discovered months later. When
something outside the package genuinely needs a new path, add that exact path
and nothing more.

Two consequences worth internalising:

**Adding an entry point is a deliberate act.** If you find yourself widening
the map to make an import work, stop and ask whether the import belongs — most
of the time the answer is that the caller should be going through `"."`.

**A file that nothing exports and nothing tests should not exist.** The one
sanctioned exception is `packages/db/scripts/`, which sits outside `src/`
precisely because it is only ever run by hand, never imported.

## Import style

**Between packages** — always the package name, never a relative path that
climbs out of the package:

```ts
import { schema, type Database } from "@packages/db"
```

**Inside a package** — always relative, never the package's own alias:

```ts
import { os } from "../shared/builder"      // ✅
import { os } from "@packages/api/shared/builder"   // ❌ not in the exports map
```

`tsconfig.json` defines a `@packages/<name>/*` path mapping in some packages,
which makes the second form typecheck. It still breaks at runtime, and each
package has its own reason:

- **`api`** — the `exports` map lists only `"."` and `"./connection/live"`, so
  a self-reference through any other path does not resolve.
- **`db`** — drizzle-kit's loader reads `@packages/db/schema` as a string
  prefix and fails to find the sibling file. See `docs/architecture.md` §11
  (C15).
- **`contract`** — this is the package a future Expo app compiles through
  Metro, whose handling of `exports` maps and self-references has produced
  enough bundler bugs to be worth never testing.

Relative imports have none of these problems in any of the three, so there is
no case where the alias is worth reaching for.

## Grouping: `domains/` versus named folders

`contract` and `api` both group the same way, so that adding a domain means
adding the same folder name in each with nothing to rename or guess:

```
src/
├── index.ts        the public entry
├── domains/<x>/    everything specific to one domain
└── <named>/        cross-cutting concerns, one folder per well-defined job
```

Cross-cutting folders get real names — `shared/`, `middleware/`, `connection/`,
`testing/` — rather than one generic bucket. `connection/` and `testing/` mean
the same thing in `api` as in `db` (the real thing, and the throwaway thing
tests get), so the pattern reads identically across packages.

`db` groups by domain too, but a domain is one *file* (`src/schema/post.ts`),
not a folder — a db domain has never needed more than a single schema, and a
folder holding exactly one file buys nothing.

`ui` and `auth` opt out entirely: neither has a business domain to group by.
They organise by type (`components/`, `hooks/`, `lib/`) instead.

## Nothing imports a database — it is handed one

```ts
export function createAuth(database: Database) { ... }   // ✅
export type ApiContext = { db: Database, ... }           // ✅

import { db } from "@packages/db"                        // ❌ in a handler
```

A module-level `db` binds the code to `DATABASE_URL` at load time, which makes
every function that uses it untestable — there is no way to point it at the
throwaway PGlite instance a test just seeded. `packages/api` takes the database
through oRPC's context (which it needs anyway, to carry the session, so `db`
rides along free) and `packages/auth` takes it as an argument.

The type is `Database` — the shared `PgAsyncDatabase` base — deliberately, not
`typeof db`. The postgres-js and PGlite drivers are otherwise incompatible
types, so `typeof db` would reject exactly the instance a test supplies.

The single place allowed to name the real `db` is a composition root:
`packages/api/src/connection/live.ts`. It carries `import "server-only"` and
nothing inside the package imports it.

## Environment variables

Each package validates what it reads in its own `env.ts`, with t3-env + zod, so
a missing variable produces a named error rather than a `TypeError` from deep
inside a driver.

A `.env` file, though, belongs to a **process**, not a package — it is read by
whatever program starts in that folder:

| Package | `env.ts` | real `.env`? | read by |
|---|---|---|---|
| `apps/web` | yes | yes | `next dev` / `next build` |
| `packages/db` | `src/connection/env.ts` | yes | the `drizzle-kit` commands |
| `packages/auth` | yes | **no** | nothing runs here — it is imported into `apps/web` |

So `packages/auth/.env.example` documents what the package requires while the
values live in `apps/web/.env`. `DATABASE_URL` is knowingly duplicated across
`apps/web/.env` and `packages/db/.env`; both `.env.example` files carry a note
that the values must match.

## Adding a new domain

The folder name is the same in every package, and singular (`post`, not
`posts`). In dependency order, so each step compiles against the one before:

1. **`packages/db/src/schema/<x>.ts`** — the table, via `pgTable.withRLS()`.
   Export it from `schema/index.ts`, then
   `pnpm --filter @packages/db db:generate`. Add the new table name to the
   pinned list in `schema/rls-guard.test.ts`, which is meant to go red here.
2. **`packages/contract/src/domains/<x>/schema.ts`** — the zod schemas. These
   are the source of truth for the shape; nothing derives them from Drizzle,
   and `packages-contract.md` explains why.
3. **`packages/contract/src/domains/<x>/contract.ts`** — the procedures, then
   add the domain to the `contract` object in `src/index.ts`.
4. **`packages/api/src/domains/<x>/`** — `service.ts` then `router.ts`, and
   register the router in `src/index.ts`. See `packages-api.md`.
5. **`packages/api/src/domains/<x>/router.test.ts`** — see `testing.md`.
6. **`apps/web/features/<x>/`** — see `apps-web-structure.md`.

No new route folder is needed under `apps/web/app/api/` — the three HTTP doors
already serve whatever the router exposes.

While the `post` example domain is still present, it is a working instance of
all six steps, checked by `tsc` and Vitest on every run. Copy it rather than
this description — prose goes stale, a compiled example does not.
