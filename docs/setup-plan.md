# Setup Plan

> Derived from the official docs of every library in the stack, checked against the npm registry and the local `node_modules` tree on **2026-08-13**.
> Read [architecture.md](./architecture.md) first — this document is the executable plan for reaching that target.
> **Nothing here has been implemented yet.**

---

## 1. Verified versions

Resolved from the npm registry on 2026-08-13. Pin these; do not use `latest` in the template.

| Package | Version | Notes |
|---|---|---|
| `next` | 16.2.6 | already installed |
| `react` / `react-dom` | 19.2.4 | already installed |
| `tailwindcss` | 4.3.0 | already installed |
| `zod` | 4.4.3 | already installed (see conflict C7) |
| `@orpc/server` | 1.15.0 | |
| `@orpc/client` | 1.15.0 | |
| `@orpc/contract` | 1.15.0 | |
| `@orpc/tanstack-query` | 1.15.0 | |
| `drizzle-orm` | **1.0.0-rc.4** | decided in **C1** — pin exactly, no `^` |
| `drizzle-kit` | **1.0.0-rc.4** | must match `drizzle-orm` |
| `postgres` | 3.4.9 | postgres-js driver for Supabase |
| `@electric-sql/pglite` | 0.5.4 | |
| `better-auth` | 1.6.27 | |
| `@better-auth/drizzle-adapter` | 1.6.27 | see conflict **C4** |
| `@tanstack/react-query` | 5.101.4 | |
| `react-hook-form` | 7.85.0 | |
| `@hookform/resolvers` | 5.7.1 | |
| `@t3-oss/env-core` | 0.13.11 | |
| `@t3-oss/env-nextjs` | 0.13.11 | |
| `vitest` | 4.1.10 | see conflict **C6** |

---

## 2. Conflicts found

Ordered by how much they affect the plan.

### C1 — Drizzle's official docs document v1, but `npm install` gives you v0 🔴

`orm.drizzle.team` documents the **v1 API**. The `latest` tag on npm is **0.45.2**, which is the v0 line. The APIs differ on the exact feature this template depends on:

| | v0.45.2 (`latest`) | v1.0.0-rc.4 (`rc`) |
|---|---|---|
| Enable RLS without policies | `pgTable("posts", {...}).enableRLS()` | `pgTable.withRLS("posts", {...})` |
| Relational queries | RQBv1 | `defineRelations()` — RQBv1 removed |
| `.array()` | chainable | `column.array('[][]')` |
| Migration files | `journal.json` | DDL snapshots |
| `drizzle-kit push/pull` scope | public schema | all schemas |

**Why this matters more than usual here:** the whole point of this template is that AI reads official docs and writes correct code. With v0.45.2 installed, AI reading `orm.drizzle.team` will write `pgTable.withRLS()` and it will fail — and the failure will look like a typo rather than a version mismatch.

**Options:**

| | Pros | Cons |
|---|---|---|
| **A. Pin v0.45.2 (stable)** | Production-proven | Docs and code disagree — must write an explicit rule in `AGENTS.md` and pin exact versions |
| **B. Pin v1.0.0-rc.4** | Matches every doc page AI will read; `withRLS` is the documented API | Release candidate; breaking changes still possible before GA |

**Additional evidence from npm publish dates:**

| Version | Published | Age on 2026-08-13 |
|---|---|---|
| `drizzle-orm@0.45.2` (`latest`) | 2026-03-27 | 4.5 months, no release since |
| `drizzle-kit@0.31.10` (`latest`) | 2026-03-17 | 5 months, no release since |
| `drizzle-orm@1.0.0-beta.1` | 2025-11-03 | 9 months in prerelease |
| `drizzle-orm@1.0.0-rc.1` | 2026-04-30 | 3.5 months in RC |
| `drizzle-orm@1.0.0-rc.4` (`rc`) | 2026-06-27 | 1.5 months |
| package last modified | 2026-08-12 | yesterday |

The v0 line has had no release in 4.5 months while the package is still being published to daily. v0 is frozen; all work is on v1. "Stable" here means *unmaintained*, and choosing it guarantees a future breaking migration across every forked project — with no upstream update path, since distribution is via "Use this template".

**✅ DECIDED: option B — `drizzle-orm@1.0.0-rc.4` and `drizzle-kit@1.0.0-rc.4`, pinned exactly.**
Verified working — see §2.5.

