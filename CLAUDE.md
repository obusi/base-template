# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this repository is

A typed full-stack monorepo: Next.js on top of oRPC, Drizzle, and Better Auth,
with the boundaries between them enforced by tooling rather than by discipline.
Development is AI-driven; a human reviews code and UI as the final gate.

Most of this file describes rules that hold in any project built on this stack.
The section below is the exception.

### While this repo is still the template

> **Delete this whole section once this repo is a real project.** It is one
> item on a short list — `docs/architecture.md` S13 has the rest, and S14
> beside it lists every file of the `post` example. Everything else in this
> file and all of `.claude/rules/` applies unchanged.

This repo is a **base template**, not a product. Several projects start from
it, and forks get no update path, so what goes in is permanent:

- **There is no business logic to preserve, with one exception.** It ships
  structure only, plus the `report` domain — every project needs a way for its
  users to say something is wrong, so that one is built in. Unlike `post` it is
  not an example and is meant to stay.
- **Keep it lean.** Something a project could add later does not belong here.
  "Might be useful" is not a reason — every dependency added here is inherited
  by every project forked from it.
- **The `post` domain is a live example**, wired end to end (contract → db →
  api → web) so that `tsc` and Vitest keep it honest when oRPC or Drizzle
  changes an API. Copy it as a pattern, then delete it.

None of these three survive the fork. A real project *should* add business
logic and *should* add the dependencies it needs.

## Commands

Run from the repository root unless noted.

```bash
pnpm verify          # typecheck + lint + test + format:check — the full gate
pnpm dev             # every dev task (turbo)
pnpm build
pnpm format          # prettier --write .
```

`pnpm verify` also runs automatically as a `Stop` hook (`.claude/settings.json`),
so a session does not end on a broken tree. Run it by hand when you want the
result sooner.

**After changing any dependency, run the gate once with the cache off:**

```bash
pnpm exec turbo typecheck lint test --force
```

Turbo hashes a task's inputs and its package's declared dependencies, not the
shape of `node_modules` — so a package whose own files did not change is served
from cache even when a reshuffled dependency tree has broken it. That is not
hypothetical here: see `docs/architecture.md` S10 (C19), where adding a root
devDependency broke `packages/auth` and `pnpm verify` reported green anyway.

**One package, one test file, one test** (`<domain>` is a folder under
`packages/api/src/domains/`):

```bash
pnpm --filter @packages/api test
pnpm --filter @packages/api exec vitest run src/domains/<domain>/router.test.ts
pnpm --filter @packages/api exec vitest run -t "refuses a caller with no session"
```

**Local Supabase.** Postgres and object storage run in Docker, configured by
`supabase/config.toml` — which switches off the nine services this repo does not
use and declares the `report-attachments` bucket so it is created rather than
clicked. Nothing here talks to a hosted project; `docs/setup.md` covers both
halves.

```bash
pnpm supabase:start   # Postgres on 54322, storage on 54321, studio on 54323
pnpm supabase:stop
pnpm supabase:reset   # wipe, then re-apply the migrations
pnpm seed             # user@example.com + admin@example.com, password 12345678
```

`pnpm seed` runs `packages/scripts/src/seed.ts`. It signs both accounts up
through Better Auth rather than inserting rows, because the password has to be
hashed the way sign-in will verify it — which is also why `[db.seed]` is off in
`config.toml` and why the script needs `tsx --conditions=react-server` to run
at all. Running it twice is safe; running it against a database with no tables
exits non-zero rather than warning.

**Database** (needs `packages/db/.env` — see `docs/architecture.md` S9 for why
there are two env files; both are copies of their `.env.example` for local work):

```bash
pnpm --filter @packages/db db:generate   # write a migration from schema changes
pnpm --filter @packages/db db:migrate
pnpm --filter @packages/db db:studio
pnpm --filter @packages/db db:check      # once per project — proves RLS roles
```

**Auth schema regeneration** — see `.claude/rules/packages-db.md` before running,
it undoes three hand edits:

```bash
pnpm --filter @packages/auth auth:generate
```

**Dev server.** `pnpm --filter web dev`, with `pnpm supabase:start` already
running or every request fails on a database that is not there. Claude Code's
in-app preview is configured in `.claude/launch.json` under the name `web` —
start it with `preview_start` rather than running a server through Bash.

## Architecture

Six packages and a runner, one app. The split follows hard technical
constraints, not taste — merging any two of the six breaks something specific:

| Package | Holds | Why it cannot be merged |
|---|---|---|
| `contract` | zod schemas + the oRPC contract | A future Expo app imports it without dragging in Drizzle or Better Auth |
| `db` | Drizzle schema, client, migrations | Both `auth` and `api` need it; nesting it in `api` creates `auth → api → auth` |
| `auth` | Better Auth server + client entries | The browser login page calls it directly, bypassing oRPC |
| `api` | The oRPC router — implements the contract | The layer that composes everything else |
| `storage` | The `Storage` port + its Supabase implementation | It holds the one dependency `api` must not be able to resolve |
| `ui` | shadcn components | DOM-only; unusable from React Native |

