---
paths:
  - "packages/storage/**/*"
---

# packages/storage

Object storage as a two-method port and one implementation of it. The smallest
package in the repo, and the only one that exists for a reason that is not a
dependency cycle.

```
packages/storage/src/
├── index.ts          the `Storage` type, createSupabaseStorage, storageFromEnv
├── env.ts            SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY, and nothing else
└── testing/index.ts  fakeStorage — exported as @packages/storage/testing
```

## Why it is a package: `@supabase/storage-js` is declared here and nowhere else

This code compiled perfectly well inside `packages/api`, and lived there until
it did not. What the split buys is enforcement rather than a cycle: pnpm's
strict layout makes the Supabase client **unresolvable from `packages/api`**, so
"the API layer does not know which provider it is talking to" is a build failure
rather than something a reviewer has to notice.

```bash
ls packages/api/node_modules | grep supabase     # nothing
ls packages/storage/node_modules | grep supabase # @supabase
```

**So never add `@supabase/storage-js` — or any other provider SDK — to another
package's `package.json`.** Doing that dissolves the only thing this package is
for. A second provider is a second function in `index.ts` behind the same
`Storage` type, and nothing outside changes.

## Nothing here names a domain

No identifier here names a domain — no `reportStorage`, no
`REPORT_BUCKET`, no branch on which bucket it is. (Two comments use the word
"report" to describe the example caller; that is the limit.)
`storageFromEnv(config, bucket)` takes the bucket as an argument precisely so
that a second domain costs a line in `packages/api/src/connection/live.ts`
rather than a function here.

The bucket name lives beside the domain that owns the bucket —
`REPORT_BUCKET` in `packages/api/src/domains/report/service.ts`, a constant
rather than an environment variable because `supabase/config.toml` is what
actually creates the bucket. `packages-conventions.md` has the checklist for
adding a second one; it touches four files and none of them is in here.

`env.ts` follows the same rule: it holds how to reach the Supabase project,
which is the same for every bucket the project will ever have, and nothing about
what is kept there.

## The port is two methods, and widening it is expensive

```ts
export type Storage = {
  createUploadUrl(path: string): Promise<UploadTarget>
  createDownloadUrl(path: string): Promise<string>
}
```

Every method added here has to be implemented by the real client **and** by
`fakeStorage`, and every handler that holds a `Storage | null` gains something
new it could reach for. Two methods is what lets `apps/web` upload straight to
Supabase while the browser holds no key of any kind. Before adding a third, check
whether the caller can do it with a signed URL instead.

`storageFromEnv` returns `null` when the environment describes no project.
`null` is a normal state, not a broken one — see `packages-api.md`.

## `fakeStorage` lives here, beside the interface it fakes

Exported as `@packages/storage/testing`, the same shape as
`@packages/db/testing`, and imported by `packages/api`'s own test helpers.

It is the one stand-in in the repo, and `testing.md` explains why storage earns
the exception where a database does not. Keep it honest: it records the paths it
was asked to sign, because what the report tests actually check is which paths
are minted and whose prefix they carry.

## This package has no tests of its own

There is no `test` script and no `vitest.config.ts`, which is why
`packages-conventions.md`'s "every package carries one" reads *if it tests*.
Everything here is either a thin wrapper over an HTTP client on somebody else's
machine or the fake itself; the behaviour worth asserting is exercised from
`packages/api`'s report tests. Add a test file here only alongside logic that is
genuinely this package's own.
