# Architecture & Tech Stack

> **Status: this document describes the target design, not what currently exists in the repo.**
> As of now the repo contains only Next.js + shadcn/ui — there is no oRPC, Drizzle, Better Auth, or test infrastructure yet.
> Last updated: 2026-08-13

---

## 1. Purpose

A base template that lets multiple projects start quickly with the same tech stack and conventions.
Development is AI-driven; a human reviews code and UI as the final gate.

Every decision below follows from these principles:

| Principle | What it means in practice |
|---|---|
| **Type-safe end to end** | Types flow DB → contract → client with no guessing. When AI breaks something, `tsc` flags the whole chain. |
| **Boundaries enforced by tooling** | Never rely on discipline. Importing across a forbidden boundary must fail at build time. |
| **Single source of truth** | Each rule is written in exactly one place. |
| **No business logic** | The template ships structure and conventions only. |
| **Lean** | Nothing is included until it is needed. Everything here can be added later without a rewrite. |

---

## 2. Tech Stack

| Layer | Choice | Why |
|---|---|---|
| Monorepo | pnpm workspaces + Turborepo | Already in place; strict `node_modules` is what enforces package boundaries |
| Framework | Next.js 16 (App Router) | Very new — AI must read `node_modules/next/dist/docs/` before writing Next.js code |
| Language | TypeScript (strict) | |
| UI | Tailwind v4 + shadcn/ui on Base UI | Already in `packages/ui` |
| API | **oRPC** (contract-first) | Type-safe, emits OpenAPI, and the contract is shareable with mobile |
| ORM | **Drizzle** | Schema is TypeScript rather than a separate DSL, no codegen step, query errors surface in `tsc` |
| Database | **Supabase** (used as hosted Postgres) | |
| Auth | **Better Auth** | |
| Client data fetching | **TanStack Query** via `@orpc/tanstack-query` | |
| Forms | **react-hook-form** + `zodResolver` | Reuses the same zod schema the contract validates with |
| Validation | **zod v4** | |
| Testing | **Vitest** + **PGlite** | PGlite is Postgres compiled to WASM, running in-process — no Docker required |
| Env | **t3-env** + zod | |
| Lint / Format | ESLint 9 + Prettier | Already in `tooling/` |

### Deliberately excluded

| Not used | Reason |
|---|---|
| **Server Actions** | Duplicates what `/rpc` already does, and Expo cannot call them — two paths means AI has to guess which one to use |
| **Supabase Auth / RLS policies** | Authorization lives in oRPC only (see §6) |
| **CI (GitHub Actions)** | Not yet. Test helpers accept `TEST_DATABASE_URL` from day one so CI can be added as a config-only change |
| **Playwright / Storybook / Testing Library** | Not yet. All three can be added later without restructuring |
| **Sentry / pino** | `console.error` for now, behind a single interceptor that can be swapped |

---

## 3. Structure

```
base-template/
├── apps/web/                Next.js app
├── packages/
│   ├── contract/            The spec — zod schemas + oRPC contract
│   ├── db/                  Drizzle schema + client + migrations
│   ├── auth/                Better Auth (server + client entry points)
│   ├── api/                 oRPC router
│   └── ui/                  shadcn components
├── tooling/
│   ├── eslint-config/
│   └── typescript-config/
└── docs/
```

**There is no `apps/mobile`.** Readiness for Expo comes from splitting out `contract` and `auth/client`, not from creating an empty folder.

### Why five packages

The split follows hard technical constraints, not aesthetics:

| Package | Why it cannot be merged |
|---|---|
| `contract` | Expo must import it without dragging in Drizzle or Better Auth |
| `db` | Both `auth` and `api` depend on it. Putting `db` inside `api` creates the cycle `auth → api → auth` |
| `auth` | The browser-side login page calls it directly, bypassing oRPC |
| `api` | The layer that composes everything else |
| `ui` | DOM-only (Tailwind + Base UI); unusable from React Native |

### Dependency graph

```
apps/web ──┬─► ui              ┐
           ├─► contract        │  reachable from the browser
           ├─► auth/client     ┘
           ├─► auth/server     ┐
           └─► api             ┘  server-side only
                 │
                 ├─► contract
                 ├─► auth/server
                 └─► db
```

---

## 4. What each surface may import

`apps/web` splits into two halves, because client-component code is shipped to the user's machine in full while Server Component code never leaves the server.

| | web (server) | web (browser) | mobile (future) |
|---|:---:|:---:|:---:|
| `@packages/contract` | ✅ | ✅ | ✅ |
| `@packages/auth/client` | ✅ | ✅ | ✅ |
| `@packages/ui` | ✅ | ✅ | ❌ |
| `@packages/api` | ✅ | ❌ | ❌ |
| `@packages/auth/server` | ✅ | ❌ | ❌ |
| `@packages/db` | ❌ | ❌ | ❌ |
| `next/*` | ✅ | ✅ | ❌ |
| TanStack Query | — | ✅ | ✅ |
| react-hook-form | — | ✅ | ✅ |

