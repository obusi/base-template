# Architecture

> **Status: built.** Everything described here exists in the repo and is
> exercised by `pnpm verify`.
>
> This is the single design document. It answers *why* the repo is shaped the
> way it is; `CLAUDE.md` and `.claude/rules/*.md` answer *what to do* while
> writing code, and the code's own comments answer *why this line*. Read the
> relevant section here before changing a structural rule — the rules files
> state the rule, this states what it costs to break it.
>
> **Every section has a stable id — S1, S2, … — and that is how it is cited.**
> `CLAUDE.md`, `.claude/rules/`, and source comments all point here with
> `see docs/architecture.md S10`, so a reader lands on the exact section with
> nothing to search for.
>
> **The ids are names, not positions.** They are assigned once and never
> reused or reordered: deleting S4 leaves S5 as S5, and a section added later
> takes the next free number even if it belongs in the middle. So the ids may
> eventually run out of order, and that is the point — a citation written today
> cannot rot. `C1`…`C18` inside S10 already work this way, and `C2` is missing
> for exactly that reason.
>
> S13 onward are the appendices: the part a real project deletes. They are
> numbered on the same scheme, so removing them leaves every section before
> S13 untouched.
>
> Last updated: 2026-08-17

Three principles every decision below follows from:

| Principle | What it means in practice |
|---|---|
| **Type-safe end to end** | Types flow DB → contract → client with no guessing. When AI breaks something, `tsc` flags the whole chain. |
| **Boundaries enforced by tooling** | Never rely on discipline. Importing across a forbidden boundary must fail at build time. |
| **Single source of truth** | Each rule is written in exactly one place. |

Development is AI-driven; a human reviews code and UI as the final gate.

---

## S1. The stack

| Layer | Choice | Why |
|---|---|---|
| Monorepo | pnpm workspaces + Turborepo | Strict `node_modules` is what enforces package boundaries |
| Framework | Next.js 16 (App Router) | Very new — read `apps/web/node_modules/next/dist/docs/` before writing Next.js code |
| Language | TypeScript (strict) | |
| UI | Tailwind v4 + shadcn/ui on Base UI | In `packages/ui` |
| API | **oRPC** (contract-first) | Type-safe, and the contract is shareable with mobile |
| API docs | **`@orpc/openapi`** + **Scalar** | The spec is generated from the contract at `/api/spec`, so it cannot describe an API that no longer exists. Browsable at `/api/docs` |
| ORM | **Drizzle** | Schema is TypeScript rather than a separate DSL, no codegen step, query errors surface in `tsc` |
| Database | **Supabase**, used as hosted Postgres | Used as plain Postgres: no `@supabase/*` package is installed, the Data API stays off, and the database is reached only through Drizzle. RLS deny-all is the wall (S5) |
| Auth | **Better Auth** | |
| Client data fetching | **TanStack Query** via `@orpc/tanstack-query` | Devtools are a devDependency; the package compiles away outside development |
| Forms | **react-hook-form** + `zodResolver` | Reuses the same zod schema the contract validates with |
| Validation | **zod v4** only | See C7 |
| Testing | **Vitest** + **PGlite** | PGlite is Postgres compiled to WASM, in-process — no Docker |
| Env | **t3-env** + zod | |
| Lint / Format | ESLint 9 + Prettier | In `tooling/` |

### Deliberately excluded

Each of these is a thing a reasonable person would add. They are absent on
purpose, and adding one should be a deliberate decision rather than a reflex:

| Not used | Reason |
|---|---|
| **Server Actions** | Duplicates what `/rpc` already does, and Expo cannot call them — two paths means AI has to guess which one to use |
| **Supabase Auth / RLS policies** | Authorization lives in oRPC only (see S5) |
| **Playwright / Storybook / Testing Library** | Not yet. All three can be added later without restructuring |
| **Sentry / pino** | `console.error` for now, behind a single interceptor that can be swapped |
| **`apps/mobile`** | Readiness for Expo comes from splitting out `contract` and `auth/client`, not from an empty folder |

### Versions are pinned, and two of them exactly

`package.json` is the source of truth for versions; do not maintain a second
list. Two rules about it:

- **`drizzle-orm` and `drizzle-kit` are pinned with no `^`, and must match each
  other.** Both sit at `1.0.0-rc.4`. C1 explains why a release candidate is the
  correct choice here and why "upgrade to stable" is a downgrade.
- **`zod` is 4.x everywhere it is declared.** A v3 copy arrives transitively;
  see C7 for why that is harmless until it isn't.

---

## S2. Structure

```
<project>/
├── apps/web/                Next.js app
├── packages/
│   ├── contract/            The spec — zod schemas + oRPC contract
│   ├── db/                  Drizzle schema + client + migrations
│   ├── auth/                Better Auth (server + client entry points)
│   ├── api/                 oRPC router — implements the contract
│   └── ui/                  shadcn components
├── tooling/                 eslint-config, typescript-config, vitest-config
└── docs/
```

### Why five packages

The split follows hard technical constraints, not aesthetics. Merging any two
breaks something specific:

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

### How the folders are organised

`contract` and `api` group by domain — `src/domains/<name>/` — with
cross-cutting concerns in named sibling folders (`shared/`, `middleware/`,
`connection/`, `testing/`) rather than one generic bucket. Adding a domain
means adding the same folder name in each package, so there is nothing to
rename and nothing to guess.

`db` groups by domain too, but a domain is one *file* (`src/schema/<name>.ts`),
because a db domain has never needed more than a single schema and a folder
holding one file buys nothing. `connection/` and `testing/` mean the same thing
in `db` as in `api` — the real thing, and the throwaway thing tests get — so
the pattern reads identically in both.

`ui` and `auth` opt out: neither has a business domain to group by, so they
organise by type.

`apps/web` splits into `app/` (routing only, no logic), `features/<domain>/`
(the actual UI and logic, each with an `index.ts` nobody imports past),
`components/` and `hooks/` (feature-agnostic, usually empty), and `lib/`
(infrastructure).

**The per-file detail lives in `.claude/rules/`** — `apps-web-structure.md`,
`packages-conventions.md`, and one file each for `api`, `db`, and `contract`.
They load automatically when work touches the matching directory, and they hold
the file trees, the import rules, and the checklist for adding a domain.

---

## S3. Boundaries

`apps/web` splits into two halves, because client-component code is shipped to
the user's machine in full while Server Component code never leaves the server.

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

If it could, this would compile cleanly, run fine, and **skip authorization
entirely**:

```tsx
// ❌ forbidden
import { db, invoice } from "@packages/db"

export default async function Page() {
  const all = await db.select().from(invoice)   // never passes through requireAuth
  return <List invoices={all} />
}
```

```tsx
// ✅ correct
import { client } from "@/lib/orpc"

export default async function Page() {
  const invoices = await client.invoice.list()  // always passes through requireAuth
  return <List invoices={invoices} />
}
```

