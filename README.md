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

## Getting started

Requires **Node 20.9+**, **pnpm 10**, and a Postgres database (Supabase is what
this is built against).

```bash
pnpm install
```

Then create the two env files from the examples beside them — `apps/web/.env`
and `packages/db/.env`. They are separate files because they belong to two
different processes, and the `DATABASE_URL` in each must match:

```bash
cp apps/web/.env.example apps/web/.env
cp packages/db/.env.example packages/db/.env
```

Apply the schema, then confirm the database is configured the way the security
model assumes:

```bash
pnpm --filter @packages/db db:migrate
pnpm --filter @packages/db db:check
```

`db:check` is worth not skipping. Every table ships with row-level security
enabled and zero policies, so a leaked anon key reads nothing — but that only
holds if the role in `DATABASE_URL` both owns the tables and bypasses RLS. Both
ways of getting it wrong are silent. S11 in
[`docs/architecture.md`](docs/architecture.md) has the two Supabase project
settings that matter, and what to check on any other host.

```bash
pnpm dev
```

The app runs at `http://localhost:3000`. `/posts` is a worked example — sign up
at `/login` first. Interactive API docs are at `/api/docs`.

## Everyday commands

```bash
pnpm verify          # typecheck + lint + test + format:check — the full gate
pnpm dev
pnpm build
pnpm format
```

Tests run against **PGlite** — Postgres compiled to WASM, in-process — so there
is no Docker daemon to start and no shared database to reset:

```bash
pnpm --filter @packages/api test
pnpm --filter @packages/db db:studio
```

To add a shadcn component (it lands in `packages/ui`, not in the app):

```bash
pnpm dlx shadcn@latest add button -c apps/web
```

## Starting a real project from this

Use GitHub's **"Use this template"** button. Note the tradeoff: the histories
are unrelated, so a fork receives no later template updates — which is the main
reason this repo stays small.

Then work through S11 in
[`docs/architecture.md`](docs/architecture.md). The short version:

1. Point it at your own database and run the two commands above.
2. Delete the `post` example domain once you have a real domain to replace it —
   S14 lists every file and every follow-up edit.
3. Strip the passages that are only true while this repo is a template,
   including the marked section in `CLAUDE.md`. S13 lists them.

## Documentation

- [`docs/architecture.md`](docs/architecture.md) — the single design document.
  Why the repo is shaped this way, the boundaries and how each is enforced, the
  security model, and S10, the library traps (`C1`…`C18`) that shaped it. Read
  the relevant section before changing a structural rule.
- [`CLAUDE.md`](CLAUDE.md) and `.claude/rules/` — instructions for AI coding
  agents: what is true everywhere, and what is true only in one package.
  Development here is AI-driven, with a human reviewing code and UI as the
  final gate.
