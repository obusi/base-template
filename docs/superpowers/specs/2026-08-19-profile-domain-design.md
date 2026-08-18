# `profile` domain — design

Status: approved, not yet implemented.

## Purpose

Store project-owned user data (bio, phone) separate from Better Auth's `user`
table, following the boundary in `.claude/rules/packages-db.md`: Better
Auth's schema holds only what authentication needs, and regenerating it
(`auth:generate`) overwrites the file, so nothing else belongs there.

This is the first real domain added to the template. It follows the six-step
pattern in `.claude/rules/packages-conventions.md`, copying `post`'s
structure where it fits and diverging where the two domains differ (`post` is
one-to-many per author; `profile` is one-to-one with `user`).

## Fields

Most basic set only — no preferences, no avatar (already covered by Better
Auth's `user.image`), no name (already `user.name`):

| Field | Type | Required | Unique |
|---|---|---|---|
| `bio` | text | no | no |
| `phone` | text | no | no (a phone can't be used as a login identifier here) |

## 1. Schema — `packages/db/src/schema/profile.ts`

One-to-one with `user`, so `userId` is the primary key directly — no
separate `id` column, no extra index (the primary key already is one):

```ts
import { pgTable, text, timestamp } from "drizzle-orm/pg-core"

import { user } from "./auth"

export const profile = pgTable.withRLS("profile", {
  userId: text("user_id")
    .primaryKey()
    .references(() => user.id, { onDelete: "cascade" }),
  bio: text("bio"),
  phone: text("phone"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at")
    .defaultNow()
    .$onUpdate(() => new Date())
    .notNull(),
})
```

`userId` is `text`, matching `user.id` (Better Auth generates its own ids,
not UUIDs — see `packages-db.md`).

Export from `schema/index.ts`. Add `"profile"` to the pinned table list in
`schema/rls-guard.test.ts`.

## 2. Auth hook — `packages/auth/src/config.ts`

A profile row is created eagerly when a `user` row is created, via Better
Auth's `databaseHooks.user.create.after`. This fires once per new `user` row
regardless of how it was created — email/password and Google both converge
on the same `user` insert before any provider-specific step, so one hook
covers both paths without branching.

```ts
databaseHooks: {
  user: {
    create: {
      after: async (createdUser) => {
        try {
          await database.insert(schema.profile).values({ userId: createdUser.id })
        } catch (err) {
          console.error(`[auth] failed to create profile for user ${createdUser.id}`, err)
        }
      },
    },
  },
},
```

**Why the hook swallows its own errors:** `create.after` is queued to run
after the `user` insert's transaction has already committed (confirmed by
reading `better-auth`'s `with-hooks.mjs` / `@better-auth/core`'s
`transaction.ts` in `node_modules` — the hook queue drains after
`adapter.transaction()` resolves, and an uncaught error there is re-thrown to
the caller). If the profile insert threw, the client would see "sign-up
failed" even though the `user` row is already committed — an orphaned user
with no way to retry, since a second sign-up attempt with the same email
just fails with "already exists." Catching and logging instead means a
transient failure here never blocks sign-up; the read-side fallback below
repairs the gap.

## 3. Contract — `packages/contract/src/domains/profile/`

`schema.ts`:

```ts
import { z } from "zod"

export const ProfileSchema = z.object({
  userId: z.string(),
  bio: z.string().nullable(),
  phone: z.string().nullable(),
  createdAt: z.date(),
  updatedAt: z.date(),
})

export type Profile = z.infer<typeof ProfileSchema>

export const UpdateProfileInput = z.object({
  bio: z.string().max(500).nullable().optional(),
  phone: z.string().max(30).nullable().optional(),
})
```

`contract.ts`:

```ts
import { oc } from "@orpc/contract"

import { commonErrors } from "../../shared/errors"
import { ProfileSchema, UpdateProfileInput } from "./schema"

export const profileContract = {
  me: oc
    .route({ method: "GET", path: "/profile/me" })
    .output(ProfileSchema)
    .errors(commonErrors),

  update: oc
    .route({ method: "PATCH", path: "/profile/me" })
    .input(UpdateProfileInput)
    .output(ProfileSchema)
    .errors(commonErrors),
}
```

No `NOT_FOUND`: unlike `post`, there is no "no such row" case for a caller's
own profile — the service always produces one (see below). `commonErrors` is
still spread per convention; `UNAUTHORIZED` is the one that actually fires,
from `requireAuth`.

Register in `packages/contract/src/index.ts` alongside `post`.

## 4. API — `packages/api/src/domains/profile/`

`service.ts` — the read-side fallback that repairs a missing row (hook
failure, or a user that existed before this domain was added):

```ts
export async function getOrCreateProfile(db: Database, userId: string): Promise<Profile> {
  const [existing] = await db
    .select()
    .from(profile)
    .where(eq(profile.userId, userId))
    .limit(1)

  if (existing) return existing

  const [created] = await db
    .insert(profile)
    .values({ userId })
    .onConflictDoNothing()
    .returning()

  if (created) return created

  // Lost a race against a concurrent insert (the auth hook, or another
  // request doing the same fallback) — the row exists now, re-read it.
  const [row] = await db
    .select()
    .from(profile)
    .where(eq(profile.userId, userId))
    .limit(1)

  if (!row) throw new Error("profile missing after upsert")
  return row
}

export async function updateProfile(
  db: Database,
  userId: string,
  changes: { bio?: string | null; phone?: string | null }
): Promise<Profile> {
  await getOrCreateProfile(db, userId)

  const [row] = await db
    .update(profile)
    .set(changes)
    .where(eq(profile.userId, userId))
    .returning()

  return row!
}
```

`router.ts`:

```ts
export const me = os.profile.me
  .use(requireAuth)
  .handler(({ context }) => service.getOrCreateProfile(context.db, context.user.id))

export const update = os.profile.update
  .use(requireAuth)
  .handler(({ context, input }) => service.updateProfile(context.db, context.user.id, input))

export const profileRouter = { me, update }
```

Register in `packages/api/src/index.ts` alongside `post`.

## 5. Web — `apps/web/features/profile/`

A single page at a route TBD by whoever wires navigation (out of scope for
this spec — no app domain exists yet). Structure mirrors `features/post/`:
a page component that reads `orpc.profile.me` and a form component that
calls `orpc.profile.update` on submit, built on `UpdateProfileInput` from the
contract rather than a second, hand-written form schema.

## 6. Testing — `packages/api/src/domains/profile/router.test.ts`

Three cases, following the pattern in `post/router.test.ts`:

- `me` called with no existing row → returns a profile with `bio: null,
  phone: null` (the fallback creates it)
- `update` changes `bio`/`phone` and the new values come back
- either procedure called without a session → `UNAUTHORIZED`

## Migration ordering

Not a technical requirement — purely so the migration history reads
`auth → profile → post` rather than `auth → post → profile`, so that
deleting `post` later (per `docs/architecture.md` S14) doesn't leave the
project's own domain sandwiched behind the example. Confirmed with the user
that the local dev database holds no data worth preserving, so a full reset
is acceptable.

Executed entirely through `db:generate` — no hand-edited or renamed
migration folders (forbidden by `packages-db.md`: "the ledger of what has
been applied is keyed on those names"):

1. Comment out `export * from "./post"` in `packages/db/src/schema/index.ts`
   so drizzle-kit no longer sees the `post` table.
2. Delete the existing `post` migration folder
   (`20260813141309_conscious_maria_hill`).
3. Add `profile.ts` and its export.
4. Run `pnpm --filter @packages/db db:generate` → produces a fresh migration
   for `profile` alone, timestamped after the `auth` migration.
5. Restore the `post` export in `schema/index.ts`.
6. Run `db:generate` again → produces a fresh migration for `post` alone,
   timestamped after `profile`'s.
7. Reset the local dev database and run `db:migrate` from scratch.

Result: `auth` (1) → `profile` (2) → `post` (3). When `post` is deleted per
S14 with no real data deployed yet, that section's own instructions already
call for deleting all migration folders and generating one fresh migration
from what's left — so no further reordering is ever needed after this.

## Out of scope

- Any app-specific profile fields (role, preferences, avatar) — no app
  domain is defined yet; add those in their own migration when they are.
- Wiring a `/profile` route into navigation — no page structure exists
  beyond the `post` example yet.
