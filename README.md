# base-template

A typed full-stack monorepo to start projects from: **Next.js 16** on top of
**oRPC**, **Drizzle**, and **Better Auth**, with the boundaries between them
enforced by tooling rather than by convention.

Types flow from the database schema through the API contract to the browser
with no hand-written glue, so when something breaks it breaks in `tsc` rather
than at runtime. The one rule the whole layout exists to protect: **a page can
never reach the database directly**, only through a procedure that has already
run authorization.

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

| Package | Holds |
|---|---|
| `contract` | zod schemas + the oRPC contract — the API described, and nothing more |
| `db` | Drizzle schema, client, migrations |
| `auth` | Better Auth (server + client entry points) |
| `api` | The oRPC router, implementing the contract |
| `ui` | shadcn/ui components on Base UI + Tailwind v4 |

Five packages because merging any two breaks something specific — `contract`
must stay importable from a future Expo app without dragging in Drizzle, and
`db` must sit outside `api` or `auth → api → auth` becomes a cycle. The full
reasoning is in [`docs/architecture.md`](docs/architecture.md).

## What it ships

Structure, and as little product as possible — a fork inherits everything here
permanently, so anything a project could add later is deliberately absent.

**Sign-in, sign-up, password reset and an optional "Continue with Google"**,
wired to Better Auth. The Google button is not rendered until both credentials
are set, so a fresh clone never shows a door that cannot open.

**A user side and an admin side**, separated by one column — `profile.role` —
and by three route groups under `app/(app)/`, each with a layout that guards
what sits inside it. Nothing in the app grants the role; an endpoint that hands
out admin is a bigger risk than a one-off SQL statement.

**"Report a problem"**, in the account menu on every page. It captures the URL
and the user agent from the request rather than the form, takes up to three
screenshots straight into private object storage, and shows the result to
admins at `/admin/reports` behind signed URLs. This one is meant to stay —
every project needs a way for its users to say something is wrong. It is also
the worked example of a domain that touches all five packages and a bucket.

**A `post` domain that is meant to go**, kept only so `tsc` and Vitest have a
live end-to-end example to keep honest when oRPC or Drizzle changes an API.
Copy it as a pattern, then delete it — there is a skill that does the deleting.

## Getting started

Requires **Node 24+**, **pnpm 10**, and **Docker Desktop**. No accounts, and
nothing to create anywhere — Postgres and object storage run locally.

```bash
pnpm install
pnpm supabase:start
cp apps/web/.env.example apps/web/.env
cp packages/db/.env.example packages/db/.env
pnpm --filter @packages/db db:migrate
pnpm seed
pnpm dev
```

Nothing to fill in: every local value is a fixed one that Supabase's local stack
uses on every machine, so the two `.env` files are copies rather than forms.

The app runs at `http://localhost:3000` — `/posts` is a worked example, and the
interactive API docs are at `/api/docs`. `pnpm seed` creates
`user@example.com` and `admin@example.com`, both with the password `12345678`,
so the admin half of the app is visible without any setup.

[`docs/setup.md`](docs/setup.md) has the detail, plus the other half of the
file: what a real deployment needs, which is a Supabase project of its own.

When it is time to put it on the internet, [`docs/deploy.md`](docs/deploy.md)
covers that separately — including how each pull request gets a preview running
against a database of its own.

## Everyday commands

```bash
pnpm verify          # typecheck + lint + test + format:check — the full gate
pnpm dev
pnpm build
pnpm format
pnpm supabase:stop   # frees the memory; the data survives
pnpm supabase:reset  # wipes it and re-applies the migrations
pnpm seed            # the two development accounts, safe to run twice
```

Tests run against **PGlite** — Postgres compiled to WASM, in-process — so they
need no running database at all, and `pnpm verify` passes with Docker shut
down:

```bash
pnpm --filter @packages/api test
pnpm --filter @packages/db db:studio
```

To add a shadcn component (it lands in `packages/ui`, not in the app):

```bash
pnpm dlx shadcn@latest add button -c apps/web
```

## Starting a real project from this

Use GitHub's **"Use this template"** button. The histories are unrelated, so a
fork receives no later template updates — which is the main reason this repo
stays small.

Then run through [`docs/setup.md`](docs/setup.md), and S13 of
[`docs/architecture.md`](docs/architecture.md) for stripping the template out of
itself: the rename, deleting the `post` example domain (S14), and the passages
in `CLAUDE.md` that are only true while this is a template.

## Documentation

- [`docs/setup.md`](docs/setup.md) — what to do, once per project, to get this
  running against a database of your own.
- [`docs/deploy.md`](docs/deploy.md) — the same, for getting it hosted: the
  production deployment, and the preview-per-pull-request setup that gives each
  one its own database. Written down because most of it is not guessable.
- [`docs/architecture.md`](docs/architecture.md) — the single design document.
  Why the repo is shaped this way, the boundaries and how each is enforced, the
  security model, and S10, the library traps (`C1`…`C18`) that shaped it. Read
  the relevant section before changing a structural rule.
- [`CLAUDE.md`](CLAUDE.md) and `.claude/rules/` — instructions for AI coding
  agents: what is true everywhere, and what is true only in one package.
  Development here is AI-driven, with a human reviewing code and UI as the
  final gate.