### How the boundaries are enforced (not by discipline)

1. **Undeclared dependency.** `apps/web/package.json` does not list
   `@packages/db`, and pnpm's strict layout makes it unresolvable, so `tsc`
   fails. Verified: adding the import produces
   `TS2307: Cannot find module '@packages/db'`.
2. **`import "server-only"`** at the top of `auth/server.ts`. Any `"use client"`
   file that reaches it breaks the build.
3. **`packages/api` must not re-export `db`**, or the shortcut reopens through
   the front door.
4. **Nothing imports a database — it is handed one.** `packages/api` takes it
   through oRPC's context (`ApiContext.db`), `packages/auth` takes
   `createAuth(database)`. A module-level import binds the code to
   `DATABASE_URL` at load time, which makes every handler untestable: there is
   no way to point it at the throwaway PGlite instance a test just seeded.
   `Database` is deliberately the shared `PgAsyncDatabase` base rather than
   `typeof db`, because the postgres-js and PGlite databases are separate
   classes assignable to neither, and only their common base accepts both.
5. **`packages/contract` may depend on `@orpc/contract` and `zod`, and nothing
   else** — checked by `packages/contract/src/shared/dependencies.test.ts`,
   which reads the package's own `package.json`. Verified to fail: adding
   `@packages/db` to its dependencies turns the test red with `+ "@packages/db"`.

Boundary 5 is the one nobody would notice breaking until a React Native build
tried to bundle Drizzle, months later and far from whoever added the import.
That distance is exactly why it is a test rather than a convention.

---

## S4. Data flow

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
| Data needed on first render | 1 | `await client.<domain>.list()` |
| Data that changes with interaction | 2 | `useQuery(orpc.<domain>.list.queryOptions())` |
| Create / update / delete | 2 | `useMutation(orpc.<domain>.create.mutationOptions())` |

The switch lives in `apps/web/lib/orpc.ts`: on the server it resolves to the
direct caller, in the browser to the HTTP client — automatically.
`instrumentation.ts` installs the direct caller once at server start, before
the first request.

Without the switch, a Server Component fetching data would make an HTTP request
to its own process: a wasted round trip, and a way to exhaust the request pool
under load.

The context both paths hand over is built in
`packages/api/src/connection/live.ts`, not in `apps/web`. Assembling it in the
app would require `apps/web` to depend on `@packages/db`, and the absence of
that dependency is boundary 1.

`.claude/rules/apps-web-structure.md` covers which of the four client-side
fetching hooks to reach for, including when a Server Component should prefetch
into a `<HydrationBoundary>` instead of awaiting directly.

### A third door: REST at `/api/v1`

The same router is also served over plain HTTP, using the paths and methods
each procedure declares with `.route()` in the contract:

```
/rpc        oRPC protocol   this app's own client, and Expo later
/api/v1     REST            anything else — curl, a partner, another language
/api/auth   Better Auth     sign in, sign up, sign out
```

Both doors run the same procedures, the same `requireAuth`, and the same
`where` clauses, so there is no second implementation to keep in step. A `GET`
against a collection returns rows; a `POST` without a cookie returns
`401 UNAUTHORIZED` exactly as `/rpc` does.

`/api/spec` generates the OpenAPI document from the contract — nothing is
written by hand, so it cannot describe an API that no longer exists — and
`/api/docs` renders it with Scalar, including a request playground.

`.route()` is inert for `/rpc`, which addresses procedures by their position in
the contract object. Adding routes changed no existing caller.

Under `/api/v1` and not `/api`, because `/api/auth` is already a catch-all and
two of them at the same level would be ambiguous.

### Auth does not use either path

Signing in, signing up, and signing out go straight to Better Auth's own
endpoints under `/api/auth`, not through oRPC:

```
login / signup / logout   →  /api/auth   (Better Auth's handler)
everything else           →  /rpc        (oRPC)
```

There is no contract for auth, and writing one would be a mistake. Better Auth
already ships a typed client, and its Expo integration talks to the same
`/api/auth` endpoints with `expo-secure-store` swapped in for browser cookies —
so the portability problem `packages/contract` exists to solve does not apply
here. Wrapping it would mean redeclaring schemas Better Auth owns,
reimplementing its cookie and session handling, and falling silently behind
every time a plugin (2FA, social login, magic links) adds endpoints of its own.

oRPC's relationship to auth is different: it does not perform authentication, it
*reads* the result. That is what `requireAuth` in `packages/api` does.

### Sending email is a seam, and it is not filled

Password reset is the one auth flow that cannot work without an outbox, so
`createAuth(database, { sendResetPassword })` takes the sender as an argument
rather than importing one. Three things fall out of that, in order of how often
they matter:

**Nothing configured writes the link to the server log**, with a warning. That
is right for development — reading the link out of the terminal is how you
finish a reset without an inbox — and **wrong everywhere else**: in production
the person waiting on the email never gets one, and the link that would have
let them in sits in a log instead.

**`RESEND_API_KEY` switches on a real sender.** `src/resend.ts` is about twenty
lines of `fetch` and needs no dependency, which is the only reason a provider
ships here at all. It is a starting point, not a recommendation: a project that
prefers another provider replaces that file, or passes its own function and
deletes it. `RESEND_FROM` defaults to Resend's sandbox address, which delivers
only to the account owner — enough to test with, not enough to ship.

**Tests pass a sender that collects tokens.** That is what lets
`packages/auth/src/config.test.ts` walk a whole reset — request, link, new
password, old password refused, token spent — through a real database with
nothing leaving the machine.

### Social login is the same kind of seam

`socialProviders` in `config.ts` is off until a project sets credentials for a
provider — `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` for Google, the one
this template ships wired — and `createAuth`'s `google` option takes the pair
as an argument rather than reading `env` inside the factory, for the same
reason `sendResetPassword` does: a test can hand it throwaway credentials and
assert on the authorization URL Better Auth builds, without a real OAuth
client or a browser. Adding another provider later is the same shape again —
a new key in `socialProviders`, gated on its own pair of env vars.

**An unconfigured switch hides its UI rather than rendering a dead control.**
`app/signin/page.tsx` reads the same pair and passes `googleEnabled` down, so a
fresh clone shows no Google row; the report form hides its file picker the same
way. The alternative — render always, fail on click — was tried and is what a
person meets first on a clone, which reads as a broken page rather than an
unconfigured one.

This is a presentation rule, not a security one, and the distinction matters:
the server refuses regardless. `packages/auth/src/config.test.ts` still asserts
`PROVIDER_NOT_FOUND` for an unconfigured provider, and that test is the one
that would catch a real hole. Deciding it in the route file is deliberate — the
page component is a Client Component, and a check made there would need the
credentials published to the browser.

### Object storage is the third seam, and it holds the only stand-in

