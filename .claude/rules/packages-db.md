---
paths:
  - "packages/db/**/*"
---

# packages/db

Drizzle schema, the client, migrations, and the throwaway database tests run
against. **Drizzle v1.0.0-rc.4** — a release candidate, and different enough
from v0 that training data will suggest APIs this version removed.

```
packages/db/
├── drizzle/              generated migrations — never hand-edited
├── scripts/check.ts      deployment check, run by hand, never imported
└── src/
    ├── index.ts          db instance + schema namespace
    ├── schema/           one file per domain + the aggregate drizzle-kit reads
    ├── connection/       client.ts, env.ts — the real database
    └── testing/          createTestDb, resetDb — exported as @packages/db/testing
```

`scripts/` sits outside `src/` because nothing imports `check.ts`; everything
under `src/` is either exported or tested.

## Every table uses `pgTable.withRLS()`

```ts
export const post = pgTable.withRLS("post", { ... })   // ✅
export const post = pgTable("post", { ... })           // ❌ caught by rls-guard.test.ts
```

Drizzle v1 deprecated `pgTable(...).enableRLS()` in favour of the `withRLS`
table builder. Both still compile; only the new form belongs in new code.

The point is **RLS on with zero policies**. Drizzle connects as `postgres`,
which owns the tables and carries `BYPASSRLS`, so the app is unaffected;
`anon` and `authenticated` have neither, so a leaked anon key reads nothing —
with no SQL policies to debug. Authorization itself lives in oRPC (see
`packages-api.md`), never in a policy.

Never enable `FORCE ROW LEVEL SECURITY` — that would apply RLS to the owner
too, and lock the app out.

`rls-guard.test.ts` fails on any table that forgot `withRLS()`. It also pins
the exact list of table names, so **adding a table is meant to make it go
red** — update the list in the same commit, and the diff records the schema
change rather than hiding it. `db:check`
answers a different question — whether *this deployment's* roles are what the
scheme assumes — and runs by hand, once per project. They are not
interchangeable: a Supabase project with "Enable automatic RLS" carries an
event trigger that would hide a missing `withRLS()` from `db:check`, and only
the PGlite test, which runs without that trigger, still goes red.

## Files in `schema/` import each other relatively

```ts
import { user } from "./auth"              // ✅
import { user } from "@packages/db/schema/auth"   // ❌ drizzle-kit cannot resolve it
```

drizzle-kit's loader reads that alias as a string prefix and fails to find the
sibling. It typechecks, so the failure only appears when you run a `db:*`
command. See `docs/architecture.md` S10 (C15).

## `schema/auth.ts` is generated, and regenerating undoes three edits

`pnpm --filter @packages/auth auth:generate` overwrites the file from Better
Auth's CLI. Three things must be redone afterwards, and each is caught by
tooling rather than memory — run `pnpm verify` and fix what it reports:

1. `pgTable(` → `pgTable.withRLS(` — caught by `rls-guard.test.ts`.
2. Delete the `relations(...)` exports at the bottom. The CLI emits Drizzle
   v0's relations API, which v1 replaced with `defineRelations`. Nothing here
   uses relational queries, so they are dead weight — caught by `tsc`:
   *"'drizzle-orm' has no exported member named 'relations'"*.
3. `pnpm format` — the generator emits semicolons, caught by `format:check`.

Extend this file by regenerating, never by hand: adding a Better Auth plugin
changes what the generator emits.

**Do not add business fields to Better Auth's `additionalFields`.** The test is
not how user-shaped a field feels, it is whether authentication breaks without
it. `email` sends the password-reset link and belongs to Better Auth; `bio` and
preferences belong to the project, in their own table with their own contract.
Putting business fields in the auth config moves their validation out of
`packages/contract`, costs `.output()` as a guard, and adds another round of
the three edits above every time.

## Migrations

```bash
pnpm --filter @packages/db db:generate   # write a migration from schema changes
pnpm --filter @packages/db db:migrate    # apply it
```

Never hand-edit anything under `drizzle/` and never rename a migration folder —
the ledger of what has been applied is keyed on those names, and the test
helpers re-run the whole folder from scratch on every `resetDb`.

`db:push` exists for throwaway local iteration only. Anything that reaches a
real deployment goes through a generated migration, or the ledger and the
schema disagree.

## Column types follow what is actually stored

A foreign key onto an auth table is `text`, not `uuid`, because Better Auth
generates its own ids and they are not UUIDs. When a column references an auth
table, match that table's type rather than the type the column "should" have.

Indexes follow the queries that exist. A list ordered by
`createdAt desc, id desc` and paged with a cursor needs one index covering
`(createdAt, id)` in that order — an index on either column alone would not be
used. If you change how a query orders or filters, check whether its index
still matches.

## Two exported entry points, and no more

`"."` gives `db`, `Database`, and the `schema` namespace. `"./testing"` gives
the helpers — exported rather than kept private because `packages/api` imports
them too. Nothing else is public: `@packages/db/connection/client` and
`@packages/db/schema/post` do not resolve, deliberately.

`Database` is the shared `PgAsyncDatabase` base rather than `typeof db`, so
that a PGlite instance from `createTestDb()` satisfies it. The two drivers are
otherwise incompatible types.
