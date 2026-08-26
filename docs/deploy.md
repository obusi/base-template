# Deploy

Getting the app onto the internet, and giving every pull request a preview that
runs against a database of its own.

This assumes [`setup.md`](setup.md) is done: a Supabase project exists, the
schema is applied, `db:check` passes, and the branch rules are in place. Steps 1
and 2 here are enough to serve production. Steps 3 to 5 are what add previews,
and they are the half that costs money.

The host is Vercel and the database is Supabase. Neither is load-bearing —
`On another host` at the end says which parts are which.

## Requirements

| | Why |
|---|---|
| A Vercel account | Hobby is fine while the project is not commercial |
| **Supabase Pro** | Branching is a Pro feature. Steps 1–2 work without it; 3–5 do not |

Branching bills per branch-hour on top of the plan, and is not covered by the
organisation's spend cap. The branch limit in step 3 is what actually bounds it.

## 1. Create the Vercel project

**Add New → Project**, and pick the repository.

| Field | Value |
|---|---|
| Framework | Next.js — detected |
| **Root Directory** | **`apps/web`** |
| Build Command | leave on the default |
| Install Command | leave on the default |
| Node.js Version | 24.x — the default |

Leave the build command alone even though this is a monorepo.
`apps/web/vercel.json` already sets it, and it does more than build: it runs
`db:deploy` first, which is what puts a schema in a preview branch's database.
Overriding the field in the dashboard silently replaces that.

## 2. Production environment variables

Three, all scoped to **Production** only.

| Key | Type | Value |
|---|---|---|
| `DATABASE_URL` | **Secret** | the pooler string from `packages/db/.env` |
| `BETTER_AUTH_SECRET` | **Secret** | a fresh one — never the development value |
| `BETTER_AUTH_URL` | Config | the origin the browser will use |

`Secret` cannot be read back after saving, which is right for a database
password and a signing key. `BETTER_AUTH_URL` is deliberately `Config`: it is a
public URL, and when sign-in breaks it is the first thing worth reading.

Set all three **before the first deploy**. `next.config.ts` imports `./env` for
its side effect, so a missing variable fails the build rather than surfacing on
a request — see [`architecture.md`](architecture.md) S9.

Deploy, then check **Settings → Domains** for the domain actually assigned and
correct `BETTER_AUTH_URL` if it differs. Better Auth compares origins exactly,
and a mismatch reads as an unrelated bug.

That is production. Everything below is about previews.

## 3. Connect Supabase to GitHub

**Supabase → Project Settings → Integrations → GitHub → Authorize**, then pick
the repository.

| Setting | Value | Why |
|---|---|---|
| Working directory | `.` | |
| **Deploy to production** | **off** | |
| Automatic branching | on | this is the feature |
| Branch limit | 3 | the real cost control |
| **Supabase changes only** | **off** | |

The two that must be off are the two that arrive on:

**Deploy to production** lets Supabase apply changes to the production database
when a pull request merges. This repo's schema is managed by Drizzle, and a
second thing writing to production is a second source of truth for what the
schema is. It also syncs `config.toml`, whose default has the Data API on —
which step 2 of `setup.md` deliberately turned off.

**Supabase changes only** limits branch creation to pull requests that touch
`supabase/`. Migrations here live in `packages/db/drizzle/`, so with it on the
pull requests that change the schema are exactly the ones that get no database.

## 4. Connect Supabase to Vercel

From the same Integrations page, **Install Vercel integration**, then choose
**Specific Projects** rather than all — the integration can write environment
variables into whatever it can reach.

Then, in the connection's settings, **turn all three sync toggles off**:

```
Production   off
Preview      off
Development  off
```

All three do the same thing — copy this Supabase project's **production**
credentials into that Vercel environment — and differ only in the destination.
Nothing here reads them: no `@supabase/*` package is installed, and the database
is reached only through Drizzle.

Leaving **Preview** on would be the damaging one. It would hand preview
deployments the production database, which is the thing this whole section
exists to avoid. Supabase says so in that panel itself.

Branch credentials are a **separate mechanism** and are not affected by these
toggles: branching syncs each branch's own database to the Preview deployments
for that pull request. Turning all three off does not turn previews off.

