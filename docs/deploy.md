# Deploy

Getting the app onto the internet, and giving every pull request a preview that
runs against a database of its own.

This assumes [`provisioning.md`](provisioning.md) is done: a Supabase project
exists, the
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
That file also sets `ignoreCommand`, which decides whether to build at all —
see `What a normal deployment looks like`. Overriding either field in the
dashboard silently replaces it.

## 2. Production environment variables

Three, all scoped to **Production** only.

| Key | Type | Value |
|---|---|---|
| `DATABASE_URL` | **Secret** | the pooler string from the Supabase dashboard |
| `BETTER_AUTH_SECRET` | **Secret** | a fresh one — never the string in `.env.example` |
| `BETTER_AUTH_URL` | Config | the origin the browser will use |

The development value is committed, deliberately and legibly — every clone of
this repository signs its local sessions with the same string. It is a session
forgery key anywhere it is reachable from the internet.

`Secret` cannot be read back after saving, which is right for a database
password and a signing key. `BETTER_AUTH_URL` is deliberately `Config`: it is a
public URL, and when sign-in breaks it is the first thing worth reading.

Add these only if report attachments are wanted — the app deploys fine without
them, minus the file picker:

| Key | Type | Value |
|---|---|---|
| `SUPABASE_URL` | Config | the project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | **Secret** | the `service_role` key, never `anon` |

They are a pair: storage counts as configured only when both are present, so
half of them is the same as neither. There is no third variable for the bucket
name — `supabase/config.toml` declares it and the code names the same string as
a constant. `architecture.md` S4 says why a bucket belongs to one domain, and
what a project adding a second one does instead.

And two more only if the app should offer Google sign-in:

| Key | Type | Value |
|---|---|---|
| `GOOGLE_CLIENT_ID` | Config | from the Google Cloud OAuth client |
| `GOOGLE_CLIENT_SECRET` | **Secret** | the same client's secret |

Also a pair, and absent is a supported state rather than a broken one: with
neither set, `packages/auth` does not register the provider and the sign-in page
renders no Google button — a button offering a door that cannot open is worse
than no button. Setting them also means registering this deployment's
`/api/auth/callback/google` as an authorised redirect URI on Google's side;
production and each preview hostname are different origins to Google.

**Scope the Supabase pair to Production only, and think before copying them to
Preview.**
The database is branched per pull request; the storage bucket is not. Pointing
previews at the same pair means a preview writes into the production bucket —
which may be what you want for one shared bin of screenshots, and is certainly
not what you want if a preview is ever handed to someone outside the team.

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
| **Deploy to production** | **on** | the only one that has to be changed |
| Production branch name | `main` | appears once the switch above is on |
| Automatic branching | on | this is the feature |
| Branch limit | 5 | the real cost control |
| **Supabase changes only** | **off** | |

**Deploy to production** is what makes `supabase/config.toml` a statement about
the hosted project and not only about a laptop. With it on, merging into `main`
pushes that file to production: `report-attachments` is created there with the
size limit and MIME list it was declared with, and a Supabase feature added to
the file a year from now arrives the same way, with nobody writing a deploy step
for it.

Schema is not part of that. `supabase/migrations/` is empty and
`[db.migrations]` is disabled, so Drizzle remains the only thing that writes
tables.

**The branch limit is only half of the arrangement. The other half is on
GitHub:** repository **Settings → General → Pull Requests → Automatically
delete head branches**, on. A Supabase preview branch is tied to a git branch,
so a branch left behind by a merged pull request keeps its database alive —
billing per branch-hour, holding a slot, and visible nowhere anybody looks. It
accumulates one per merge until the limit is reached, and then new pull
requests start failing for a reason that has nothing to do with them.

That switch fires on merge and not on close, so a pull request closed without
merging still leaves its branch behind. Those have to be deleted by hand, and
closing a pull request to reopen it as a fresh one — which the section below
recommends for a refused password — is exactly the case it does not cover.

Three things about the sync were measured on this project rather than assumed,
and each one matters:

- **It syncs the file, not the diff.** A merge pushes every line of
  `config.toml`, including lines no pull request has touched in months. A
  bucket that sat in `main` unnoticed appears on production at the next merge
  of something unrelated.
- **It creates; it never deletes.** Dropping a bucket's declaration leaves the
  bucket standing — on production and on preview branches alike. Deleting one
  is a dashboard job, always. A preview branch can look as though it deleted,
  but a branch built after the removal simply never held the bucket; ask it with
  two commits on one branch and it keeps the bucket too. Whether editing a
  declaration updates the live bucket was not tested — assume it does not, and
  check the dashboard.