### C2 — `AGENTS.md` points at a path that does not exist 🔴

[AGENTS.md:4](../AGENTS.md) instructs agents to read `node_modules/next/dist/docs/`.

Verified: that path does **not** exist. `next` is a dependency of `apps/web`, not of the root, so the docs live at:

```
apps/web/node_modules/next/dist/docs/
├── 01-app/
│   ├── 01-getting-started/
│   ├── 02-guides/          (includes upgrading/version-16.md)
│   └── 03-api-reference/
├── 02-pages/
├── 03-architecture/
└── index.md
```

**Fix:** update the path in `AGENTS.md`. Any agent following the current instruction finds nothing and proceeds from memory — the exact failure the file exists to prevent.

### C3 — Better Auth CLI writes the schema to the wrong place by default 🟡

`npx auth@latest generate` emits `schema.ts` at the **project root**. Our design requires the auth tables to live in `packages/db/src/schema/auth.ts` so foreign keys such as `posts.authorId → user.id` resolve within a single Drizzle schema and a single migration set.

**Fix:** always run generate with an explicit output path, and record the command in `packages/db/package.json`:

```bash
npx auth@latest generate --config packages/auth/src/server.ts --output packages/db/src/schema/auth.ts --yes
```

Generated tables must then be edited to add RLS (see C5).

### C4 — Two valid import paths for the Drizzle adapter 🟡

Better Auth's docs are inconsistent:

- `/docs/installation` → `import { drizzleAdapter } from "better-auth/adapters/drizzle"`
- `/docs/adapters/drizzle` → `import { drizzleAdapter } from "@better-auth/drizzle-adapter"`

Both are real: `better-auth@1.6.27` still exports the `./adapters/drizzle` subpath, and `@better-auth/drizzle-adapter@1.6.27` is published separately.

**✅ DECIDED: use the standalone `@better-auth/drizzle-adapter`.** The dedicated adapter page is the more specific source, and splitting adapters into their own packages is the direction Better Auth is moving. Record the choice in `AGENTS.md` so AI does not flip between them.

### C5 — Generated auth tables will not have RLS 🟡

The Better Auth CLI does not know about our RLS deny-all rule, so regenerating the schema silently drops `.enableRLS()` from `user`, `session`, `account`, and `verification`.

**Mitigation:** the RLS guard test in `packages/db/test/rls-guard.test.ts` catches this. It must exist **before** the auth schema is generated, not after — see the phase order below.

### C6 — `vitest.workspace.ts` is deprecated 🟡

Vitest deprecated the workspace file in 3.2. With Vitest 4.1.10, monorepo projects are declared in the root `vitest.config.ts`:

```ts
// vitest.config.ts
import { defineConfig } from "vitest/config"

export default defineConfig({
  test: {
    projects: ["packages/*"],
  },
})
```

No conflict with our design — just do not follow older tutorials that create `vitest.workspace.ts`.

### C7 — Two versions of zod in the tree 🟢

`node_modules` currently resolves both `zod@3.25.76` and `zod@4.4.3`. Only 4.4.3 is declared, in `packages/ui/package.json`; 3.25.76 arrives transitively (most likely via the `shadcn` CLI dependency).

Harmless today because the two copies never meet, but it becomes a real problem if a zod v3 schema is ever passed to an oRPC contract expecting v4. oRPC accepts any Standard Schema implementation, so it will not reject a v3 schema up front — the mismatch would surface as a confusing type error.

**Mitigation:** declare `zod@4.4.3` explicitly in `contract`, `db`, and `auth`, and add a note to `AGENTS.md` that only zod v4 may be imported.

### C8 — Next.js 16 details that affect the plan 🟢

From `apps/web/node_modules/next/dist/docs/01-app/02-guides/upgrading/version-16.md`:

| Change | Impact here |
|---|---|
| Node.js **20.9+** required | root `package.json` says `"node": ">=20"` — tighten to `>=20.9` |
| Turbopack is the default for `dev` and `build` | no `--turbopack` flag needed; a custom webpack config would now **fail the build** |
| `middleware.ts` → `proxy.ts` | relevant if session checks are ever put in middleware; Better Auth's Next.js docs call this out too |
| Async request APIs are now enforced, not just warned | `await headers()`, `await params`, `await cookies()` — matches the oRPC context setup already planned |
| `next lint` removed in favour of the ESLint CLI | already correct: `apps/web/package.json` uses `"lint": "eslint"` |
| `npx next typegen` generates `PageProps` / `LayoutProps` / `RouteContext` | worth adding to the verify step |