### Why `apps/web` must not touch `@packages/db`

If it could, this would compile cleanly, run fine, and **skip authorization entirely**:

```tsx
// ❌ forbidden
import { db, posts } from "@packages/db"

export default async function Page() {
  const all = await db.select().from(posts)   // never passes through requireAuth
  return <List posts={all} />
}
```

```tsx
// ✅ correct
import { client } from "@/lib/orpc"

export default async function Page() {
  const posts = await client.post.list()      // always passes through requireAuth
  return <List posts={posts} />
}
```

### How the boundary is enforced (not by discipline)

1. **Undeclared dependency** — `apps/web/package.json` does not list `@packages/db`. pnpm's strict layout means the module cannot be resolved, so `tsc` fails.
2. **`import "server-only"`** — at the top of `auth/server.ts`. Any `"use client"` file that reaches it breaks the build.
3. **`packages/api` must not re-export `db`** — otherwise the shortcut reopens.

---

## 5. Data flow

Exactly two paths, with clearly separate jobs:

```
              one procedure
                    ▲
        ┌───────────┴───────────┐
     path 1                  path 2
  direct in-process        HTTP /rpc
        │                       │
 Server Component      Client Component + mobile
 (createRouterClient)    (TanStack Query)
```

| Use case | Path | Code |
|---|---|---|
| Data needed on first render | 1 | `await client.post.list()` |
| Data that changes with interaction | 2 | `useQuery(orpc.post.list.queryOptions())` |
| Create / update / delete | 2 | `useMutation(orpc.post.create.mutationOptions())` |

The switch lives in `apps/web/lib/orpc.ts`: on the server it resolves to the direct caller, in the browser to the HTTP client — automatically.

### SEO rule

**Any page that needs SEO must fetch its data in a Server Component.** `useQuery` ships empty HTML first, and link-preview bots (LINE, Facebook, X) do not execute JavaScript at all.

Common trap: adding `"use client"` at the top of `page.tsx` just to use one `useState`. That moves the whole page to the browser and destroys SEO.
Correct approach: keep `page.tsx` a Server Component and extract only the interactive parts into child components.

---

## 6. Security

### Authorization lives in oRPC middleware, and only there

```ts
// packages/api/src/middleware/auth.ts
const requireAuth = base.middleware(async ({ context, next }) => {
  const session = await auth.api.getSession({ headers: context.headers })
  if (!session) throw new ORPCError("UNAUTHORIZED")
  return next({ context: { user: session.user } })
})
```

Every query filters explicitly:

```ts
db.select().from(posts).where(eq(posts.authorId, context.user.id))
```

**Why not RLS policies:** when a policy is wrong, the symptom is rows silently disappearing or a generic message — neither of which AI can diagnose. It also splits the rules across two languages and two locations.

### RLS deny-all — protection if a key leaks

Every table enables RLS **with zero policies**:

```ts
export const posts = pgTable("posts", { ... }).enableRLS()
```

- Drizzle connects as `postgres`, which owns the tables, and Postgres bypasses RLS for table owners → the app is unaffected.
- `anon` and `authenticated` are not owners → RLS applies → no policies → zero rows.
- Result: **a leaked anon key reads nothing**, with no SQL policies to debug.

Never enable `FORCE ROW LEVEL SECURITY`; that would apply RLS to the owner as well.

A guard test prevents forgetting, in `packages/db/src/schema/rls-guard.test.ts`:

```ts
it("every table has RLS enabled", async () => {
  const unprotected = await db.execute(sql`
    select c.relname from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'r' and c.relrowsecurity = false
  `)
  expect(unprotected.rows).toEqual([])
})
```

### `.output()` prevents accidental data leaks

Every procedure declares `.output()`. If a handler returns an object carrying `passwordHash`, `tsc` rejects it.

### Secrets

- The Supabase `service_role` key is never stored in the project — this stack does not need it.
- `ORPCError.data` is transmitted to the client. Never put sensitive values in it.

---

## 7. Contract-first

Separate the *spec* (what goes in and out) from the *implementation* (how).

```ts
// packages/contract/src/post/contract.ts
export const postContract = {
  create: oc
    .input(CreatePostInput)
    .output(PostSchema)
    .errors({
      QUOTA_EXCEEDED: { data: z.object({ limit: z.number() }) },
      NOT_FOUND: {},
    }),
}
```

```ts
// packages/api/src/router/post.ts
const os = implement(contract)

export const postRouter = os.router({
  post: {
    create: os.post.create.use(requireAuth).handler(async ({ context, input, errors }) => {
      if (used >= limit) throw errors.QUOTA_EXCEEDED({ data: { limit } })
      ...
    }),
  },
})
```

Three benefits:

1. `.output()` blocks accidental data leaks.
2. Expo imports only the contract — no server code follows it.
3. A handler that drifts from the contract fails `tsc` immediately.

### Form schemas derive from the contract