Report attachments need somewhere to put bytes, and `ApiContext` carries a
`storage` that is `Storage | null` — `null` being the normal state, exactly as
an absent `sendResetPassword` is. A deployment with no bucket runs: the form
hides its file picker and `report.createUploadUrls` answers
`ATTACHMENTS_UNAVAILABLE`.

**The bytes never pass through this API.** `createUploadUrls` mints a path,
signs a URL for it, and the browser PUTs straight to Supabase. Sending images
through `/rpc` instead would put 15 MB inside a JSON body and meet a serverless
request-body limit in production rather than in review.

**The browser holds no Supabase key of any kind.** Both directions are signed
on the server with the `service_role` key, so switching storage on does not
reopen the anon-key surface `setup.md` step 2 goes out of its way to close, and
no `@supabase/*` package reaches the browser bundle. The bucket is private with
no policies, for the same reason tables have RLS with no policies: the server
holds a key that bypasses them and authorization lives in oRPC.

**A path is minted, never accepted.** It is `report/<user id>/<uuid>.<ext>`, and
`report.create` checks that every path it is handed starts with the caller's own
prefix. The paths make a round trip through a browser, so they are input like
any other — the prefix is what turns "is this yours?" into a string comparison,
the same instinct as putting ownership in a `where` clause.

**This is the one place a test gets a stand-in.** `testing/index.ts` has a
`fakeStorage`, and `testing.md`'s rule against mocks still holds everywhere
else: a database is Postgres compiled to WASM that boots in 1.4 seconds, while
storage is an HTTP service on somebody else's machine. What is worth testing is
this repo's own logic — which paths are minted, whose prefix they carry, that a
URL is signed per attachment — and every bit of that is visible through two
functions.

### Every user field has exactly one owner

Better Auth can add columns to the `user` table through `additionalFields`. Use
it only for fields Better Auth itself needs in order to work.

| Field | Owner | Where it lives |
|---|---|---|
| `email`, `name`, `image` | Better Auth | `user` table, edited via `authClient.updateUser()` |
| `role`, `bio`, `location`, preferences | The project | Its own table, its own contract, edited via oRPC |

The test is not how user-related a field feels, it is whether authentication
breaks without it. `email` sends the password-reset link, so it belongs to
Better Auth; taking it over gains nothing and risks two copies disagreeing.
`bio` is business data wearing a user-shaped hat.

`role` is the borderline case, and it went to the project. Better Auth's admin
plugin would own it legitimately — turning the plugin on makes `auth:generate`
emit the column, and the session then carries the role, sparing `requireAdmin`
a query. What arrives with it is the rest of the plugin: `banUser`,
`impersonateUser`, `listUsers` and `removeUser` mounted under `/api/auth`, plus
a column on `session`, inherited by every project forked from here whether or
not it wanted an admin console. Nothing signs in differently because of `role`,
so by the test above it is the project's, and it is a column on `profile`.

Putting business fields in `additionalFields` costs four things: their
validation rules move out of `packages/contract` into the auth config, so there
are two places to look; forms lose the single schema source described in
S6; `.output()` no longer constrains what goes back to the
client; and every new field means regenerating `schema/auth.ts`, a file with
three edits that have to be reapplied by hand each time (C3, C5, C14).

### SEO rule

**Any page that needs SEO must fetch its data in a Server Component.**
`useQuery` ships empty HTML first, and link-preview bots (LINE, Facebook, X) do
not execute JavaScript at all.

Common trap: adding `"use client"` at the top of `page.tsx` just to use one
`useState`. That moves the whole page to the browser and destroys SEO. Correct
approach: keep `page.tsx` a Server Component and extract only the interactive
parts into child components.

---

## S5. Security

### Authorization lives in oRPC middleware, and only there

```ts
// packages/api/src/middleware/auth.ts
export const requireAuth = os.middleware(async ({ context, next }) => {
  const session = await context.auth.api.getSession({ headers: context.headers })
  if (!session) throw new ORPCError("UNAUTHORIZED")
  return next({ context: { user: session.user } })
})
```

Procedures carrying it can read `context.user`; procedures without it have no
`context.user` to read, so forgetting the middleware is a type error rather
than an open door.

Authentication is that middleware. *Authorization* — whether this user may
touch that row — is every query's `where` clause, never a separate
read-then-check:

```ts
db.update(invoice)
  .set(changes)
  .where(and(eq(invoice.id, id), eq(invoice.ownerId, ownerId)))
```

Two statements would leave a window in which the row changes owner between
them, and would scatter the rule so a reader has to find both to know what the
endpoint allows. Verified to fail: deleting the ownership term from an `update`
handler turns its cross-user test red with
`promise resolved instead of rejecting`.

**Why not RLS policies:** when a policy is wrong, the symptom is rows silently
disappearing or a generic message — neither of which AI can diagnose. It also
splits the rules across two languages and two locations.

### The one rule that cannot be a `where` clause

`report.list` hands back every report rather than the caller's own, so there is
no ownership term that could express who may read it. What decides the answer
is who is asking, and that lives in a second middleware:

```ts
// packages/api/src/middleware/auth.ts
export const requireAdmin = requireAuth.concat(async ({ context, next }) => {
  if ((await getRole(context.db, context.user.id)) !== "admin") {
    throw new ORPCError("FORBIDDEN")
  }
  return next()
})
```

Built with `.concat` on `requireAuth` rather than declared beside it, so a
procedure carries one middleware instead of two in an order that could be
written the wrong way round. There is still exactly one place that turns a
cookie into a user.

`FORBIDDEN` here, not `NOT_FOUND`. The NOT_FOUND rule exists so a caller cannot
learn which ids are real from the error it gets back; this procedure takes no
id, so there is nothing to leak and the honest answer is the useful one.

The role is a column on `profile` — S4 has why it did not go to Better Auth.
`getRole` reads it without creating a row: `requireAdmin` runs on every admin
request, and a read should not write.

This is the exception, not a second pattern to reach for. A handler that
touches the caller's own rows still filters in the query.

### RLS deny-all — protection if a key leaks

Every table enables RLS **with zero policies**:

```ts
export const invoice = pgTable.withRLS("invoice", { ... })
```

- Drizzle connects as `postgres`, which both owns the tables and carries the
  `BYPASSRLS` attribute → the app is unaffected.
- `anon` and `authenticated` have neither → RLS applies → no policies → zero
  rows.
- Result: **a leaked anon key reads nothing**, with no SQL policies to debug.

`postgres` is **not** a superuser on Supabase, so the exemption rests entirely
on those two properties, and both are a function of how the project was
provisioned. Measured against a real Supabase project after `db:migrate`, not
assumed:

```
connected as : {"role":"postgres","is_superuser":false,"bypasses_rls":true}

account        owner=postgres  rls=true  policies=0
session        owner=postgres  rls=true  policies=0
user           owner=postgres  rls=true  policies=0
verification   owner=postgres  rls=true  policies=0
```