> Turning a toggle off does not remove variables it already synced — the panel
> says as much. If it ran with **Production** on at any point, delete what it
> added from Vercel's Production scope by hand: every key with the Supabase
> icon, including `SUPABASE_SERVICE_ROLE_KEY` and `SUPABASE_SECRET_KEY`, which
> bypass RLS entirely and which nothing here uses. Turn the toggle off first,
> or they sync back.

## 5. Preview environment variables

Two, scoped to **Preview**.

| Key | Type | Value |
|---|---|---|
| `BETTER_AUTH_SECRET` | **Secret** | a fresh one, different from production's |
| `BETTER_AUTH_URL` | Config | the production origin |

A shared secret would make a session minted on a preview valid in production.

`BETTER_AUTH_URL` looks wrong here and is not. A preview's real hostname changes
with every build, so no fixed value can name it; `packages/auth/src/config.ts`
reads `VERCEL_URL` and `VERCEL_BRANCH_URL` for that. What is set here is the
canonical origin — the fallback for a request matching no known host, and what
`metadataBase` uses. Production's URL is a real, stable answer to both.

**Do not set `DATABASE_URL` for Preview.** Supabase supplies each branch's
database as `POSTGRES_URL`, and both `env.ts` files fall back to it. Setting
`DATABASE_URL` would override that and point every preview at one database.

**Do not set `BETTER_AUTH_ALLOWED_HOSTS`** either. It exists for a host Vercel
cannot report — a second custom domain, or another platform.

## What a normal deployment looks like

Opening a pull request usually produces **two** deployments, and the first one
is red:

```
1.  Vercel builds immediately          ❌  ~8s
       Supabase has not created the database yet, so POSTGRES_URL
       is missing and env validation fails the build.

2.  Supabase creates the branch, writes the variables,
    and asks Vercel to deploy again    ✅  ~1m
       db:deploy applies the migrations, then next build runs.
```

That first failure is the order the two services work in, not a sign of
anything wrong — and when Supabase happens to get there first, there is only
one deployment and it is green. Either way the build log is where to confirm
the schema arrived:

```
db:deploy: applying migrations to this preview's database
db:deploy: done
```

## Three things that will waste an afternoon

**Reopening a pull request is not opening one.** Supabase creates a database on
the `opened` event only. Reopen a closed pull request and its check reports
`skipping`, no database is created, and the build fails on a missing
`POSTGRES_URL` with nothing explaining why. Open a new pull request instead —
the same branch is fine.

**Supabase sometimes hands a branch a password its own database rejects.** The
build dies on

```
db:deploy: attempt 3 of 3 failed with 28P01. ...
PostgresError: password authentication failed for user "postgres"
```

and nothing about it improves with time. One branch refused the credentials it
had been given for half an hour — from the build and from a laptop alike, on
the pooler host and username the connection string itself named, while the
database was up and answering other queries. There is nothing to fix on this
side.

**Close the pull request and open a new one.** A new pull request gets a new
branch with new credentials, and those work. Reopening does not, for the reason
above. It is worth checking the deployments list first, though: a build red for
eight seconds is the ordinary first one and means nothing.

To rebuild after any preview failure, Redeploy is fine — Vercel reads the
current environment rather than the failed deployment's, which is exactly how
Supabase triggers the second build in the first place. Pushing a commit works
too, and has the advantage of being the thing you were going to do anyway.

**Preview variables that name a branch belong to that branch.** Vercel lists
them as `Preview ⑂ some-branch`. They are what that pull request's database is
reached through; deleting them breaks its preview. Only Production-scoped
entries are safe to tidy.

## On another host

Two pieces here are Vercel-specific and one is not.

`VERCEL_URL` and `VERCEL_BRANCH_URL` are read in
`packages/auth/src/config.ts` and are simply absent elsewhere, which leaves the
allowlist holding `BETTER_AUTH_URL`'s host alone. Somewhere else with changing
hostnames, name them through `BETTER_AUTH_ALLOWED_HOSTS`, and keep the patterns
narrow.

`POSTGRES_URL` is a name Supabase's Vercel integration chose. `DATABASE_URL` is
the one the ecosystem uses, and it wins wherever it is set, so nothing needs
undoing to deploy elsewhere.

`packages/db/scripts/deploy.ts` is the piece that would need a decision. It runs
migrations only when `VERCEL_ENV` is `preview`, and does nothing otherwise. On
another host, either give it that platform's equivalent signal or run migrations
from wherever that platform builds — the reasoning for keeping production out of
it is in [`architecture.md`](architecture.md) S17.