- Therefore **production holds a superset of what the file declares**, and the
  gap only widens. `config.toml` does not tell you what is on the project. The
  dashboard does.

The file still describes a development machine, and that is the thing to watch:
a line edited to make local work nicer is now a production change, reviewed as
though it were not one. Anything that must differ between the two belongs in a
`[remotes.production]` block — that is what those blocks are for — rather than
in the top-level one.

**Supabase changes only** is the setting that must stay off. It limits branch creation to pull requests that touch
`supabase/`. Migrations here live in `packages/db/drizzle/`, so with it on the
pull requests that change the schema are exactly the ones that get no database —
while a pull request editing only the local dev config would get one it has no
use for.

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

### `FEATURES`, when there is unfinished work to look at

A feature flag hides work that has been merged but is not done, so the whole
point is that the value differs between the deployment reviewing that work and
the one serving people. Add it as a **Preview** variable **scoped to the branch**
— Vercel's environment editor takes a specific git branch beside the Preview
checkbox — so it reaches that pull request's deployment and no other:

| Key | Type | Value | Scope |
|---|---|---|---|
| `FEATURES` | Config | the flag names, comma-separated | Preview → that branch |

**Production never has it set.** A flag switched on there is a feature
released, which is a decision made by deleting the flag rather than by editing
a settings page.

Two things follow from where the value lives. It is read once when the process
starts, so changing it takes a redeploy — fine for work nobody has seen, and
useless as an emergency switch. And a name left set after its flag is deleted
from the code is warned about at startup and otherwise ignored, deliberately:
it must not be able to stop a deploy. Clearing it is still part of releasing —
`.claude/rules/packages-conventions.md` has the rest of that list.

**A preview signs itself in.** Each branch gets an empty database, and everyone
who signs up on it is a `user` — the column defaults to that — so a preview
with nothing done to it is one where `/admin` answers 404 for everybody,
including the person who opened the pull request. The build runs `pnpm seed`
straight after the migrations to fix that, and every preview arrives with:

| Email | Role | Password |
|---|---|---|
| `user@example.com` | `user` | `12345678` |
| `admin@example.com` | `admin` | `12345678` |

The same two accounts as a laptop, so a reviewer signs in with what they
already know rather than being handed a per-branch credential.

**Production is never seeded**, and the check is in `seed.ts` rather than in
`vercel.json`: one build command serves every deployment, so a decision written
into that string would create an admin on production whose password is printed
above. The script exits when `VERCEL_ENV` is set to anything but `preview`, and
runs when it is unset — a laptop, which is what `pnpm seed` is for.

Which makes **Vercel's Deployment Protection the thing standing between a
published password and an admin account.** It is on by default and covers every
preview URL; if you turn it off for a project, turn this off too.

## What a normal deployment looks like

Opening a pull request sets two services off in an order neither controls:

```
1.  Vercel starts immediately         ⏭  skipped
       Supabase has not created the database yet, so POSTGRES_URL
       is missing and there is nothing to deploy against.

2.  Supabase creates the branch, writes the variables,
    and asks Vercel to deploy again    ✅  ~1m
       db:deploy applies the migrations, seed creates the two
       accounts, then next build runs.
```

Step 1 used to be a red build — `next.config.ts` validates its environment at
build time, so a missing `POSTGRES_URL` failed it every time, for a reason that
was about to resolve itself. `ignoreCommand` in `apps/web/vercel.json` turns
that into a skip:

```
[ "$VERCEL_ENV" = preview ] && [ -z "$POSTGRES_URL$DATABASE_URL" ]
```

Vercel skips the build when that exits 0. It can only be true of a preview with
no database yet; **production always builds**, so a missing variable there still
fails loudly, which is the whole point of validating at build time.

A skipped deployment is listed as **`Canceled`**, not "skipped", and takes about
three seconds. It is the expected first row of every pull request, and its log
says so in as many words:

```
Running "sh -c '[ "$VERCEL_ENV" = preview ] && [ -z "$POSTGRES_URL$DATABASE_URL" ]'"
The Deployment has been canceled as a result of running the command
defined in the "Ignored Build Step" setting.
```

The cost of that is worth knowing: if the Supabase integration ever stops
writing the variables, no red build says so — the pull request simply never
gets a preview. **`Supabase Preview` on the pull request is where that shows**,
so it is the check to read when a preview does not appear.

If Supabase gets there first, step 1 never happens and there is one deployment.
Either way the build log is where to confirm the schema and the accounts
arrived:

```
db:deploy: applying migrations to this preview deployment's database
db:deploy: done
seed: created user@example.com (user) — password 12345678
seed: created admin@example.com (admin) — password 12345678
```

