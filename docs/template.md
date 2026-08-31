# Template

The parts of this repo that are about it *being a template*, rather than about
the stack. A real project deletes this file; the `setup-project` and
`remove-example-domain` skills do it between them, and neither touches anything
else in `docs/`.

Sections keep the ids they had when they lived in
[`architecture.md`](architecture.md) — S13 to S16 — because ids there are names
rather than positions, and a citation written before the move should still land
on the right section. Nothing in `architecture.md` cites any of them.

**One rule for anything that links here.** Every reference to `docs/template.md`
outside this file has to fit on a single line, because the two skills remove
those references by deleting the line that holds them. That is deliberately
blunter than matching a sentence: the previous arrangement had the two scripts
each holding their own copy of one paragraph, the copies drifted, and the file
was left describing an appendix that had just been cut.

---

## S13. Why this repo is a template

A base template that lets multiple projects start quickly on the same stack and
conventions.

Two more principles apply while that is true, on top of the three at the top of
[`architecture.md`](architecture.md):

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

1. **Rename.** `base-template` is the project's own name in seven places, four
   of which a user can see:

   | File | What it is |
   |---|---|
   | `package.json` | the workspace root's `name` |
   | `README.md` | the heading |
   | `architecture.md`, S2 | the tree diagram |
   | `apps/web/app/layout.tsx` | **the browser tab title**, and the `%s · …` template every route inherits |
   | `apps/web/app/api/spec/route.ts` | **the title in the published OpenAPI document** |
   | `apps/web/app/api/docs/route.ts` | **the tab title at `/api/docs`** |
   | `apps/web/features/auth/components/auth-header.tsx` | **the "Welcome to …" heading** on sign-in and sign-up, plus the screen-reader label beside the logo |

   The version in `api/spec/route.ts` is hard-coded separately from
   `package.json`; set it or wire the two together.
2. **Rewrite `apps/web/app/(app)/(user)/page.tsx`.** It is a placeholder that describes the
   template and links to the example domain.
3. **Delete this file.**
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
packages/shared/src/contract/domains/post/
packages/db/src/schema/post.ts
packages/api/src/domains/post/
apps/web/app/(app)/(user)/posts/
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
| `packages/shared/src/index.ts` | drop the `post` schema re-exports and the `post:` entry |
| `packages/api/src/index.ts` | drop `post: postRouter` |
| `packages/db/src/schema/index.ts` | drop `export * from "./post"` |
| `packages/db/src/schema/rls-guard.test.ts` | remove `"post"` from the pinned table list |
| `apps/web/app/(app)/(user)/page.tsx` | replace the placeholder landing page |
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
`pnpm db:generate` once to produce a single initial
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
  the `C` ids inside S10 had been doing correctly all along. The cost is that ids drift out
  of reading order as sections are added; that is the price of never rotting.
- **Where agent-facing rules live.** Three surfaces that do not overlap:

  | | Holds | Loaded |
  |---|---|---|
  | `CLAUDE.md` | What is true everywhere — purpose, commands, the package graph, the enforced boundaries, framework versions that differ from training data | every session |
  | `.claude/rules/*.md` | What is true in one surface, scoped by `paths:` frontmatter — one file each for `apps/web`, all packages, `api`, `db`, `shared`, and tests | when work touches the matching directory |
  | Code comments | Why *this line* is the way it is | when the file is read |

  A rule that only makes sense next to the code it constrains stays a comment;
  moving it into a rule file would strip the reasoning from the place it
  applies. There is no `AGENTS.md` — Claude Code reads `CLAUDE.md`, and this
  repo is Claude-Code-first in practice already.
