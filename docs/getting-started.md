# Getting started

Getting the app running on your own machine. It creates nothing anywhere and
needs no account: Postgres and object storage run in Docker, and every value the
two `.env` files need is already in the `.env.example` beside them, because none
of them is a secret.

Setting up a real deployment is a different job and lives in
[`provisioning.md`](provisioning.md); hosting it is
[`deploy.md`](deploy.md). This file says *what to do* — when a step turns on
something surprising, it links to [`architecture.md`](architecture.md), which
says *why*.

---

**Node 24+**, **pnpm 10**, and **Docker Desktop**, running.

## 1. Install

```bash
pnpm install
```

## 2. Start Postgres and Storage

```bash
pnpm supabase:start
```

The first run pulls a few images and takes some minutes; after that it is
seconds. It reads [`supabase/config.toml`](../supabase/config.toml), which
switches off everything this repo does not use — sessions are Better Auth's, and
the Data API is off in production too — and declares the
`report-attachments` bucket so it is created rather than clicked.

Five containers, of which two do the work:

| | |
|---|---|
| `db` | Postgres, on 54322 |
| `storage` + `kong` | the bucket, on 54321 |
| `studio` + `pg_meta` | the dashboard, on [54323](http://127.0.0.1:54323) |

Studio is worth the two containers for one thing `db:studio` cannot do: browse
the files in the bucket. Turn it off in `config.toml` if you disagree.

## 3. Copy the environment files

```bash
cp apps/web/.env.example apps/web/.env
cp packages/db/.env.example packages/db/.env
```

Two files because they belong to two processes — `next dev` reads the first,
the `drizzle-kit` commands read the second, and their `DATABASE_URL` must match.

Nothing to fill in. The URLs, the ports and the demo service-role key are the
same on every machine and in every project that runs Supabase locally, and
`BETTER_AUTH_SECRET` is a fixed development string that says what it is.

## 4. Apply the schema

```bash
pnpm db:migrate
```

## 5. Create the two development accounts

```bash
pnpm seed
```

The app is two apps either side of one column, so developing with only one role
means never seeing the other half:

| Email | Password | Sees |
|---|---|---|
| `user@example.com` | `12345678` | the ordinary app |
| `admin@example.com` | `12345678` | that, plus `/admin` |

Running it twice is safe — an account that already exists is skipped. Running
it against a database with no tables exits non-zero, on purpose: this is a
command someone typed, so it should fail where it can be seen rather than warn
and leave the accounts it promised missing.

The code is `packages/scripts/src/seed.ts`. It signs both accounts up through
Better Auth rather than inserting rows, because the password has to be hashed
the way sign-in will verify it — a SQL insert produces a row nobody can log in
as, which is also why `[db.seed]` is switched off in `supabase/config.toml`.

Sign up normally at `/signup` for a third account whenever you want one.

## 6. Run it

```bash
pnpm dev
```

The app is at `http://localhost:3000`, `/posts` is a worked example, and the
interactive API docs are at `/api/docs`.

## Everyday

```bash
pnpm supabase:stop     # frees the memory; the data survives
pnpm supabase:reset    # wipes it and re-applies the migrations
pnpm seed              # the two accounts again, on the empty database
```

Three separate situations rather than a sequence. In particular
**`supabase:reset` needs the stack running** — it talks to Postgres to drop and
recreate it, so straight after `supabase:stop` it fails with
`supabase start is not running`. Start it again first.

Stopping keeps everything: the data lives in two Docker volumes
(`supabase_db_…` and `supabase_storage_…`) that `stop` does not touch, so
`supabase:start` brings back the same tables, the same accounts and the same
uploaded files. Removing those volumes by hand is the only thing besides
`supabase:reset` that loses data.

`supabase:reset` also recreates the bucket from `config.toml` and empties it.
`pnpm seed` works while `pnpm dev` is running, so an empty database with a
working login is two commands and no restart.