Both conditions hold at once. Worth re-running per project — which is what
`pnpm --filter @packages/db db:check` is for. If neither holds, deny-all locks
out the application itself, and the symptom is empty result sets rather than an
error.

Never enable `FORCE ROW LEVEL SECURITY`; that would apply RLS to the owner too.

### Two checks, two different questions

| | Runs against | Catches |
|---|---|---|
| `rls-guard.test.ts` | PGlite, every `pnpm test` | a table whose schema forgot `withRLS()` |
| `db:check` | the real database, once per project | a deployment where the app is locked out, or a public role is not |

They are not interchangeable. A Supabase project created with **Enable
automatic RLS** carries an event trigger that turns RLS on for every new table —
verified: `create table` with no `ALTER` still reports `relrowsecurity = true`.
That trigger would hide a missing `withRLS()` from `db:check`, and only the
PGlite test, which runs without it, still fails. Conversely the PGlite test
knows nothing about which role the deployment connects as.

Both are verified to fail. Removing `withRLS` from `user` turns three tests red
with `expected [ 'user' ] to deeply equal []`. Disabling RLS on `db:check`'s
probe table produces:

```
2 problem(s):
  - probe: anon read 1 of 1 row from a table with RLS on and no policies.
  - probe: authenticated read 1 of 1 row from a table with RLS on and no policies.
```

### `.output()` prevents accidental data leaks

Every procedure declares `.output()`. If a handler returns an object carrying
`passwordHash`, `tsc` rejects it.

### Secrets

- The Supabase `service_role` key is never stored in the project — this stack
  does not need it.
- `ORPCError.data` is transmitted to the client. Never put sensitive values in
  it.

---

## S6. Contract-first

Separate the *spec* (what goes in and out) from the *implementation* (how).

```ts
// packages/contract/src/domains/<name>/contract.ts
export const invoiceContract = {
  create: oc
    .input(CreateInvoiceInput)
    .output(InvoiceSchema)
    .errors({
      ...commonErrors,
      QUOTA_EXCEEDED: { data: z.object({ limit: z.number().int() }) },
    }),
}
```

```ts
// packages/api/src/domains/<name>/router.ts
export const create = os.invoice.create
  .use(requireAuth)
  .handler(async ({ context, input, errors }) => {
    const result = await service.createInvoice(context.db, context.user.id, input)
    if (!result.ok) throw errors.QUOTA_EXCEEDED({ data: { limit: result.limit } })
    return result.invoice
  })
```

Three benefits:

1. `.output()` blocks accidental data leaks.
2. Expo imports only the contract — no server code follows it.
3. A handler that drifts from the contract fails `tsc` immediately, so the
   contract cannot become stale documentation.

Inside `packages/api`, a handler is only the translation layer: it unwraps the
oRPC context, calls a `service.ts` function that takes a `Database` and plain
arguments, and turns the result into a value or a declared error. Services stay
free of every oRPC import so another domain can call them directly. See
`.claude/rules/packages-api.md`.

### Form schemas derive from the contract

```ts
const formSchema = CreateInvoiceInput
  .extend({ confirmTotal: z.number() })
  .refine(d => d.total === d.confirmTotal, { path: ["confirmTotal"] })
```

Never redeclare a schema that already exists in the contract.

### Why the contract's schemas are not derived from Drizzle

A domain's zod schemas in `packages/contract` and its Drizzle table in
`packages/db/src/schema/` describe the same shape in two places, and the
obvious improvement is to derive one from the other. It is not available:
`drizzle-zod`, or importing the table into `packages/contract`, pulls
`drizzle-orm` into that package's dependency graph and breaks boundary 5.

A single source of truth for field shapes is worth less than the portability
the five-package split exists to protect. If the duplication needs a guard, it
belongs on the `packages/db` side — the one allowed to depend on both — or in a
codegen step emitting plain zod, mirroring how `auth:generate` writes into
`packages/db`. Never by making `contract` import `db`.

---

## S7. Errors

Structurally separate **expected outcomes** from **bugs**.

| | Declared in the contract | Not declared |
|---|---|---|
| Meaning | Expected; the user should see a specific message | A bug → `INTERNAL_SERVER_ERROR` |
| UI | Show a targeted message | "Something went wrong" |
| Log it? | No | **Yes** |

The test for whether an error belongs in the contract is not how serious it is,
it is whether the caller can do anything about it. A missing row is expected and
actionable; a dropped database connection is neither.

```tsx
const [error, data, isDefined] = await safe(client.invoice.create({ ... }))

if (isDefined) {
  if (error.code === "QUOTA_EXCEEDED") toast.error(`Limit is ${error.data.limit}`)
} else if (error) {
  toast.error("Something went wrong")   // ← real bugs land here
}
```

`isDefinedError` from `@orpc/client` is what gives `error.data.limit` a type.

Declared errors carry the data the UI needs, so it never hard-codes a number the
server owns. `NOT_FOUND` deliberately covers both "no such row" and "not yours" —
answering them differently turns the endpoint into a way to discover which ids
exist.

Logging happens in a single interceptor in `packages/api` that `console.error`s
undeclared errors only. Swapping in Sentry later is a one-file change.

---

## S8. Testing

| Level | Covers | Tools | Volume |
|---|---|---|---|
| Unit | Pure functions with no external dependencies | Vitest | Few |
| Integration | A full oRPC handler: zod → auth middleware → Drizzle → real Postgres | Vitest + PGlite | **The bulk of the suite** |
| Structural | Rules no runtime check would notice: every table has RLS, `packages/contract` depends on nothing else | Vitest | One per rule |
| Deployment | Whether *this* database is configured the way the design assumes | `db:check`, by hand | Once per project |

Nearly all logic lives in handlers that talk to the database, so **tests that
mock the database verify almost nothing.** Do not reach for a fake repository;
get a real database, which costs about 1.4 seconds.

**Every guard needs a test that proves it can fail.** A check that cannot go red
is indistinguishable from one that is not running, and both have happened here:
an RLS guard that sat green for weeks because the schema it checked was empty,
and a `db:check` probe that would have reported success against a table with no
rows in it. Each is now paired with a case that fails on purpose — S5
records what those look like when they fire.

```ts
it("cannot touch another user's row", async () => {
  const bobs = await as(bob).invoice.create({ total: 100 })

  await expect(
    as(alice).invoice.update({ id: bobs.id, total: 1 }),
  ).rejects.toMatchObject({ code: "NOT_FOUND" })
})
```

Assert on `code`, never on the error message: the code is what the contract
declares and what client code branches on, while the message is a humanised
default that oRPC is free to reword (C17).

`alice` and `bob` are real rows created by a real `signUpEmail`, and `as(user)`
builds a context holding their actual session cookie. Fabricating
`{ user: { id } }` instead would skip `requireAuth` — the one piece of glue
between Better Auth and oRPC that this repo owns, and the seam where "signed in
but treated as anonymous" bugs live.

