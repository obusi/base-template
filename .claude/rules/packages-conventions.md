---
paths:
  - "packages/**/*"
---

# Shared conventions for every `packages/*`

Seven packages. Six are split along hard technical constraints rather than
taste — `CLAUDE.md` has the table of why each one cannot be merged into
another — and `scripts` is a runner rather than a library. This
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

**A file that nothing exports and nothing tests should not exist.** Two places
are exempt, and both for the same reason — they are run by hand and never
imported: `packages/db/scripts/`, which sits outside `src/` to say so, and
`packages/scripts`, which has no `exports` map at all. A package with no
`exports` map is a runner; every other package must have one.

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
  prefix and fails to find the sibling file. See `docs/architecture.md` S10
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

**The same applies to anything else that reaches off the machine.** Object
storage rides in the context as `reportStorage`, for the identical reason: a
module-level Supabase client could not be pointed anywhere else, and every test
touching an attachment would need a real bucket. It carries a domain's name
rather than being called `storage` because one bucket belongs to one domain —
see `packages-api.md`.

The type is `Database` — the shared `PgAsyncDatabase` base — deliberately, not
`typeof db`. The postgres-js and PGlite drivers are otherwise incompatible
types, so `typeof db` would reject exactly the instance a test supplies.

The single place allowed to name the real `db` is a composition root:
`packages/api/src/connection/live.ts`. It carries `import "server-only"` and
nothing inside the package imports it.

`packages/scripts` is the one other place, and it is not a counter-example: it
is a process rather than a library, so there is nothing to hand it a database
from.

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
| `packages/api` | **no** | **no** | it reads none — the bucket name is a constant, not a variable |
| `packages/storage` | yes | **no** | same as `auth` — how to reach Supabase, read in `connection/live.ts` |
| `packages/scripts` | no | **no** | it runs, but reads `apps/web/.env` — see below |

`packages/scripts` is the odd one: it *is* a process, so it could own a `.env`,
and deliberately does not. `pnpm seed` needs `DATABASE_URL`,
`BETTER_AUTH_SECRET` and `BETTER_AUTH_URL` together, and only `apps/web/.env`
has all three — a fourth copy would be a fourth thing to keep in sync, and
drift there is silent in both directions: a different `DATABASE_URL` seeds a
database the app never reads, and a different `BETTER_AUTH_SECRET` creates
users whose sessions the app cannot verify. So its `seed` script points at
`apps/web/.env` explicitly.

So `packages/auth/.env.example` documents what the package requires while the
values live in `apps/web/.env`. `DATABASE_URL` is knowingly duplicated across
`apps/web/.env` and `packages/db/.env`; both `.env.example` files carry a note
that the values must match.

**Some variables no `.env` carries.** A deployment sets them, so they are
optional everywhere and no example file can show a value:

| Variable | Set by | Read in |
|---|---|---|
| `POSTGRES_URL` | Supabase, per preview branch | the `DATABASE_URL` fallback in both `env.ts` files and `scripts/deploy.ts` |
| `VERCEL_URL`, `VERCEL_BRANCH_URL` | Vercel, per deployment | `packages/auth/src/config.ts` |
| `BETTER_AUTH_ALLOWED_HOSTS` | a person, rarely | the same |
| `VERCEL_ENV` | Vercel | `packages/db/scripts/deploy.ts` |

Two rules when adding to that list. **Declare it in `turbo.json`'s `globalEnv`**
— turbo passes only declared variables to a task and drops the rest with a
warning that is easy to miss, so the failure is a variable that is silently not
there. And **do not make one of them required**: absent is the normal case
everywhere except the one platform that sets it.

`docs/architecture.md` S9 has the full picture, S17 the reasoning.

## Adding a new domain

The folder name is the same in every package, and singular (`post`, not
`posts`). In dependency order, so each step compiles against the one before:

1. **`packages/db/src/schema/<x>.ts`** — the table, via `pgTable.withRLS()`.
   Export it from `schema/index.ts`, then
   `pnpm db:generate`. Add the new table name to the
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

### If the domain stores files

A bucket belongs to one domain — the file-size limit and the MIME allowlist are
properties of a bucket, and a folder inside one cannot carry its own. So a
domain that stores files gets a bucket of its own rather than a folder in
`report`'s, and wiring it is four edits and no new abstraction:

1. **Declare the bucket** in `supabase/config.toml`, private, with its own size
   limit and MIME allowlist — `supabase start` then creates it locally, and
   `supabase seed buckets` creates it on a hosted project.
   `report-attachments` is the worked example, and `docs/setup.md` says which
   of its settings are not cosmetic.
2. **`packages/api/src/domains/<x>/service.ts`** — `export const <X>_BUCKET`,
   the same string as step 1. A constant rather than an env var: step 1 is what
   creates the bucket, so a variable naming anything else would only point at
   one nobody made. `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are in
   `@packages/storage/env` already and are the same for every bucket in the
   project — nothing new is needed there, and nothing in `turbo.json`.
3. **`packages/api/src/shared/context.ts`** — `<x>Storage: Storage | null`,
   named after the domain so a handler can only reach its own bucket.
4. **`packages/api/src/connection/live.ts`** — one line:
   `const <x>Storage = storageFromEnv(storageEnv, <X>_BUCKET)`, then return it
   in the context.

Nothing else — and in particular, nothing inside `packages/storage`. It takes
the bucket as an argument precisely so that a second one costs a line rather
than a function. `contextFor` and `anonymousContext` take `Partial<ApiContext>`
overrides, so existing tests keep compiling and a new one says
`{ <x>Storage: null }` when it wants the unconfigured deployment. Add a default
stand-in in `testing/index.ts` beside `reportStorage`'s if the new field should
also work without being asked for.

`storage` is deliberately **not** a map keyed by bucket name. A typo in
`context.storage["avatr"]` would be `undefined` at runtime instead of red at
build time, and every handler would be able to reach every bucket while holding
the service role key. Five named lines buy both of those back.