A pull request ends up with four checks, and only one of them is a gate:
`CI / verify` is the required one set by the branch rules, so a red Vercel or
Supabase check does not block a merge. That is deliberate — a preview failing
says nothing about whether the code is correct — but it does mean a merge can
go through without anyone having looked at the preview. Looking is the point of
having one.

## Merging a schema change

**Nothing to do.** The build runs `db:deploy` in front of `next build` on
production exactly as it does on a preview, so a merge migrates the database
before it serves the code that needs it. There is no hand-run step and no
window in which new code meets the old schema.

That is only safe because of the rule in
[`.claude/rules/packages-db.md`](../.claude/rules/packages-db.md): a migration
that reaches `main` is one the *previous* release can already run against, so
applying it ahead of its own deployment cannot break the code serving people at
that moment. A migration that drops a column drops one no deployed code has
read for a release; a migration that adds one adds something nothing has heard
of yet. Both are invisible to what is running.

`packages/db/src/migrations/safety.test.ts` is what keeps that true. It fails
the build on a generated migration that the previous release could not survive
— `DROP COLUMN`, `RENAME`, a new constraint, a `NOT NULL` column with no
default — unless the migration folder is named `destructive_…`, which is how
somebody says they meant it. **Do not switch that test off to unblock a merge.**
It is the reason the automatic path above is allowed to exist, and without it
a merge applies a schema change to production with nobody reading the SQL.

**Two merges in quick succession race, and lose safely.** Vercel does not
serialise deployments, and there is no lock. There does not need to be one:
this version of drizzle applies every pending migration inside a single
transaction, so the second build blocks on the first build's locks and then
fails and rolls back whole. The database is fully migrated or untouched, never
half of each, and the losing pull request is a red deployment to redeploy.
`packages/db/scripts/deploy.ts` explains why an advisory lock would read as a
guarantee it could not keep over Supabase's pooler.

**A failed migration fails the build.** `next build` never runs, so the
deployment does not go out and production keeps serving the previous one
against the schema it already had. That is the intended shape of the bad day:
no deploy rather than a half-migrated one.

`pnpm db:migrate` still exists and is still what a laptop uses — `db:deploy`
returns immediately when `VERCEL_ENV` is unset. Reach for it against production
only to apply something out of band, and know that the next merge will find its
ledger already ahead.

## Four things that will waste an afternoon

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
had been given for half an hour — from the build and from a laptop alike, on the
pooler host and username the connection string itself named, while the database
was up and answering other queries. There is nothing to fix on this side: close
the pull request and open a new one, which gets a new branch with new
credentials, and those work. Reopening does not, for the reason above.

Before doing that, it is worth being sure it is this and not a connection string
pointing somewhere wrong, because the two look identical from the build log.
Supabase's shared poolers answer differently, and that is the tell:

| Reply | Means |
|---|---|
| `28P01 password authentication failed` | the pooler knows this project — the password is wrong |
| `XX000 tenant/user … not found` | the pooler does not host this project — the host or username is wrong |

Point a client at `aws-1-<region>.pooler.supabase.com` as well as the `aws-0-`
one the string names. Whichever answers `28P01` is the right host, and a right
host with a rejected password is this problem.

To rebuild after any preview failure, Redeploy is fine — Vercel reads the
current environment rather than the failed deployment's, which is exactly how
Supabase triggers the second build in the first place. Pushing a commit works
too, and has the advantage of being the thing you were going to do anyway.

**A pull request that fails because the branch limit is full does not say
so.** What it looks like is a build failure: `Supabase Preview` goes red after
a few minutes, `Vercel` goes red behind it, and `verify` stays green — which
reads as a deployment problem in the change under review. It is not. No
database was created, so there was nothing for `db:deploy` to migrate.

The tell is that the same commit behaves differently on different attempts:
one pull request whose Vercel build fails and then passes on redeploy, the next
one failing earlier and harder. Nothing in the diff explains that, and nothing
in the diff is responsible.

Count the branches before changing any code — Supabase's **Branches** page, and
`git branch -r` for what GitHub still has. A merged pull request whose branch
was never deleted is the usual culprit, and it will not appear anywhere that
suggests it is holding a database open. Delete what is finished, then open a
fresh pull request.

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
migrations when `VERCEL_ENV` is `preview` or `production`, and does nothing
otherwise. On another host, either give it that platform's equivalent signal or
run migrations from wherever that platform builds — and keep whatever enforces
`.claude/rules/packages-db.md`, because that is what makes migrating on a deploy
safe rather than merely convenient. [`architecture.md`](architecture.md) S17 has
the reasoning.