### C10 — Better Auth declares `drizzle-orm: ^0.45.2` as a peer 🟡

Both `better-auth` and `@better-auth/drizzle-adapter` declare `"drizzle-orm": "^0.45.2"`, which excludes `1.0.0-rc.4`. Installing produces an unmet-peer warning.

Static inspection of `@better-auth/drizzle-adapter@1.6.27`'s `dist/index.mjs` shows the API surface it actually uses:

| Drizzle API | Calls | Present in v1 |
|---|---|---|
| `db.select` | 6 | yes |
| `db.transaction` | 4 | yes |
| `db.update` | 3 | yes |
| `db.delete` | 3 | yes |
| `db.insert` | 1 | yes |
| `db.query.*` (RQBv1) | 9 | **removed in v1** |

Every `db.query` call sits behind `if (options.experimental?.joins)` (lines 340 and 395). All imported operators (`eq`, `and`, `sql`, `inArray`, …) still exist in v1.

**Constraint that follows: never enable `experimental: { joins: true }`.** It is the only Better Auth feature that would break on Drizzle v1. Record this in `AGENTS.md`.

Silence the peer warning in `pnpm-workspace.yaml` (see C11):

```yaml
peerDependencyRules:
  allowedVersions:
    drizzle-orm: "1.0.0-rc.4"
```

### C11 — pnpm 10 no longer reads the `pnpm` field in `package.json` 🟡

Setting `peerDependencyRules` under a `"pnpm"` key in `package.json` is silently ignored:

```
[WARN] The "pnpm" field in package.json is no longer read by pnpm.
       The following keys were ignored: "pnpm.peerDependencyRules".
```

These settings now live in `pnpm-workspace.yaml`. Verified: moving the block there changes `pnpm peers check` from one unmet peer to `No peer dependency issues found`.

Relevant because `pnpm-workspace.yaml` already carries the `allowBuilds` block, and most tutorials still show the old `package.json` location.

### C9 — Small corrections to `architecture.md`

- The oRPC Next.js adapter docs export **six** methods from the route handler, not two:
  ```ts
  export const HEAD = handleRequest
  export const GET = handleRequest
  export const POST = handleRequest
  export const PUT = handleRequest
  export const PATCH = handleRequest
  export const DELETE = handleRequest
  ```
- Supabase's transaction-mode pooler does not support prepared statements. The client must be created with `prepare: false`:
  ```ts
  const client = postgres(env.DATABASE_URL, { prepare: false })
  ```
  Skipping this produces intermittent runtime errors that are very hard to attribute.

---

## 2.5 Compatibility spike — results

Run on 2026-08-13 in a throwaway project, outside this repo. It answers the one question that C1 and C10 could not settle by reading: does Better Auth actually work on Drizzle v1?

**Setup:** `drizzle-orm@1.0.0-rc.4` + `@better-auth/drizzle-adapter@1.6.27` + `better-auth@1.6.27` + `@electric-sql/pglite@0.5.4`, schema written with the v1 `pgTable.withRLS()` API.

| Check | Result |
|---|---|
| `tsc --noEmit --strict` across schema + app code | ✅ clean, exit 0 |
| `pgTable.withRLS()` exists in 1.0.0-rc.4 | ✅ |
| `drizzle({ client })` on `drizzle-orm/pglite` | ✅ |
| `betterAuth({ database: drizzleAdapter(db, …) })` constructs | ✅ |
| `auth.api.signUpEmail()` — adapter write path | ✅ user created |
| `auth.api.signInEmail()` — adapter read path | ✅ session issued |
| `db.select().from(user)` reads the row back | ✅ |
| RLS guard query against `pg_class` on PGlite | ✅ reports `relrowsecurity` correctly for all four tables |

**Conclusion:** the `^0.45.2` peer range is stale metadata, not a code constraint. The stack works.

**Not covered by this spike — carry as known risk:**

- `experimental: { joins: true }` was never enabled, and per C10 it *will* break. Keep it off.
- Migrations were applied as raw SQL, not through `drizzle-kit` v1. The new DDL-snapshot migration format is still unverified — this is the main thing to watch in Phase 2.
- No Supabase connection was made; the `prepare: false` requirement (C9) remains untested.

