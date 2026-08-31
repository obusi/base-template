---
paths:
  - "packages/shared/**/*"
---

# packages/shared

Everything `apps/web` and `packages/api` must agree on, and nothing either of
them could keep to itself. `packages/api` implements the contract in here,
`apps/web` calls it, and a future Expo app imports this package and only this.

```
src/
├── index.ts                    public entry — everything below, by name
├── contract/
│   ├── domains/<x>/
│   │   ├── schema.ts             zod schemas — the shape
│   │   └── contract.ts           procedures — input, output, errors, route
│   └── errors.ts                 codes every domain reuses
├── features/                   feature flag names and the env parser
└── dependencies.test.ts        the boundary, checked
```

## What may live here

The package was called `contract` until it held more than one, and a name that
lists one of its contents ages badly. What replaced it is broader on purpose,
so the rule for admission is written down rather than implied by the name:

1. **Both sides need it.** Something only `apps/web` uses belongs in
   `apps/web`; something only `packages/api` uses belongs there. This package
   is for what would otherwise be written twice and drift.
2. **It runs anywhere.** No DOM, no `node:` API a bundler cannot follow, no
   database. The dependency rule below is what enforces this, and it is checked.

A helper that satisfies both is welcome. One that satisfies only the first is a
sign the logic belongs to one side and is being shared out of convenience.

`parseFeatures` in `features/` is the first thing in here that runs rather than
declares, and it passes both tests: the environment says which flags are on,
and `apps/web` and `packages/api` have to read that string the same way or the
same deployment answers differently at the two ends.

## The dependency boundary is the reason this package exists

**`dependencies` may contain `@orpc/contract` and `zod`. Nothing else. Ever.**

`dependencies.test.ts` reads this package's own `package.json` and fails on
anything more. Do not relax it, and do not add a dependency expecting to "fix
the test after" — the test *is* the rule.

This is the boundary a React Native bundler rests on, and the failure mode it
prevents is slow: a single `import { db } from "@packages/db"` here compiles,
passes review, and is discovered months later when a mobile build tries to
bundle Drizzle.

### Why the schemas are not derived from Drizzle

This comes up regularly, and the answer is no. A domain's zod schemas here and
its Drizzle table in `packages/db/src/schema/` are both hand-written, and they
describe the same shape in two places on purpose.

Deriving one from the other — `drizzle-zod`, or importing the table here —
pulls `drizzle-orm` into this package's dependency graph and breaks the rule
above. A single source of truth for field shapes is worth less than the
portability that the whole five-package split was arranged to protect.

If the duplication needs a guard, the check belongs in `packages/db` (the side
allowed to depend on both) or in a codegen step that emits plain zod with no
drizzle import, mirroring how `auth:generate` writes into `packages/db`. Never
by making this package import that one.

## Relative imports only

```ts
import { commonErrors } from "../../errors"                   // ✅
import { commonErrors } from "@packages/shared/contract/errors" // ❌
```

Metro's handling of `exports` maps and self-referencing imports has produced
enough bundler bugs to be worth never testing, and nothing in this package is
harder to read for being relative.

## `schema.ts` holds shapes; `contract.ts` holds procedures

Input and output schemas are **written out separately, not derived from each
other with `.pick()`**:

```ts
export const PostSchema = z.object({ title: z.string(), ... })

// Input needs limits that output does not. `title: z.string()` is the right
// output type and the wrong input validation.
export const CreatePostInput = z.object({
  title: z.string().min(1).max(200),
  content: z.string().min(1).max(10_000),
})
```

`.pick()` is fine where the shapes genuinely coincide — `PostIdInput` is
`PostSchema.pick({ id: true })` — but reach for it because the shapes match,
not to save typing.

**Zod 4 only**, and `@orpc/zod/zod4` for the converter. Mixing in a v3 schema
produces type errors that read as unrelated. See `docs/architecture.md` S10
(C7, C18).

## Every procedure declares `.output()`

Not optional. It is what stops a handler that returns a row carrying
`passwordHash` from compiling, and it is what keeps `packages/api` honest as
the contract changes.

Errors are declared the same way, by spreading the shared codes alongside the
procedure's own:

```ts
create: oc
  .route({ method: "POST", path: "/posts" })
  .input(CreatePostInput)
  .output(PostSchema)
  .errors({
    ...commonErrors,
    QUOTA_EXCEEDED: { data: z.object({ limit: z.number().int() }) },
  })
```

Declare an error only if the client can *do* something about it — that is the
test, not how serious it is. Attach the data the UI needs, so it never
hard-codes a number the server owns. Whatever is not declared becomes
`INTERNAL_SERVER_ERROR`, is logged, and shows as "something went wrong".

`NOT_FOUND` deliberately covers both "no such row" and "not yours"; see
`shared/errors.ts` for why splitting them leaks which ids exist.

## `.route()` is for the REST door only

`/rpc` addresses procedures by their position in the contract object and
ignores `.route()` entirely, so adding or changing a route costs existing
callers nothing. It is read by the OpenAPI handler serving `/api/v1` and by the
generated spec at `/api/spec`.

Conventions the example follows: plural collection paths (`/posts`), `{id}` for
the member, `PATCH` rather than `PUT` when the update input is partial, and a
delete that returns the id so the client can drop the row from its cache.

## `index.ts` exports by name

```ts
export { CreatePostInput, UpdatePostInput, type Post } from "./domains/post/schema"
```

Never `export *`. Schemas are re-exported here so browser forms can build on
the same ones the server validates with — `CreatePostInput.extend({ ... })`
rather than a second declaration that drifts — and the named list keeps that
surface to what something outside the package actually imports today.