**Why PGlite:** Postgres compiled to WASM, running in the test process, so there
is no Docker daemon to start and no shared database to clean up between runs.
Fast enough that AI actually runs tests on every edit instead of guessing.

**Measured cost (2026-08-13):** booting a PGlite instance takes ~1.4s *every*
time — a real Postgres boot, not a cached one. `resetDb` between tests costs
~40ms; statements against a live instance ~6ms. So the instance is created once
per **file** in `beforeAll`, and reset in `beforeEach`. Creating one per test
instead made a three-test suite take 4.8s rather than 1.7s. Vitest runs files in
parallel, so the boot cost is paid once per file, concurrently.

`resetDb` runs in `beforeEach` rather than `afterEach` because it is itself code
that can fail — it once left the database empty instead of migrated — and a
cleanup that only runs after the test never gets to be the thing that goes red.
It drops every table **and re-applies the migrations**, leaving the state a
freshly migrated database is in rather than an empty one; dropping alone would
let schema assertions pass against nothing. It also drops the `drizzle` schema,
because the ledger of applied migrations lives in `drizzle.__drizzle_migrations`,
outside `public`, and leaving it behind makes the re-run a silent no-op.

**Limitations:** PGlite is WASM — some extensions are unavailable and
role/permission support is incomplete. `@packages/db/testing` accepts
`TEST_DATABASE_URL` from the start, so adding a real Postgres run in CI later
requires no test changes.

The concrete patterns — the lifecycle block, the helpers, what a new domain's
test file must contain — are in `.claude/rules/testing.md`.

---

## S9. Environment variables

Each package validates the variables it reads in its own `env.ts`, with t3-env
and zod. A `.env` file, though, belongs to a **process**, not to a package: it
is read by whatever program is started in that folder, and nothing else goes
looking for it.

| Package | validates in | real `.env`? | read by |
|---|---|:---:|---|
| `apps/web` | `env.ts` | yes | `next dev` / `next build` |
| `packages/db` | `src/connection/env.ts` | yes | the `drizzle-kit` commands |
| `packages/auth` | `src/env.ts` | **no** | nothing runs here — it is imported into `apps/web` |

So `packages/auth/.env.example` documents what the package requires, while the
values themselves go in `apps/web/.env`. Putting a real `.env` beside
`packages/auth/src/env.ts` would produce a file that looks authoritative and is
never opened.

**`DATABASE_URL` is knowingly duplicated** across `apps/web/.env` (used by
`next dev`) and `packages/db/.env` (used by the `drizzle-kit` commands). Both
`.env.example` files carry a note that the values must match.

**Some variables reach a process without any `.env` at all.** A deployment sets
them, so nothing here can carry a value and nothing validates them as required:

| Variable | Set by | Read in |
|---|---|---|
| `POSTGRES_URL` | Supabase's Vercel integration, per preview branch | the fallback below |
| `VERCEL_URL`, `VERCEL_BRANCH_URL` | Vercel, per deployment | `packages/auth/src/config.ts` |
| `BETTER_AUTH_ALLOWED_HOSTS` | a person, only where the two above cannot apply | the same |
| `VERCEL_ENV` | Vercel | `packages/db/scripts/deploy.ts` |

`DATABASE_URL` falls back to `POSTGRES_URL` when unset, which is what gives a
preview deployment a database of its own — S17 has the reasoning. That fallback
is written out in **three** places: both `env.ts` files and
`packages/db/scripts/deploy.ts`. The third is not carelessness — a script run as
`node scripts/deploy.ts` resolves imports the way Node does, needing a file
extension, and an import ending in `.ts` does not typecheck under this repo's
`moduleResolution`; `scripts/check.ts` reads `process.env` directly for the same
reason. All three carry a comment naming the others.

Anything in that table also has to appear in `turbo.json`'s `globalEnv`. Turbo
passes only declared variables through to a task, and drops the rest with a
warning in the build log that is easy to scroll past — a variable missing there
does not fail, it silently is not there.

`apps/web/env.ts` is imported for its side effect from `next.config.ts`.
Without that line it is only checked when some module happens to read it, so a
missing variable surfaces on a request rather than at build. Verified:
`next build` with no env fails, naming all three missing variables.

The payoff: instead of a `TypeError: Cannot read properties of undefined`
buried inside Drizzle, you get

```
❌ Invalid environment variables:
   DATABASE_URL: Required
```

---

## S10. Library traps

Every entry below is a conflict between what a library's documentation says and
what it does, found while building this stack and verified against the
installed version. **The `C` numbers are names, not positions** — source
comments cite them, and they never change or get reused.

These are the reason several files look strange. Do not "clean up" something in
this list without reading why it is that way.

### C1 — Drizzle's docs document v1, but `npm install` gives you v0 🔴

`orm.drizzle.team` documents the **v1 API**. The `latest` tag on npm is
**0.45.2**, the v0 line. They differ on the exact feature this repo depends on:

| | v0.45.2 (`latest`) | v1.0.0-rc.4 (`rc`) |
|---|---|---|
| Enable RLS without policies | `pgTable("x", {...}).enableRLS()` | `pgTable.withRLS("x", {...})` |
| Relational queries | RQBv1 | `defineRelations()` — RQBv1 removed |
| `.array()` | chainable | `column.array('[][]')` |
| Migration files | `journal.json` | DDL snapshots |
| `drizzle-kit push/pull` scope | public schema | all schemas |

The whole point of this setup is that AI reads official docs and writes correct
code. With v0.45.2 installed, AI reading the docs writes `pgTable.withRLS()`
and it fails — and the failure looks like a typo rather than a version
mismatch.

**Decided: `1.0.0-rc.4`, pinned exactly.** As of 2026-08-13 the v0 line had had
no release in 4.5 months while the package was still published to daily: v0 is
frozen, all work is on v1. "Stable" here means *unmaintained*, and choosing it
would guarantee a future breaking migration.

A compatibility spike (throwaway project, 2026-08-13) confirmed the combination
before it was adopted: `tsc --strict` clean, `pgTable.withRLS()` present,
`drizzle-orm/pglite` working, Better Auth's adapter constructing, `signUpEmail`
and `signInEmail` both round-tripping through it, and the RLS guard query
reporting `relrowsecurity` correctly on PGlite.

### C3 — the Better Auth CLI writes the schema to the wrong place 🟡

`auth generate` emits `schema.ts` at the **project root** by default. The auth
tables must live inside `packages/db`'s schema folder so foreign keys pointing
at `user.id` resolve within one Drizzle schema and one migration set. The
output path is therefore pinned in the `auth:generate` script rather than left
to whoever runs it.

### C4 — two valid import paths for the Drizzle adapter 🟡

Better Auth's own docs are inconsistent:

- `/docs/installation` → `import { drizzleAdapter } from "better-auth/adapters/drizzle"`
- `/docs/adapters/drizzle` → `import { drizzleAdapter } from "@better-auth/drizzle-adapter"`

