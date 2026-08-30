---
paths:
  - "**/*.test.ts"
  - "**/vitest.config.ts"
  - "tooling/vitest-config/**/*"
---

# Testing

Vitest, node environment, `*.test.ts` sitting **beside the code it covers** —
no `__tests__/` or `test/` folder. `passWithNoTests` is on, so a package with
nothing to test stays green, including after the example domain is deleted.

## Four levels, and the shape of the pyramid

| Level | Covers | Volume |
|---|---|---|
| Unit | Pure functions with no external dependencies | few |
| **Integration** | A full oRPC handler: zod → middleware → Drizzle → real Postgres | **the bulk** |
| Structural | Rules no runtime check notices — every table has RLS, `contract` depends on nothing else | one per rule |
| Deployment | Whether *this* database matches the design's assumptions (`db:check`) | by hand, once per project |

Nearly all logic lives in handlers that talk to the database, so **a test that
mocks the database verifies almost nothing.** Do not reach for a mock or a fake
repository here; get a real database instead — it costs about 1.4 seconds.

**One exception, and it is the only one: object storage.** `fakeStorage`, from
`@packages/storage/testing`, stands in for Supabase, because that is an HTTP
service on somebody else's machine rather than a database that compiles to
WASM. The rule above is not weakened by it — what the report tests check is
still this repo's own logic (which paths are minted, whose prefix they carry,
that a URL is signed per attachment), and all of it is visible through the two
functions `Storage` declares. Anything reachable with a real Postgres still
gets a real Postgres.

## The database lifecycle, exactly

```ts
let db: TestDb

beforeAll(async () => {
  db = await createTestDb()      // ~1.4s — once per FILE
})

beforeEach(async () => {
  await resetDb(db)              // ~40ms — between tests
  alice = await signUpTestUser(db, "alice@example.com")
})
```

`createTestDb()` boots a real Postgres compiled to WASM; it is not cached, and
calling it per test instead of per file took a three-test suite from 1.7s to
4.8s. Vitest runs files in parallel, so the boot cost is paid once per file,
concurrently.

**`beforeEach`, not `afterEach`.** `resetDb` is itself code that can fail, and a
cleanup that only runs after the test never gets to be the thing that goes red.

`resetDb` drops every table **and re-applies the migrations** — dropping alone
would let schema assertions pass against an empty database. It also drops the
`drizzle` schema, because the ledger of applied migrations lives there and
leaving it behind makes the re-run a silent no-op.

Setting `TEST_DATABASE_URL` points the same suite at a real Postgres with no
test changes. That seam exists so CI can be added as configuration later; do
not write anything that assumes PGlite specifically.

## Sessions are real, never fabricated

```ts
const alice = await signUpTestUser(db, "alice@example.com")   // ✅ real signUpEmail
const as = (user) => createRouterClient(router, { context: () => contextFor(db, user) })

const ctx = { user: { id: "abc" } }                           // ❌
```

`signUpTestUser` runs Better Auth's actual `signUpEmail` and keeps the session
cookie, so the request goes through `requireAuth` the way a browser's would.
Fabricating `{ user: { id } }` still exercises ownership checks, but it skips
the one piece of glue this repo owns — turning a cookie into a user — and that
seam is exactly where "signed in but treated as anonymous" bugs live.

The helpers are in `packages/api/src/testing/`: `signUpTestUser`,
`contextFor(db, user)`, `anonymousContext(db)`. They belong to no domain in
particular — every domain's router tests use the same three.

## Assert on `code`, never on a message

```ts
await expect(promise).rejects.toMatchObject({ code: "NOT_FOUND" })   // ✅
await expect(promise).rejects.toThrow("Not Found")                   // ❌
```

The code is what the contract declares and what client code branches on. The
message is a humanised default that oRPC is free to reword.

Every handler that carries `requireAuth` gets a test proving an anonymous
caller is rejected, and every ownership rule gets a test where one user tries
to touch another's row and receives `NOT_FOUND`.

## Every guard needs a companion that proves it can fail

A check that cannot go red is indistinguishable from one that is not running,
and both have shipped here — an RLS guard that sat green because the schema it
checked was empty, and a `db:check` probe that would have reported success
against a table with no rows in it.

So a structural test comes in pairs: the rule, plus something that fails if the
rule's own machinery breaks.

```ts
it("are limited to what a React Native bundler can follow", () => {
  expect(runtimeDependencies("../../package.json")).toEqual(ALLOWED)
})

// Without this, a runtimeDependencies() that silently returned [] would make
// the check above pass on any package at all.
it("are actually read from the file", () => {
  expect(runtimeDependencies("../../../db/package.json")).toContain("drizzle-orm")
})
```

`rls-guard.test.ts` does the same thing twice over. Its companion creates a
table that deliberately skips RLS and asserts the check reports it — proof the
check can go red. Separately, a `migrations` block pins the exact list of table
names, because "every table has RLS" is also true of a database with no tables,
and a migration that silently failed to apply would otherwise leave the suite
green.

**That pinned list means adding a table is meant to fail the suite.** Update it
in the same commit that adds the table, so the diff records the schema change
instead of hiding it.

## What `apps/web` tests, and what it does not

The app has a suite, and it is deliberately small. Everything with business
meaning is already covered where it lives: handlers in `packages/api` against a
real database, and the codes those handlers and Better Auth answer with in
`packages/auth/src/config.test.ts`. What is left in `apps/web` is markup and
wiring.

So the rule here is the same one as everywhere else, pointed at React: **a test
that mocks `authClient`, `orpc` and `next/navigation` in order to render a form
verifies almost nothing.** What survives the mocking is react-hook-form and
zod, which are not this repo's code. Do not add React Testing Library or switch
the environment to jsdom for it.

What does belong: pure logic with no React in it. `features/auth/redirect.ts`
is the example — an open-redirect guard, testable by calling it, and worth
testing because getting it wrong hands a signed-in browser to another site.

The flows themselves — sign up, land on the right page, create a post — are the
honest job of an end-to-end runner. There is none here on purpose: Playwright's
browser binaries would be inherited by every project forked from this template,
and adding it later to one project is easy where removing it from all of them
is not.

## Config

Each package's `vitest.config.ts` re-exports `@tooling/vitest-config/base`.
Two extend it, and each file says why:

- **`packages/api`** — the `react-server` condition (so `@packages/auth/server`'s
  `server-only` marker resolves), inlining `server-only` so Node honours that
  condition, and placeholder env values.
- **`packages/auth`** — the same placeholder env, and nothing else. Its tests
  import `./config` directly, and that file is deliberately free of the
  `server-only` marker, so none of the condition work applies.

The env values are deliberately unreachable: a test that accidentally reached
the production auth instance should fail loudly on the host, not quietly
connect to something.

Copy either pattern only if a new package hits the same problem. The default is
the bare re-export, which is what `apps/web`, `packages/db` and `packages/ui`
use.
