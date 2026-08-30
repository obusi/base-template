---
name: remove-example-domain
description: Delete the `post` example domain and every reference left behind — the five folders, the four files the compiler catches, the five it does not (comments, a pinned table list, and the post-sign-in destination), the appendix that documented it, and the migration that already created its table. Use this once a real domain exists and the example has served its purpose, on any phrasing like "delete the post example", "remove the example domain", "get rid of post", "we don't need the sample domain any more", "clean out the demo code", or when someone asks what is left of the template now that they have their own domains. Thai triggers - "ลบ post", "ลบ domain ตัวอย่าง", "เอา post ออก", "ไม่ใช้ example domain แล้ว", "ลบโค้ดตัวอย่างทิ้ง". Trigger even if they only name one part of it, since deleting the folders alone leaves nine references behind and five of them still compile.
argument-hint: "[deployed | not-deployed — whether the database is live yet]"
---

# Removing the example domain

`post` is a vertical slice through every layer, kept alive so that `tsc` and
Vitest go red when oRPC or Drizzle changes an API. Once a real domain exists it
has done its job, and leaving it costs a table in the database, a public
`/posts` route.

Deleting the folders is the easy part. The reason this is a skill is what the
folders leave behind: **nine files still refer to the domain, and only four of
them stop compiling.** The other five are comments, a pinned list of table
names, and a redirect target — perfectly valid code pointing at something that
no longer exists.

## What this needs from the person

One answer, which may already have arrived as an argument —
`/remove-example-domain not-deployed`. **Has this project's database been
deployed anywhere yet?** It decides how the migrations are handled, and the two
paths are not interchangeable — see below. Ask if it did not come in; do not
assume, because the wrong branch destroys the record of what a live database
already ran.

## Before touching anything

**Check `git status` is clean**, so the whole removal is one reviewable
`git diff` and one `git checkout .` away from undone.

**Confirm they mean it.** This deletes working code — a whole vertical slice
through five packages, plus the page that renders it.

The auth pages are **not** part of that. `app/signin/`, `app/signup/` and
`features/auth/` are real pages wired to Better Auth and they stay. What the
example owns is one line of theirs: `DEFAULT_DESTINATION` in
`features/auth/redirect.ts`, which the script rewrites from `/posts` to `/`.
Say so when reporting, because `/` is a placeholder rather than an answer.

## Run the mechanical half

```bash
node .claude/skills/remove-example-domain/scripts/remove.mjs
```

Add `--dry-run` first to see what it will touch.

It deletes the five paths, then makes the nine follow-up edits: the four the
compiler would catch (`contract/src/index.ts`, `api/src/index.ts`,
`db/src/schema/index.ts`, and the pinned table list in `rls-guard.test.ts`) and
the five it would not — comments in `lib/orpc-query.ts`, `lib/orpc.server.ts`
and `api/src/testing/index.ts`, the note `setup-project` leaves in `CLAUDE.md`,
and `DEFAULT_DESTINATION` in `features/auth/redirect.ts`. It also cuts S14 from
`docs/architecture.md`, and takes the appendix divider with it if S14 was the
last one standing.

`packages/api/src/testing/index.ts` **stays** — `signUpTestUser`, `contextFor`,
and `anonymousContext` belong to no domain, and every real domain's router tests
need them.

## The two decisions the script cannot make

**The migrations.** `packages/db/drizzle/` already contains a
`CREATE TABLE "post"`, and deleting the schema file does not undo it. Which fix
is right depends on something only the person knows:

- **Nothing deployed yet** — delete both migration folders and run
  `pnpm --filter @packages/db db:generate` once. That produces a single initial
  migration from the schema that is left, and is the cleanest possible history.
- **Already deployed anywhere** — leave the existing migrations alone and run
  `db:generate` to produce a normal drop migration. Rewriting applied migrations
  desynchronises the ledger from the database.

Ask which it is. Do not guess: the first option silently destroys the record of
what a deployed database already ran.

**The landing page.** `apps/web/app/(app)/(user)/page.tsx` may still link to
`/posts`, which
is now a 404. What belongs there instead is a product decision — ask rather than
invent, and if they have no answer, remove the dead link rather than replacing
it with filler.

## Finish

Two things have to happen before `pnpm verify` can pass, and both look like
mistakes if you meet them out of order:

**Handle the migration first.** Until you do, `rls-guard.test.ts` fails with

```
expected [ 'account', 'post', … ] to deeply equal [ 'account', 'session', … ]
```

That is the guard working, not a bug: the schema no longer declares the table
but the migrations still create it, and the test compares what the database
actually has against the pinned list. It is the most useful failure in this
whole process — it proves the two halves are checked against each other.

**Then clear `apps/web/.next`.** Next.js generates route types from the folders
under `app/`, and the ones for the deleted pages linger:

```
error TS2307: Cannot find module '../../../app/(app)/(user)/posts/page.js'
```

`rm -rf apps/web/.next` fixes it. Nothing regenerates those types until a dev
server or a build runs, so `tsc` keeps reading stale ones. A fresh clone never
sees this; anyone who has been running `pnpm dev` will.

Now run `pnpm verify`. This is the real proof, not a checklist: `tsc` covers
four of the nine edits and `rls-guard.test.ts` covers the pinned table list.
Green means the removal is complete — but note what green does **not** prove:
`DEFAULT_DESTINATION` compiles whatever it holds, so where it points is on you
to check.

Then confirm nothing still points at the deleted domain:

```bash
grep -rn "\bpost\b\|/posts\|PostSchema\|postRouter" --include=*.ts \
  --include=*.tsx --include=*.md --exclude-dir=node_modules . | grep -vi postgres
```

The `postgres` filter matters — the driver's name contains the word, and every
hit it produces is a false positive.

**Then delete this skill**: `rm -rf .claude/skills/remove-example-domain`. There
is nothing left for it to remove, and a skill that cannot run is clutter that
reads like an unfinished step.

Finally, show `git diff --stat`, say what changed, and note which migration path
was taken — that is the one decision here with consequences outside the repo.
Do not commit unless asked.
