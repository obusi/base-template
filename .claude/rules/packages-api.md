---
paths:
  - "packages/api/**/*"
---

# packages/api

The layer that composes the contract, the database, and auth into runnable
procedures. Everything `apps/web` can reach in the database, it reaches through
here.

```
src/
├── index.ts              public entry — composes the router
├── domains/<x>/
│   ├── router.ts           oRPC surface: context, errors, middleware
│   ├── service.ts          the actual logic — knows nothing about oRPC
│   └── router.test.ts
├── shared/
│   ├── context.ts          ApiContext — what a handler receives
│   └── builder.ts          os = implement(contract).$context<ApiContext>()
├── middleware/auth.ts    requireAuth, requireAdmin
├── storage/index.ts      the Storage port + its Supabase implementation
├── env.ts                the storage switch, validated
├── connection/
│   ├── live.ts             the real context, for production requests
│   └── seed.ts             two development accounts, re-exported through live
└── testing/index.ts      the throwaway context, for tests
```

## `router.ts` translates; `service.ts` decides

A router handler should read as a thin adapter: unwrap the oRPC context, call
a service function, turn its result into either a value or a declared error.

```ts
// router.ts
export const byId = os.post.byId.handler(async ({ context, input, errors }) => {
  const row = await service.getPostById(context.db, input.id)

  if (!row) {
    throw errors.NOT_FOUND()
  }

  return row
})
```

Service functions take a `Database` and plain arguments — nothing oRPC-shaped,
nothing contract-shaped — so another domain's service can call them directly
without dragging oRPC along. That property is the whole point of the split, and
it is easy to destroy by accident:

- **Never import `errors`, `ORPCError`, or anything from `@orpc/*` into a
  service.** "Not found" is a plain `undefined` that the router turns into
  `NOT_FOUND()`.
- **When a failure needs to carry data**, return a discriminated result rather
  than throwing. `createPost` returns `{ ok: false, limit }` and the router
  raises `QUOTA_EXCEEDED({ data: { limit } })` from it — throwing an oRPC error
  in the service would leak the one dependency the file is avoiding.

A domain small enough that its handler is two lines still gets a `service.ts`.
The consistency is worth more than the saved file, and the alternative is a
judgement call at every new domain.

## Authentication is `requireAuth`, and only `requireAuth`

```ts
export const create = os.post.create
  .use(requireAuth)
  .handler(async ({ context, input, errors }) => { ... })
```

Procedures carrying the middleware can read `context.user`; procedures without
it have no `context.user` to read, so forgetting it is a type error rather than
an open door. Do not read the session directly in a handler, and do not add a
second path that decides whether a request is authenticated.

`requireAdmin` is not a second path. It is `requireAuth.concat(...)` — the same
session lookup followed by a role check — so `.use(requireAdmin)` on its own
both authenticates and authorizes, and stacking it on `requireAuth` would be
redundant:

```ts
export const list = os.report.list
  .use(requireAdmin)
  .handler(({ context, input }) => service.listReports(context.db, input))
```

Reach for it only where ownership cannot be written as a `where` clause. Today
that is `report.list`, which is not scoped to the caller at all. A handler that
reads the caller's own rows still filters in the query — see the next section.

## Authorization is a `where` clause, never a read-then-check

```ts
// ✅ ownership is part of the query
await db
  .update(post)
  .set(changes)
  .where(and(eq(post.id, id), eq(post.authorId, authorId)))
  .returning()

// ❌ two statements — the row can change owner between them
const row = await db.select()...
if (row.authorId !== authorId) throw errors.FORBIDDEN()
```

Beyond the race, the second form scatters the rule: a reader has to find both
statements to know what the endpoint allows. Every query that touches
user-owned rows filters explicitly, in the query.

**A miss returns `NOT_FOUND`, not `FORBIDDEN`.** "No such post" and "not yours"
are deliberately indistinguishable — answering them differently turns the
endpoint into a way to discover which ids exist. `FORBIDDEN` is declared in
`commonErrors` for the case where there is no id to leak in the first place —
`requireAdmin` raising it on `report.list` is the one use in this repo.

## Errors: declared means the caller can act on it

The test is not how serious the failure is, it is whether the client can do
anything about it. A missing row is expected and actionable; a dropped
connection is neither. Anything a handler throws that the contract does not
declare becomes `INTERNAL_SERVER_ERROR`, gets logged, and the user sees
"something went wrong".

So a new error code means editing `packages/contract` first — declaring it on
the procedure, with the data the client needs attached. `QUOTA_EXCEEDED`
carries its limit so the UI can say "you can have 50" instead of hard-coding a
number that drifts from the server's.

`ORPCError.data` is transmitted to the client. Never put anything sensitive in
it.

## The context is handed in, never assembled here

`ApiContext` is `{ db, auth, headers, reportStorage }`, and all four are
supplied by the caller. `apps/web` passes the live database, the live auth
instance, the real request headers and storage built from the environment; a
test passes a throwaway PGlite database, an auth instance bound to it, headers
carrying a cookie from a real sign-in, and `fakeStorage()`. Neither handlers nor
middleware can tell the difference, which is why there is no test-only branch
anywhere in this package.

`reportStorage` is `Storage | null`, and `null` is a normal state rather than a
broken one — the same shape as an absent `sendResetPassword`. A deployment with
no bucket configured runs fine; `report.createUploadUrls` answers
`ATTACHMENTS_UNAVAILABLE` and the form hides its file picker. Handlers that
touch attachments check for `null` rather than assuming it.

**A storage field is named after the domain that owns its bucket**, which is
why it is not just `storage`. A bucket is where Supabase keeps the file-size
limit and the MIME allowlist, and a folder inside one cannot carry its own — so
a second domain that stores files gets a second bucket and a second field
beside this one. `storageFromEnv(env, bucket)` takes the bucket as an argument
precisely so that costs a line in `connection/live.ts` rather than a second way
of building storage.

`connection/` is where the real `db` and the real `auth` are named, and the only
place. Both files carry `import "server-only"`, and **nothing inside this
package imports either** — they exist for the process that serves real requests.
They live here rather than in `apps/web` because reaching a database over there
would mean adding `@packages/db` to `apps/web/package.json`, and that omission
is the boundary.

- **`live.ts`** builds the context.
- **`seed.ts`** creates `user@example.com` and `admin@example.com` when the
  database has no rows, and is re-exported through `live.ts` rather than given
  an entry point of its own — the `exports` map lists two paths and
  `surface.test.ts` pins that number. `apps/web/instrumentation.ts` calls it
  behind `NODE_ENV === "development"`, so a preview deployment, which builds as
  production, never creates an account with a published password.

Sign-up runs through Better Auth rather than an `insert`, because the password
has to be hashed the way sign-in will verify it. That is also why this is not a
`scripts/seed.ts` next to `packages/db`'s: bare Node resolves ESM specifiers
without adding extensions, so a standalone script importing
`@packages/auth/server` fails on that package's own `./config` import.

## Two rules about this package's surface

**Never re-export `db` from `index.ts`.** `apps/web` reaches the database only
through a procedure; a convenience re-export quietly reopens the door the
package split exists to close.

**`exports` lists `"."` and `"./connection/live"` — the two paths `apps/web`
actually imports.** `testing/index.ts` is deliberately absent: `packages/api`
tests are the only consumer, and they use a relative import. Contrast
`@packages/db/testing`, which is exported because `packages/api` itself needs
it.