---

## 3. Phase order

Each phase ends with a command that must pass before the next begins. The order is chosen so that every later phase is verifiable by tests written earlier.

### Phase 0 — Fix the existing repo

No new dependencies.

| File | Change |
|---|---|
| `.gitignore` | add `!.env.example` after `.env*` |
| `package.json` | `"engines": { "node": ">=20.9" }` |
| `pnpm-workspace.yaml` | remove the stale `msw: false` entry; add `peerDependencyRules` (C10, C11) |
| `AGENTS.md` | correct the Next.js docs path (C2) |
| `turbo.json` | add a `test` task |

```yaml
# pnpm-workspace.yaml
peerDependencyRules:
  allowedVersions:
    drizzle-orm: "1.0.0-rc.4"
```

```jsonc
// turbo.json
"test": { "dependsOn": ["^test"], "outputs": [] }
```

**Verify:** `pnpm typecheck && pnpm lint`

### Phase 1 — Test runner

Set up testing **first**, so every subsequent phase has a way to prove it works.

Install at root: `vitest`

Create root `vitest.config.ts` using `projects` (C6), and add `"test": "turbo test"` to the root scripts.

**Verify:** `pnpm test` runs and reports zero tests without error.

### Phase 2 — `packages/db`

Install: `drizzle-orm@1.0.0-rc.4`, `postgres`, `@t3-oss/env-core`, `zod` · dev: `drizzle-kit@1.0.0-rc.4`, `@electric-sql/pglite`, `vitest`

✅ **Verified during Phase 2.** A throwaway table was added, generated, inspected, and removed:

- `drizzle-kit generate` reads `drizzle.config.ts` and emits `drizzle/<timestamp>_<name>/{migration.sql,snapshot.json}` — one folder per migration, no `journal.json`.
- `pgTable.withRLS()` produces `ALTER TABLE "probe" ENABLE ROW LEVEL SECURITY;` and records `"isRlsEnabled": true` in the snapshot (`"version": "8"`).
- `createTestDb()` applies those migrations into PGlite; the table appears with `relrowsecurity = true`.

Two further findings, both fixed:

- `drizzle-orm/pglite` and `drizzle-orm/postgres-js` return **different shapes** from `db.execute()` — `Results` with `.rows` versus an array-like `RowList`. Helpers that read raw rows must normalise.
- `migrate()` throws `ENOENT` if the migrations folder is missing. Git cannot track an empty directory, so a fresh clone of the template would fail on first `pnpm test`. Fixed with `packages/db/drizzle/.gitkeep`, to be removed once real migrations exist.

```
packages/db/
├── .env.example              DATABASE_URL
├── drizzle.config.ts
├── src/
│   ├── env.ts                createEnv({ server: { DATABASE_URL: z.url() } })
│   ├── client.ts             postgres(url, { prepare: false }) → drizzle   (C9)
│   ├── schema/index.ts
│   └── index.ts
└── test/
    ├── helpers/db.ts         createTestDb() — PGlite + migrate, accepts TEST_DATABASE_URL
    └── rls-guard.test.ts     ← written before any table exists
```

The guard test must exist before Phase 3 so that generated auth tables cannot slip through without RLS (C5).

**Verify:** `pnpm --filter @packages/db test` — guard test passes against an empty schema.

### Phase 3 — `packages/auth`

Install: `better-auth`, `@better-auth/drizzle-adapter` (C4), `@t3-oss/env-core`, `zod`

🚫 **Never set `experimental: { joins: true }`** — it is the only Better Auth option that uses removed Drizzle v1 APIs (C10).

```
packages/auth/
├── .env.example              BETTER_AUTH_SECRET, BETTER_AUTH_URL
├── src/
│   ├── env.ts
│   ├── server.ts             import "server-only" + betterAuth({...})
│   └── client.ts             createAuthClient() — no Drizzle import
└── package.json              exports: "./server", "./client"
```

Then generate the schema into `packages/db` with an explicit `--output` (C3) and add RLS to each generated table.

**Verify:** `pnpm --filter @packages/db test` — the RLS guard now covers four new tables and still passes.

### Phase 4 — `packages/contract`

Install: `@orpc/contract`, `zod@4.4.3` only (C7)