```ts
const formSchema = CreatePostInput
  .extend({ confirmPassword: z.string() })
  .refine(d => d.password === d.confirmPassword, { path: ["confirmPassword"] })
```

Never redeclare a schema that already exists in the contract.

---

## 8. Errors

Structurally separate **expected outcomes** from **bugs**.

| | Declared in the contract | Not declared |
|---|---|---|
| Meaning | Expected; the user should see a specific message | A bug → `INTERNAL_SERVER_ERROR` |
| UI | Show a targeted message | "Something went wrong" |
| Log it? | No | **Yes** |

```tsx
const [error, data, isDefined] = await safe(client.post.create({ ... }))

if (isDefined) {
  if (error.code === "QUOTA_EXCEEDED") toast.error(`Limit is ${error.data.limit} posts`)
} else if (error) {
  toast.error("Something went wrong")   // ← real bugs land here
}
```

Logging happens in a single interceptor in `packages/api` that `console.error`s undeclared errors only. Swapping in Sentry later is a one-file change.

---

## 9. Testing

| Level | Covers | Tools | Volume |
|---|---|---|---|
| Unit | Pure functions with no external dependencies | Vitest | Few |
| Integration | A full oRPC handler: zod → auth middleware → Drizzle → real Postgres | Vitest + PGlite | **The bulk of the suite** |

Nearly all logic lives in handlers that talk to the database, so tests that mock the database verify almost nothing.

```ts
it("cannot update another user's post", async () => {
  const client = createRouterClient(postRouter, { context: { db, user: alice } })
  await expect(client.update({ id: postOfBob.id, title: "x" })).rejects.toThrow("NOT_FOUND")
})
```

**Why PGlite:** it is Postgres compiled to WASM, running in the test process, so there is no Docker daemon to start and no shared database to clean up between runs. Fast enough that AI actually runs tests on every edit instead of guessing.

**Measured cost (2026-08-13):** booting a PGlite instance takes ~1.4s *every* time — it is a real Postgres boot, not a cached one. Statements against a live instance take ~6ms.

The pattern that follows, and which every test file must use:

```ts
beforeAll(async () => { db = await createTestDb() })   // ~1.4s, once per file
afterEach(async () => { await resetDb(db) })           // ~6ms, between tests
```

Creating an instance per test instead of per file made the three-test guard suite take 4.8s rather than 1.7s. Vitest runs files in parallel, so the boot cost is paid once per file, concurrently.

**Limitations:** PGlite is WASM — some extensions are unavailable and role/permission support is incomplete.
`src/testing.ts` accepts `TEST_DATABASE_URL` from the start, so adding a real Postgres run in CI later requires no test changes.

---

## 10. Environment variables

Each package owns its own env: `.env`, `.env.example`, and `env.ts` sit together in the same folder.

```
apps/web/       .env  .env.example  env.ts      NEXT_PUBLIC_*, DATABASE_URL, BETTER_AUTH_*
packages/db/    .env  .env.example  src/env.ts  DATABASE_URL
packages/auth/  .env  .env.example  src/env.ts  BETTER_AUTH_SECRET, BETTER_AUTH_URL
```

```ts
// packages/db/src/env.ts
export const env = createEnv({
  server: { DATABASE_URL: z.url() },
  runtimeEnv: process.env,
})
```

**`DATABASE_URL` is knowingly duplicated** across `apps/web/.env` (used by `next dev`) and `packages/db/.env` (used by `drizzle-kit push`). Both `.env.example` files carry a note that the values must match.

The payoff: instead of a `TypeError: Cannot read properties of undefined` buried inside Drizzle, you get

```
❌ Invalid environment variables:
   DATABASE_URL: Required
```

---

## 11. The `post` example domain

The template ships a `post` domain wired through every layer (contract → db → api → test) as a pattern for AI to copy.

**Why keep a live example instead of only documenting the pattern:** the example is checked by `tsc` and Vitest on every run. When oRPC or Drizzle changes an API, it goes red. Prose documentation and generator templates keep describing the old way with nothing to catch them.

Delete when starting a real project:

```
packages/contract/src/post/
packages/db/src/schema/post.ts
packages/api/src/router/post.ts
packages/api/test/post.test.ts
apps/web/app/posts/
```

---

## 12. Consuming the template

Use GitHub's **"Use this template"** button.

**Accepted limitation:** projects created this way do not receive later template updates, since the git histories are unrelated. Propagating an improvement means copying files manually.

That is a further reason to keep the template **small and stable**.

---

## 13. Open decisions

| Topic | Outstanding question |
|---|---|
| `docs/` + `AGENTS.md` | What goes where, and which rules belong in the always-loaded `AGENTS.md` |
| Local quality gate | `pnpm verify` / Claude Code hook / git hook |

---

## 14. Fixes needed in the current repo

| File | Problem |
|---|---|
| `.gitignore:38` | `.env*` also ignores `.env.example` — add `!.env.example` |
| `turbo.json` | No `test` task defined |
| `pnpm-workspace.yaml:9` | Leftover `msw: false` entry although msw is not used |