Both are real; `better-auth` still exports the subpath and the standalone
package is published separately.

**Decided: the standalone `@better-auth/drizzle-adapter`.** The dedicated
adapter page is the more specific source, and splitting adapters into their own
packages is the direction Better Auth is moving.

### C5 — generated auth tables lose RLS 🟡

The CLI does not know about the deny-all rule, so regenerating turns
`pgTable.withRLS(` back into `pgTable(` for `user`, `session`, `account`, and
`verification`. `rls-guard.test.ts` catches it — which is why that test was
written *before* the auth schema was first generated, not after.

### C6 — `vitest.workspace.ts` is deprecated 🟡

Deprecated in Vitest 3.2. Do not follow older tutorials that create one; this
repo gives each package its own `vitest.config.ts` and lets `turbo` fan the
`test` task out.

### C7 — two versions of zod in the tree 🟢

`node_modules` resolves both `zod@3.x` and `zod@4.x`. Only v4 is declared; v3
arrives transitively (most likely via the `shadcn` CLI).

Harmless today because the two copies never meet — but it becomes real if a v3
schema is ever passed to an oRPC contract expecting v4. oRPC accepts any
Standard Schema implementation, so it will not reject a v3 schema up front; the
mismatch surfaces as a confusing type error. Declare `zod@4` explicitly in
every package that uses it, and import only v4.

### C8 — Next.js 16 changes that still matter 🟢

| Change | Impact here |
|---|---|
| Node.js **24+** required | `engines` pins `>=24`. Below Node 23.6, `@tooling/vitest-config`'s `.ts` export fails to load with `ERR_UNKNOWN_FILE_EXTENSION` — Vitest treats bare-specifier imports in a config file as external and hands them to Node's own loader, which cannot execute `.ts` without native type-stripping. Caught by CI running an older Node than any contributor's dev machine had. |
| Turbopack is the default for `dev` and `build` | no `--turbopack` flag needed; a custom webpack config would now **fail the build** |
| `middleware.ts` → `proxy.ts` | relevant if session checks are ever put in middleware |
| Async request APIs enforced, not warned | `await headers()`, `await params`, `await cookies()` |
| `next lint` removed | `apps/web` uses the ESLint CLI directly |

### C9 — two things the adapter docs are easy to under-read 🟢

- The oRPC Next.js adapter exports **six** methods from the route handler, not
  two: `HEAD`, `GET`, `POST`, `PUT`, `PATCH`, `DELETE`.
- Supabase's transaction-mode pooler does not support prepared statements. The
  client must be created with `prepare: false`. Skipping this produces
  intermittent runtime errors that are very hard to attribute.

### C10 — Better Auth declares `drizzle-orm: ^0.45.2` as a peer 🟡

Which excludes `1.0.0-rc.4`, producing an unmet-peer warning. Static inspection
of the adapter's `dist/index.mjs` shows what it actually uses: `db.select`,
`db.transaction`, `db.update`, `db.delete`, `db.insert` — all present in v1 —
plus nine `db.query.*` (RQBv1) calls that v1 removed. **Every one of those sits
behind `if (options.experimental?.joins)`.**

**🚫 Never set `experimental: { joins: true }`.** It is the only Better Auth
option that would break on Drizzle v1. The peer range is stale metadata, not a
code constraint; it is silenced in `pnpm-workspace.yaml` (see C11).

### C11 — pnpm 10 no longer reads the `pnpm` field in `package.json` 🟡

`peerDependencyRules` under a `"pnpm"` key is silently ignored:

```
[WARN] The "pnpm" field in package.json is no longer read by pnpm.
```

These settings live in `pnpm-workspace.yaml` now, alongside `allowBuilds`. Most
tutorials still show the old location.

### C12 — the Better Auth CLI moved packages 🟡

`@better-auth/cli` is stuck at 1.4.21 while the library is at 1.6.x. The current
CLI ships as the plain **`auth`** package, which is why the docs write
`npx auth@latest generate` rather than naming a `@better-auth/*` package.

### C13 — the schema generator refuses a file containing `server-only` 🟡

> Please remove import 'server-only' from your auth config file temporarily.

Removing and restoring the import around every regeneration is exactly the kind
of manual step that gets skipped. **This is why `packages/auth` is split in
two:** `src/config.ts` holds `betterAuth({...})` with no marker and is what the
CLI reads; `src/server.ts` is `import "server-only"` plus a re-export, and is
the only server path in the `exports` map. `config.ts` is unreachable from
outside the package, so the protection is not weakened.

### C14 — the generated schema uses Drizzle v0's relations API 🟡

`auth generate` emits `import { relations } from "drizzle-orm"`, which v1
replaced with `defineRelations`, so the file does not compile:

```
error TS2724: '"drizzle-orm"' has no exported member named 'relations'.
```

Delete the `relations(...)` exports after generating. Nothing here uses
relational queries — the adapter only reaches for them behind the flag C10
forbids — so they are dead weight rather than a lost feature.

### C15 — drizzle-kit misreads package-alias imports under `src/schema/` 🟡

Re-exporting a sibling as `export * from "@packages/db/schema/auth"`
type-checks, but drizzle-kit's loader treats the alias as a path prefix:

```
Error  Cannot find module '.../packages/db/src/schema/index.ts/auth'
```

**Rule: files inside `src/schema/` import their siblings relatively (`./auth`),
never through the package alias.** `drizzle.config.ts` follows the same rule for
consistency. Cross-package imports keep using the alias normally.

The folder layout has changed twice since this was found, so the precise
condition that triggers it may no longer hold. Relative imports are correct
either way and cost nothing — do not go looking for the boundary by hand.

### C16 — `server-only` throws when Vitest imports it 🟡

`packages/api`'s tests import `@packages/auth/server`, which carries the marker.
The marker resolves to a module whose only statement is `throw`, unless the
`react-server` condition is set:

```
Error: This module cannot be imported from a Client Component module.
```

Vitest hands `node_modules` to Node directly, so `resolve.conditions` alone does
not change it. The fix is `ssr.resolve.conditions: ["react-server"]` plus
inlining `server-only`, both in that package's `vitest.config.ts`. This is a
statement of fact rather than a workaround — the suite genuinely runs on the
server side of that boundary.

### C17 — oRPC error messages are humanised, codes are not 🟢

`throw errors.NOT_FOUND()` produces an error whose `message` is `"Not Found"`,
not `"NOT_FOUND"`, so `rejects.toThrow("NOT_FOUND")` fails against correct
behaviour. Assert on `code`. The code is the contract; the message is
presentation.

### C18 — `@orpc/zod` reads Zod 3 unless you import `/zod4` 🟡

The package root exports a `ZodToJsonSchemaConverter` that understands Zod 3.
Point it at Zod 4 schemas and it does not error — it produces **empty**
schemas, so the generated spec documents endpoints with no fields.