```
packages/contract/src/
├── index.ts
├── errors.ts                 shared error codes
└── post/
    ├── schema.ts
    └── contract.ts           oc.input().output().errors()
```

Hard rule: no dependency other than `@orpc/contract` and `zod`. Anything else breaks the future Expo app.

**Verify:** `pnpm --filter @packages/contract typecheck`

### Phase 5 — `packages/api`

Install: `@orpc/server`

```
packages/api/
├── src/
│   ├── orpc.ts               implement(contract) + publicProcedure/protectedProcedure
│   ├── context.ts            headers → session → user
│   ├── middleware/auth.ts    requireAuth
│   ├── router/post.ts
│   └── index.ts
└── test/
    ├── helpers/seed.ts
    └── post.test.ts          integration tests via createRouterClient
```

Must **not** re-export `db` — that would reopen the shortcut the package split exists to close.

**Verify:** `pnpm --filter @packages/api test` — including a test asserting one user cannot modify another's row.

### Phase 6 — `apps/web` wiring

Install: `@orpc/client`, `@orpc/tanstack-query`, `@tanstack/react-query`, `react-hook-form`, `@hookform/resolvers`, `@t3-oss/env-nextjs`

```
apps/web/
├── .env.example
├── env.ts
├── lib/
│   ├── orpc.ts               globalThis.$client ?? createORPCClient(link)
│   ├── orpc.server.ts        import "server-only" + createRouterClient
│   └── orpc-query.ts         createTanstackQueryUtils(client)
└── app/
    ├── providers.tsx         QueryClientProvider
    ├── rpc/[[...rest]]/route.ts        six method exports  (C9)
    └── api/auth/[...all]/route.ts      toNextJsHandler(auth)
```

`apps/web/package.json` must **not** declare `@packages/db`. This is the enforcement mechanism, not a convention.

**Verify:** `pnpm build` succeeds, and adding `import { db } from "@packages/db"` to any file under `apps/web` fails typecheck.

### Phase 7 — the `post` example domain

Complete the vertical slice through every layer and wire the UI: a Server Component list (path 1) and a client form using `useMutation` + `zodResolver` (path 2).

**Verify:** `pnpm verify` green, and the page works in the browser.

### Phase 8 — docs and agent rules

⚠️ **Blocked — still an open decision.** See [architecture.md §13](./architecture.md).

---

## 4. Decisions needed before implementation starts

| # | Decision | Blocks | Status |
|---|---|---|---|
| 1 | **C1** — Drizzle version | Phase 2 onward | ✅ v1.0.0-rc.4, verified by spike |
| 2 | **C4** — Better Auth adapter import path | Phase 3 | ✅ `@better-auth/drizzle-adapter` |
| 3 | `docs/` structure and `AGENTS.md` content | Phase 8 | ⏸ open |
| 4 | Local quality gate (`pnpm verify`, hooks) | every phase's verify step | ⏸ open |

Phases 0 through 7 are unblocked.

---

## 5. Sources

Official documentation consulted on 2026-08-13:

- oRPC — [Next.js adapter](https://orpc.dev/docs/adapters/next), [contract-first](https://orpc.dev/docs/contract-first/define-contract), [implement contract](https://orpc.dev/docs/contract-first/implement-contract), [TanStack Query](https://orpc.dev/docs/integrations/tanstack-query), [SSR optimisation](https://orpc.dev/docs/best-practices/optimize-ssr), [errors](https://orpc.dev/docs/error-handling), [client errors](https://orpc.dev/docs/client/error-handling), [server actions](https://orpc.dev/docs/server-action)
- Drizzle — [RLS](https://orm.drizzle.team/docs/rls), [Supabase](https://orm.drizzle.team/docs/connect-supabase), [PGlite](https://orm.drizzle.team/docs/connect-pglite), [v0 → v1 changes](https://orm.drizzle.team/docs/v0-v1-changes)
- Better Auth — [installation](https://www.better-auth.com/docs/installation), [Drizzle adapter](https://www.better-auth.com/docs/adapters/drizzle), [Next.js](https://www.better-auth.com/docs/integrations/next), [CLI](https://www.better-auth.com/docs/concepts/cli)
- Vitest — [projects](https://vitest.dev/guide/projects)
- t3-env — [core](https://env.t3.gg/docs/core)
- Next.js 16 — `apps/web/node_modules/next/dist/docs/01-app/02-guides/upgrading/version-16.md` (local)