`storage` is the soft one, and the reason is enforcement rather than a cycle:
`@supabase/storage-js` is declared there and nowhere else, so pnpm strict
layout makes it unresolvable from `api`. The API layer sees two functions and
cannot see the provider behind them — the same mechanism that keeps `apps/web`
away from `db`. `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` live in
`@packages/storage/env`; `SUPABASE_REPORT_BUCKET` does not, because a package
that serves every domain must not carry one domain's name.

`packages/scripts` sits outside that table on purpose. It is a **runner, not a
library** — nothing imports it, it has no `exports` map, and it holds the
commands that need the real database and the real auth instance at once (today
just `seed`). It could be merged into any of the six without breaking
anything; it is separate so that "what does this package export?" has an
answer for every other package in the repo.

```
apps/web ──┬─► ui              ┐
           ├─► contract        │  reachable from the browser
           ├─► auth/client     ┘
           ├─► auth/server     ┐
           └─► api             ┘  server-side only
                 │
                 ├─► contract
                 ├─► auth/server
                 ├─► storage
                 └─► db
```

**Contract-first.** `packages/contract` declares what goes in and out;
`packages/api` implements that shape via `implement(contract)`. A handler that
drifts from its `.output()` stops compiling, so the contract cannot become
stale documentation.

**Two call paths, one router.** A Server Component calls procedures in-process
(`await client.<domain>.list()`); the browser calls the same procedures over HTTP
at `/rpc` through TanStack Query. `apps/web/lib/orpc.ts` picks between them
automatically, and `instrumentation.ts` installs the in-process client at
server start. The same router is also served as REST at `/api/v1`, with the
OpenAPI spec generated from the contract at `/api/spec` and rendered at
`/api/docs`.

**Auth does not use either path.** Sign in / sign up / sign out go straight to
Better Auth at `/api/auth`. There is no contract for auth and writing one
would be a mistake — see `docs/architecture.md` S4.

## Boundaries that must not break

These are enforced by tooling, not by discipline. Breaking one is a build
failure, and that is deliberate — do not work around it.

1. **`apps/web` must never depend on `@packages/db`.** It is absent from
   `apps/web/package.json`, so pnpm's strict layout makes it unresolvable. If
   a page could query the database directly it would skip `requireAuth`
   entirely. `packages/api` must not re-export `db` either, or the same door
   reopens.
2. **`packages/contract` depends on `@orpc/contract` and `zod`, and nothing
   else.** Checked by `packages/contract/src/shared/dependencies.test.ts`.
   This is the boundary a future Expo app rests on.
3. **Nothing imports a database — it is handed one.** `packages/api` receives
   it through oRPC's context; `packages/auth` takes `createAuth(database)`. A
   module-level import binds the code to `DATABASE_URL` at load time and makes
   every handler untestable.
4. **Authorization lives in oRPC middleware and each handler's `where`
   clause**, nowhere else. No Supabase RLS policies, no Server Actions.
   The role guards in `apps/web/app/(app)/(admin)/layout.tsx` and its
   siblings are not a second copy of that rule — they decide what a person
   is shown, and the procedure behind every page refuses them again anyway.
   See `.claude/rules/apps-web-structure.md`.

## Framework notes

**This is not the Next.js you know.** Version 16 — APIs, conventions and file
structure may all differ from training data, and `apps/web/package.json` is the
only place worth trusting for the exact version. Read the relevant guide before
writing Next.js code. The docs ship inside the package, version-matched, and
since `next` is a dependency of `apps/web` rather than the root, from the repo
root they are at:

```
apps/web/node_modules/next/dist/docs/
├── 01-app/
│   ├── 01-getting-started/
│   ├── 02-guides/            # includes upgrading/version-16.md
│   └── 03-api-reference/
├── 02-pages/
├── 03-architecture/
└── index.md
```

Other version-sensitive choices, all deliberate: **Drizzle v1** pinned to a
release candidate (use `pgTable.withRLS()`, not the deprecated `.enableRLS()`),
**Zod 4** only, and `@better-auth/drizzle-adapter` rather than
`better-auth/adapters/drizzle`. `docs/architecture.md` S10 says why each, and
what to re-check when any of them moves.

## Where the rest lives

- `docs/architecture.md` — the one design document: the reasoning behind every
  decision above, plus S10, the library traps (`C1`…`C18`) that shaped the
  repo and are cited by number from several source comments. Read the relevant
  section before changing a structural rule.
- `docs/setup.md` — the once-per-project procedure: database, env files,
  schema, branch rules. Steps only; the reasoning behind them is in the
  architecture doc.
- `docs/deploy.md` — the same shape, for hosting: the Vercel project, which
  environment variable belongs to which scope, and the two Supabase
  integrations that give each pull request a preview with a database of its
  own. Several of its settings have to be *off*, and the file says why. S17
  holds the reasoning.
- `.claude/rules/` — path-scoped conventions that load when you work in the
  matching directory: `apps/web` structure, shared package conventions, and
  one file each for `api`, `db`, `contract`, and tests.

Prose that contradicts the code is worse than no prose. When you change a
structural rule, update the doc that states it in the same commit.