Import from `@orpc/zod/zod4`. On that path the query-string coercion plugin is
still named `experimental_ZodSmartCoercionPlugin`; the unprefixed name exists
only on the root. Without it, `?limit=20` arrives as the string `"20"` and fails
the contract's `z.number()`.

---

## S12. Sources

Official documentation consulted while building this, on 2026-08-13:

- oRPC — [Next.js adapter](https://orpc.dev/docs/adapters/next), [contract-first](https://orpc.dev/docs/contract-first/define-contract), [implement contract](https://orpc.dev/docs/contract-first/implement-contract), [TanStack Query](https://orpc.dev/docs/integrations/tanstack-query), [SSR optimisation](https://orpc.dev/docs/best-practices/optimize-ssr), [errors](https://orpc.dev/docs/error-handling), [client errors](https://orpc.dev/docs/client/error-handling)
- Drizzle — [RLS](https://orm.drizzle.team/docs/rls), [Supabase](https://orm.drizzle.team/docs/connect-supabase), [PGlite](https://orm.drizzle.team/docs/connect-pglite), [v0 → v1 changes](https://orm.drizzle.team/docs/v0-v1-changes)
- Better Auth — [installation](https://www.better-auth.com/docs/installation), [Drizzle adapter](https://www.better-auth.com/docs/adapters/drizzle), [Next.js](https://www.better-auth.com/docs/integrations/next), [CLI](https://www.better-auth.com/docs/concepts/cli)
- Vitest — [projects](https://vitest.dev/guide/projects)
- t3-env — [core](https://env.t3.gg/docs/core)
- Next.js 16 — `apps/web/node_modules/next/dist/docs/01-app/02-guides/upgrading/version-16.md` (local, version-matched)

---

## S17. Deployment

Four decisions that a fork will otherwise make again from scratch. The steps
themselves are in [`deploy.md`](deploy.md); this is only why they are shaped
that way.

**A preview deployment gets a database of its own.** The alternative — one
shared preview database — costs nothing and works until two pull requests
disagree about the schema, which is exactly when a preview is worth having. It
also means every pull request exercises the migrations from empty, so a
migration that only works against a database that already exists fails on the
pull request rather than on production. Supabase Branching supplies this; the
cost is a Pro plan and per-branch-hour billing, bounded by the branch limit.

**Migrations run in the deployment's build, not in a GitHub Action.** The
obvious route is a workflow that asks Supabase's Management API for the branch's
credentials. That API reports the direct connection, which is IPv6-only on
Supabase, and GitHub-hosted runners have no IPv6 — reaching the pooler instead
means rebuilding its hostname from a pattern nobody promises to keep. The build
already holds what the workflow would go and fetch: `POSTGRES_URL`, pooled and
scoped to that branch. So `apps/web/vercel.json` puts `db:deploy` in front of
the build command, and no token, workflow or third-party action is involved.

It also has to not run too early. Vercel starts a build the moment a pull
request opens, which is before Supabase has written anything, and
`next.config.ts` validates its environment at build time — so that build failed
every time, over a variable that was about to appear. `ignoreCommand` skips it
instead, on the one condition that can only describe that moment: a preview
with neither `POSTGRES_URL` nor `DATABASE_URL` set. Production is excluded by
the same condition rather than by a separate rule, which matters, because a
production deployment missing its database must still fail loudly — that is
what validating at build time is for. Making the validation lazy would have
"fixed" the red build by moving the failure to a request.

What that trades away is a warning. A red build was, accidentally, how a broken
Supabase integration would have announced itself; now the pull request would
just quietly never get a preview. The `Supabase Preview` check is the honest
place for that signal and reports it whether or not the build is skipped, so
the trade is a signal moving rather than disappearing — but it moves, and
anyone debugging a missing preview needs to know where it went.

It retries three times, fifteen seconds apart, and no longer. Supabase writes
the connection string and asks for a build in the same breath, so a first
connection can arrive before the far end is listening, and half a minute
covers that. The temptation is to wait much longer, because the failure that
prompted the retry looks like impatience — `28P01`, the database refusing the
credentials it was just given. It is not. One branch refused them for half an
hour, from the build and from a laptop alike, while the database was up and
serving; Supabase had written a password its own database did not hold. No
wait fixes that, and a new pull request does, so a long wait buys nothing but
a slower red build. What the retry is really for is the log line naming the
error code, which is what distinguishes the two cases at a glance.

`db:deploy` refuses to touch anything but a preview. A preview database is
discarded with its pull request; production holds data a bad migration cannot
un-break, and migrating it automatically is a decision about ordering and
rollback that should be made deliberately rather than inherited from wanting
working previews.

**`DATABASE_URL` stays the primary name, with `POSTGRES_URL` as a fallback.**
Renaming everything to `POSTGRES_URL` would be simpler — one name, no fallback,
and production would not need the variable set by hand, because the Supabase
integration already supplies it. That last part is the reason not to.
`DATABASE_URL` is the name the ecosystem uses and the one a fork deploying
somewhere else will need; more concretely, a production that depends on a value
an integration syncs cannot have that integration switched off, and switching it
off is what removes a service-role key that bypasses RLS and that nothing here
reads.

**The origin allowlist is read from the platform, not configured.** Better Auth
derives its trusted origins from `baseURL`, and a preview deployment answers to
two hostnames that both change on their own. A pattern written into a settings
page is wrong twice over: it does not match (the deployment URL drops the
project suffix, and both end in an account-specific hash), and a fork would
inherit the original account's pattern. `VERCEL_URL` and `VERCEL_BRANCH_URL` are
stamped onto the deployment by the platform, so unlike a `Host` header a caller
cannot choose what they say — which is what `packages/auth/src/env.ts` insists
on. `BETTER_AUTH_ALLOWED_HOSTS` remains for hosts the platform cannot report.

---
---

# Appendices — delete these in a real project

Everything past this line is about *this repo being a template*, not about the
stack. Nothing above cites any of it except by name, and no numbering shifts
when it goes, so each appendix can be removed on its own.

## S13. Why this repo is a template

A base template that lets multiple projects start quickly on the same stack and
conventions.

Two more principles apply while that is true, on top of the three at the top of
this file:

| Principle | What it means in practice |
|---|---|
| **No business logic** | Structure and conventions only, with one deliberate exception — see below. |
| **Lean** | Nothing is included until it is needed. Everything omitted can be added later without a rewrite. |

**The exception is the `report` domain.** Every project forked from here needs
a way for the people using it to say something is wrong, so that one feature is
built in rather than left to each fork to rediscover. Unlike `post` it is not
an example and is not on the list of things to delete: a fork keeps it, and
extends it. What it deliberately does not carry is anything that would drag a
dependency in with it — no attachments, no outbox, no rate limiting — each of
which is described where it is missing.

These two are under constant pressure here, because every dependency added is
inherited by every project started from this one and those get no update path
(see S15), so a bad addition is permanent. **A
real project built on this stack should add the business logic and the
dependencies it needs** — only the three principles at the top survive the
fork.

### Turning this repo into a real project

Beyond the setup every deployment needs, a fork has to strip the
template out of itself. Leaving it in means every future session is told to
keep a real product "lean" and free of business logic.

1. **Rename.** `base-template` is the project's own name in six places, three
   of which a user can see:

   | File | What it is |
   |---|---|
   | `package.json` | the workspace root's `name` |
   | `README.md` | the heading |
   | this file, S2 | the tree diagram |
   | `apps/web/app/layout.tsx` | **the browser tab title**, and the `%s · …` template every route inherits |
   | `apps/web/app/api/spec/route.ts` | **the title in the published OpenAPI document** |
   | `apps/web/app/api/docs/route.ts` | **the tab title at `/api/docs`** |

   The version in `api/spec/route.ts` is hard-coded separately from
   `package.json`; set it or wire the two together.
2. **Rewrite `apps/web/app/page.tsx`.** It is a placeholder that describes the
   template and links to the example domain.
3. **Delete every appendix in this file**, including this one.
4. **Delete the "While this repo is still the template" section of
   `CLAUDE.md`.**
5. **Rewrite `README.md`** for the project.
6. **Delete the example domain** when a real one replaces it — see S14.

Everything else in `CLAUDE.md` and all of `.claude/rules/` applies unchanged;
they describe the stack, not the template.

## S14. The example domain

The template ships a `post` domain wired through every layer (contract → db →
api → web) as a pattern to copy.

**Why keep a live example instead of only documenting the pattern:** the example
is checked by `tsc` and Vitest on every run, so when oRPC or Drizzle changes an
API it goes red. Prose documentation and generator templates keep describing the
old way with nothing to catch them.

`.claude/rules/packages-conventions.md` has the six-step checklist for adding
the domain that replaces it.

### Deleting it

Delete these paths:

```
packages/contract/src/domains/post/
packages/db/src/schema/post.ts
packages/api/src/domains/post/
apps/web/app/posts/
apps/web/features/post/
```

`apps/web/app/signin/`, `apps/web/app/signup/` and `apps/web/features/auth/`
**stay.** They are real sign-in and sign-up pages wired to Better Auth, not
scaffolding for the example — every project needs them. The one thing to
change is where they send someone who did not ask for anywhere in particular:
`DEFAULT_DESTINATION` in `features/auth/redirect.ts` holds `/posts`, which is
about to stop existing.

`packages/api/src/testing/index.ts` **stays** — `signUpTestUser`, `contextFor`,
and `anonymousContext` belong to no domain, and every real domain's router
tests need them.

Then edit what still refers to the deleted domain. `tsc` catches the first
four; the rest are comments, links and a pinned list, which it does not:

| File | Change |
|---|---|
| `packages/contract/src/index.ts` | drop the `post` schema re-exports and the `post:` entry |
| `packages/api/src/index.ts` | drop `post: postRouter` |
| `packages/db/src/schema/index.ts` | drop `export * from "./post"` |
| `packages/db/src/schema/rls-guard.test.ts` | remove `"post"` from the pinned table list |
| `apps/web/app/page.tsx` | replace the placeholder landing page |
| `apps/web/features/auth/redirect.ts` | `DEFAULT_DESTINATION` — send them somewhere that exists |
| `apps/web/lib/orpc-query.ts` | comments use `orpc.post.*` as examples |
| `apps/web/lib/orpc.server.ts` | comment uses `client.post.list()` |
| `packages/api/src/testing/index.ts` | comment refers to `post` |

`DEFAULT_DESTINATION` is the one to watch: nothing fails when it is missed. It
compiles whatever it holds, sign-in still succeeds, and the person lands on a
404 a second later.

Finally, the **migrations**: `packages/db/drizzle/` already contains a
`CREATE TABLE "post"`. Deleting the schema file does not undo it. For a project
with no data yet, delete both migration folders and run
`pnpm --filter @packages/db db:generate` once to produce a single initial
migration from the schema that is left. For one that has already deployed,
generate a normal drop migration instead.

`pnpm verify` green means the deletion is complete.

## S15. Consuming the template

Use GitHub's **"Use this template"** button.

**Accepted limitation:** projects created this way do not receive later template
updates, since the git histories are unrelated. Propagating an improvement means
copying files manually.

That is a further reason to keep the template **small and stable**, and the
reason C1 weighs "unmaintained but stable" so heavily against "release
candidate".

## S16. Decisions already settled

Recorded so they are not reopened by accident:

- **The quality gate** is `pnpm verify` plus a `Stop` hook
  (`.claude/settings.json`), so a session cannot end on a broken tree.
- **Tests receive a database rather than importing one** (boundary 4). The
  alternative — fabricating sessions — would have covered every ownership check
  but not `requireAuth` itself, nor any auth rule a project adds later (blocked
  email domains, lockout, a profile row created on signup). A template should
  not hand its users a corner they have to refactor out of.
- **`user` fields belong either to Better Auth or to the project, never both**
  (see S4).
- **Drizzle stays on its pinned release candidate** until v1 GA (C1). When GA
  lands, C1 and the `peerDependencyRules` entry in `pnpm-workspace.yaml` are
  the two places to revisit.
- **`README.md` is written for a human arriving from GitHub** — what the stack
  is, and the path from clone to running app. `CLAUDE.md` is the agent-facing
  equivalent and they are allowed to overlap; the README is not a redirect.
- **Sections carry stable `S` ids, assigned once and never reordered.** Two
  earlier attempts failed. Plain ordinals (`§1`, `§2`) read well but renumbered
  every time a section moved, and the references that broke were in source
  comments, where no tooling notices — one renumbering silently invalidated six
  of them. Citing by quoted title survived that, but a citation then had to
  carry a whole phrase, and long titles read badly in a one-line comment. An
  `S` id is short enough to cite and stable enough to trust, which is what
  `C1`…`C18` had been doing correctly all along. The cost is that ids drift out
  of reading order as sections are added; that is the price of never rotting.
- **Where agent-facing rules live.** Three surfaces that do not overlap:

  | | Holds | Loaded |
  |---|---|---|
  | `CLAUDE.md` | What is true everywhere — purpose, commands, the package graph, the enforced boundaries, framework versions that differ from training data | every session |
  | `.claude/rules/*.md` | What is true in one surface, scoped by `paths:` frontmatter — one file each for `apps/web`, all packages, `api`, `db`, `contract`, and tests | when work touches the matching directory |
  | Code comments | Why *this line* is the way it is | when the file is read |

  A rule that only makes sense next to the code it constrains stays a comment;
  moving it into a rule file would strip the reasoning from the place it
  applies. There is no `AGENTS.md` — Claude Code reads `CLAUDE.md`, and this
  repo is Claude-Code-first in practice already.
